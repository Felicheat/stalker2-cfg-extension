import * as vscode from "vscode";

interface BlockInfo {
  name: string;
  headerIndent: number;
  requiredContentIndent: number;
  line: number;
}

function getIndentLevel(): number {
  const config = vscode.workspace.getConfiguration("stalker2CfgValidator");
  return config.get<number>("indentLevel", 2);
}

export function activate(context: vscode.ExtensionContext) {
  const diagnosticCollection = vscode.languages.createDiagnosticCollection("stalkercfgValidator");

  if (vscode.window.activeTextEditor) {
    updateDiagnostics(vscode.window.activeTextEditor.document, diagnosticCollection);
  }

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        updateDiagnostics(editor.document, diagnosticCollection);
      }
    })
  );
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      updateDiagnostics(e.document, diagnosticCollection);
    })
  );
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      updateDiagnostics(doc, diagnosticCollection);
    })
  );

  vscode.languages.registerDocumentFormattingEditProvider("stalkercfg", {
    provideDocumentFormattingEdits(
      document: vscode.TextDocument,
      options: vscode.FormattingOptions,
      token: vscode.CancellationToken
    ): vscode.TextEdit[] {
      const edits: vscode.TextEdit[] = [];
      const indentLevel = getIndentLevel(); // Read user-configured indent level
      const stack: { headerIndent: number; requiredContentIndent: number; line: number }[] = [];

      const headerRegex = /^(\s*)(.+?)\s*:\s*struct\.begin(?:\s*(\{.*\}))?\s*$/;
      const endRegex = /^(\s*)struct\.end\s*$/;

      for (let i = 0; i < document.lineCount; i++) {
        const line = document.lineAt(i);
        const text = line.text;
        if (text.trim().length === 0) continue;

        const headerMatch = text.match(headerRegex);
        if (headerMatch) {
          let expectedIndent = 0;
          if (stack.length > 0) {
            expectedIndent = stack[stack.length - 1].requiredContentIndent;
          }
          const actualIndent = line.firstNonWhitespaceCharacterIndex;
          if (actualIndent !== expectedIndent) {
            const range = new vscode.Range(i, 0, i, actualIndent);
            edits.push(vscode.TextEdit.replace(range, " ".repeat(expectedIndent)));
          }
          stack.push({
            headerIndent: expectedIndent,
            requiredContentIndent: expectedIndent + indentLevel,
            line: i,
          });
          continue;
        }

        const endMatch = text.match(endRegex);
        if (endMatch) {
          if (stack.length > 0) {
            const block = stack.pop()!;
            const expectedIndent = block.headerIndent;
            const actualIndent = line.firstNonWhitespaceCharacterIndex;
            if (actualIndent !== expectedIndent) {
              const range = new vscode.Range(i, 0, i, actualIndent);
              edits.push(vscode.TextEdit.replace(range, " ".repeat(expectedIndent)));
            }
          } else {
            const actualIndent = line.firstNonWhitespaceCharacterIndex;
            if (actualIndent !== 0) {
              const range = new vscode.Range(i, 0, i, actualIndent);
              edits.push(vscode.TextEdit.replace(range, ""));
            }
          }
          continue;
        }

        if (stack.length > 0) {
          const expectedIndent = stack[stack.length - 1].requiredContentIndent;
          const actualIndent = line.firstNonWhitespaceCharacterIndex;
          if (actualIndent !== expectedIndent) {
            const range = new vscode.Range(i, 0, i, actualIndent);
            edits.push(vscode.TextEdit.replace(range, " ".repeat(expectedIndent)));
          }
        }
      }
      return edits;
    },
  });
}

function updateDiagnostics(document: vscode.TextDocument, diagnosticCollection: vscode.DiagnosticCollection): void {
  const diagnostics: vscode.Diagnostic[] = [];
  const stack: BlockInfo[] = [];
  const indentLevel = getIndentLevel(); // Use user-configured indent level

  const headerRegex = /^(\s*)(.+?)\s*:\s*struct\.begin(?:\s*(\{.*\}))?\s*$/;
  const endRegex = /^(\s*)struct\.end\s*$/;

  for (let i = 0; i < document.lineCount; i++) {
    const line = document.lineAt(i);
    const text = line.text;
    if (text.trim().length === 0) continue;

    const headerMatch = text.match(headerRegex);
    if (headerMatch) {
      const headerIndent = headerMatch[1].length;
      const blockName = headerMatch[2].trim();
      const paramString = headerMatch[3];

      if (stack.length > 0) {
        const parent = stack[stack.length - 1];
        if (headerIndent < parent.requiredContentIndent) {
          const range = new vscode.Range(i, 0, i, text.length);
          diagnostics.push(
            new vscode.Diagnostic(
              range,
              `Block header "${blockName}" should be indented at least ${parent.requiredContentIndent} spaces (found ${headerIndent}).`,
              vscode.DiagnosticSeverity.Error
            )
          );
        }
      }

      if (paramString) {
        const trimmedParam = paramString.trim();
        if (!trimmedParam.startsWith("{") || !trimmedParam.endsWith("}")) {
          const startIdx = text.indexOf(paramString);
          const range = new vscode.Range(i, startIdx, i, startIdx + paramString.length);
          diagnostics.push(
            new vscode.Diagnostic(range, `Parameters should be enclosed in { }.`, vscode.DiagnosticSeverity.Warning)
          );
        }
      }

      stack.push({
        name: blockName,
        headerIndent: headerIndent,
        requiredContentIndent: headerIndent + indentLevel,
        line: i,
      });
      continue;
    }

    const endMatch = text.match(endRegex);
    if (endMatch) {
      const endIndent = endMatch[1].length;
      if (stack.length === 0) {
        const range = new vscode.Range(i, 0, i, text.length);
        diagnostics.push(
          new vscode.Diagnostic(
            range,
            `Found "struct.end" without a matching "struct.begin".`,
            vscode.DiagnosticSeverity.Error
          )
        );
      } else {
        const block = stack.pop()!;
        if (endIndent !== block.headerIndent) {
          const range = new vscode.Range(i, 0, i, text.length);
          diagnostics.push(
            new vscode.Diagnostic(
              range,
              `Block end indentation (${endIndent}) should match block header indentation (${block.headerIndent}) for block "${block.name}".`,
              vscode.DiagnosticSeverity.Warning
            )
          );
        }
      }
      continue;
    }

    if (stack.length > 0) {
      const expectedIndent = stack[stack.length - 1].requiredContentIndent;
      const contentIndent = line.firstNonWhitespaceCharacterIndex;
      if (contentIndent < expectedIndent) {
        const range = new vscode.Range(i, 0, i, text.length);
        diagnostics.push(
          new vscode.Diagnostic(
            range,
            `Content inside block "${
              stack[stack.length - 1].name
            }" should be indented at least ${expectedIndent} spaces (found ${contentIndent}).`,
            vscode.DiagnosticSeverity.Warning
          )
        );
      }
    }
  }

  while (stack.length > 0) {
    const block = stack.pop()!;
    const blockLine = document.lineAt(block.line);
    const range = new vscode.Range(block.line, 0, block.line, blockLine.text.length);
    diagnostics.push(
      new vscode.Diagnostic(
        range,
        `Block "${block.name}" was not closed. Missing "struct.end".`,
        vscode.DiagnosticSeverity.Error
      )
    );
  }

  diagnosticCollection.set(document.uri, diagnostics);
}

export function deactivate() {}
