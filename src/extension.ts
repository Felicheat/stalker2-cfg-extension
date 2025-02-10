import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  // Create a diagnostics collection for validation errors/warnings.
  const diagnosticCollection = vscode.languages.createDiagnosticCollection('structValidator');

  // Validate the document whenever it is opened or changed.
  if (vscode.window.activeTextEditor) {
    updateDiagnostics(vscode.window.activeTextEditor.document, diagnosticCollection);
  }
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor) {
        updateDiagnostics(editor.document, diagnosticCollection);
      }
    })
  );
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(e => {
      updateDiagnostics(e.document, diagnosticCollection);
    })
  );
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(doc => {
      updateDiagnostics(doc, diagnosticCollection);
    })
  );

  // Register the document formatting provider for our language (here, "stalkercfg")
  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider('stalkercfg', new StructDocumentFormatter())
  );
}

//
// ---------------------- Validation Code ----------------------
//

interface BlockInfo {
  name: string;
  headerIndent: number;
  requiredContentIndent: number;
  line: number;
}

const requiredIndent = 2; // Minimal extra spaces required inside a block

/**
 * Validates the document by checking for:
 *  - Proper block header syntax (name, "struct.begin", optional parameters in { })
 *  - Matching "struct.end" tokens (with the same indentation as the block header)
 *  - Content lines indented at least requiredIndent spaces inside their block.
 */
function updateDiagnostics(document: vscode.TextDocument, diagnosticCollection: vscode.DiagnosticCollection): void {
  const diagnostics: vscode.Diagnostic[] = [];
  const stack: BlockInfo[] = [];

  // Regex for block headers:
  //   - captures leading whitespace (indentation)
  //   - captures block name (alphanumeric/underscore)
  //   - expects ": struct.begin"
  //   - optionally captures a parameter block (e.g. {key=value;...})
  const headerRegex = /^(\s*)([\w\d_]+)\s*:\s*struct\.begin(?:\s*(\{.*\}))?\s*$/;
  // Regex for a block end:
  const endRegex = /^(\s*)struct\.end\s*$/;

  for (let i = 0; i < document.lineCount; i++) {
    const line = document.lineAt(i);
    const text = line.text;
    if (text.trim().length === 0) continue; // Skip empty lines

    const headerMatch = text.match(headerRegex);
    if (headerMatch) {
      const indentStr = headerMatch[1];
      const headerIndent = indentStr.length;
      const blockName = headerMatch[2];
      const paramString = headerMatch[3];

      // If inside a parent block, enforce that this header is indented correctly.
      if (stack.length > 0) {
        const parent = stack[stack.length - 1];
        if (headerIndent < parent.requiredContentIndent) {
          const range = new vscode.Range(i, 0, i, text.length);
          diagnostics.push(new vscode.Diagnostic(
            range,
            `Block header "${blockName}" should be indented at least ${parent.requiredContentIndent} spaces (found ${headerIndent}).`,
            vscode.DiagnosticSeverity.Error
          ));
        }
      }

      // Check that any parameters (if present) are enclosed in braces and use key=value.
      if (paramString) {
        const paramTrimmed = paramString.trim();
        if (!paramTrimmed.startsWith('{') || !paramTrimmed.endsWith('}')) {
          const startIdx = text.indexOf(paramString);
          const range = new vscode.Range(i, startIdx, i, startIdx + paramString.length);
          diagnostics.push(new vscode.Diagnostic(
            range,
            `Parameters should be enclosed in { }.`,
            vscode.DiagnosticSeverity.Warning
          ));
        } else {
          const inner = paramTrimmed.substring(1, paramTrimmed.length - 1).trim();
          if (inner.length > 0) {
            const parts = inner.split(';');
            for (const part of parts) {
              if (part.trim().length === 0) continue;
              if (!part.includes('=')) {
                const startIdx = text.indexOf(part);
                const range = new vscode.Range(i, startIdx, i, startIdx + part.length);
                diagnostics.push(new vscode.Diagnostic(
                  range,
                  `Parameter "${part.trim()}" should be a key=value pair.`,
                  vscode.DiagnosticSeverity.Warning
                ));
              }
            }
          }
        }
      }

      // Push the block info on the stack.
      stack.push({
        name: blockName,
        headerIndent,
        requiredContentIndent: headerIndent + requiredIndent,
        line: i
      });
      continue;
    }

    const endMatch = text.match(endRegex);
    if (endMatch) {
      const indentStr = endMatch[1];
      const endIndent = indentStr.length;
      if (stack.length === 0) {
        const range = new vscode.Range(i, 0, i, text.length);
        diagnostics.push(new vscode.Diagnostic(
          range,
          `Found "struct.end" without a matching "struct.begin".`,
          vscode.DiagnosticSeverity.Error
        ));
      } else {
        const block = stack.pop()!;
        // Enforce that "struct.end" has the same indentation as the header.
        if (endIndent !== block.headerIndent) {
          const range = new vscode.Range(i, 0, i, text.length);
          diagnostics.push(new vscode.Diagnostic(
            range,
            `Block end indentation (${endIndent}) should match header indentation (${block.headerIndent}) for block "${block.name}".`,
            vscode.DiagnosticSeverity.Warning
          ));
        }
      }
      continue;
    }

    // For all other lines inside a block, check content indentation.
    if (stack.length > 0) {
      const parent = stack[stack.length - 1];
      const currentIndent = line.firstNonWhitespaceCharacterIndex;
      if (currentIndent < parent.requiredContentIndent) {
        const range = new vscode.Range(i, 0, i, text.length);
        diagnostics.push(new vscode.Diagnostic(
          range,
          `Line inside block "${parent.name}" should be indented at least ${parent.requiredContentIndent} spaces (found ${currentIndent}).`,
          vscode.DiagnosticSeverity.Warning
        ));
      }
    }
  }

  // Report any unclosed blocks.
  while (stack.length > 0) {
    const block = stack.pop()!;
    const lineText = document.lineAt(block.line);
    const range = new vscode.Range(block.line, 0, block.line, lineText.text.length);
    diagnostics.push(new vscode.Diagnostic(
      range,
      `Block "${block.name}" was not closed. Missing "struct.end".`,
      vscode.DiagnosticSeverity.Error
    ));
  }

  diagnosticCollection.set(document.uri, diagnostics);
}

//
// ---------------------- Formatting Code ----------------------
//

/**
 * This formatter reads the entire document, parses it line-by-line while using a stack to track
 * nested blocks, and then rebuilds the document text with corrected indentation.
 *
 * The rules are:
 *  - A block header line is written with the current indentation.
 *  - After a block header, the indent increases by requiredIndent.
 *  - A "struct.end" line is written with the indentation of its matching header.
 *  - Content lines inside a block are indented at the current level.
 */
class StructDocumentFormatter implements vscode.DocumentFormattingEditProvider {
  provideDocumentFormattingEdits(
    document: vscode.TextDocument,
    options: vscode.FormattingOptions,
    token: vscode.CancellationToken
  ): vscode.TextEdit[] {
    const formattedLines: string[] = [];
    const requiredIndent = 2;
    let currentIndent = 0;
    const indentStack: number[] = [];

    // Regular expressions to detect headers and ends.
    const headerRegex = /^(\s*)([\w\d_]+)\s*:\s*struct\.begin(?:\s*(\{.*\}))?\s*$/;
    const endRegex = /^(\s*)struct\.end\s*$/;

    // Process every line in the document.
    for (let i = 0; i < document.lineCount; i++) {
      // Trim leading and trailing whitespace.
      const originalLine = document.lineAt(i).text;
      const trimmedLine = originalLine.trim();

      // Preserve empty lines.
      if (trimmedLine.length === 0) {
        formattedLines.push('');
        continue;
      }

      const headerMatch = trimmedLine.match(headerRegex);
      if (headerMatch) {
        const blockName = headerMatch[2];
        const params = headerMatch[3] ? headerMatch[3].trim() : '';
        const formattedHeader = params.length > 0
          ? `${blockName} : struct.begin ${params}`
          : `${blockName} : struct.begin`;
        const indent = ' '.repeat(currentIndent);
        formattedLines.push(indent + formattedHeader);
        // Push current indent and increase for inner content.
        indentStack.push(currentIndent);
        currentIndent += requiredIndent;
        continue;
      }

      const endMatch = trimmedLine.match(endRegex);
      if (endMatch) {
        // Restore indentation to match the block header.
        if (indentStack.length > 0) {
          currentIndent = indentStack.pop()!;
        } else {
          currentIndent = 0;
        }
        const indent = ' '.repeat(currentIndent);
        formattedLines.push(indent + 'struct.end');
        continue;
      }

      // For regular lines, reapply the current indentation.
      const indent = ' '.repeat(currentIndent);
      formattedLines.push(indent + trimmedLine);
    }

    const formattedText = formattedLines.join('\n');
    const fullRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(document.getText().length)
    );
    return [vscode.TextEdit.replace(fullRange, formattedText)];
  }
}

export function deactivate() {}
