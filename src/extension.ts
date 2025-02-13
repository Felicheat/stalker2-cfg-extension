import * as vscode from "vscode";

/**
 * Domain and configuration interfaces
 */
interface BlockInfo {
  name: string;
  headerIndent: number;
  requiredContentIndent: number;
  line: number;
}

/**
 * Service for reading configuration settings
 */
interface IIndentationService {
  getIndentLevel(): number;
}

class IndentationService implements IIndentationService {
  getIndentLevel(): number {
    const config = vscode.workspace.getConfiguration("stalker2CfgValidator");
    return config.get<number>("indentLevel", 2);
  }
}

/**
 * Processing state passed during document processing.
 */
interface ProcessingState {
  edits: vscode.TextEdit[];
  diagnostics: vscode.Diagnostic[];
  stack: BlockInfo[];
  indentLevel: number;
  document: vscode.TextDocument;
}

/**
 * A handler interface for a single line.
 */
interface ILineHandler {
  canHandle(lineText: string): boolean;
  handle(line: vscode.TextLine, lineIndex: number, state: ProcessingState): void;
}

/**
 * Handler for header lines (struct.begin)
 */
class HeaderLineHandler implements ILineHandler {
  private headerRegex = /^(\s*)(.+?)\s*:\s*struct\.begin(?:\s*(\{.*\}))?\s*$/;

  canHandle(lineText: string): boolean {
    return this.headerRegex.test(lineText);
  }

  handle(line: vscode.TextLine, lineIndex: number, state: ProcessingState): void {
    const match = line.text.match(this.headerRegex)!;
    const headerIndent = match[1].length;
    let blockName = match[2].trim();
    const paramString = match[3];

    // Additional check: Block header must either be an array (e.g., "[0]") or start with a letter.
    if (!/^(?:\[[^\]]+\]|.+)$/.test(blockName)) {
      const range = new vscode.Range(lineIndex, 0, lineIndex, line.text.length);
      state.diagnostics.push(
        new vscode.Diagnostic(
          range,
          `Block header should have a valid name or array index (e.g. "ItemGenerator" or "[0]"). Found: "${blockName}"`,
          vscode.DiagnosticSeverity.Warning
        )
      );
    }

    // Formatting: adjust header line indent to parent's required content indent (if any)
    let expectedIndent = 0;
    if (state.stack.length > 0) {
      expectedIndent = state.stack[state.stack.length - 1].requiredContentIndent;
    }
    const actualIndent = line.firstNonWhitespaceCharacterIndex;
    if (actualIndent !== expectedIndent) {
      const range = new vscode.Range(lineIndex, 0, lineIndex, actualIndent);
      state.edits.push(vscode.TextEdit.replace(range, " ".repeat(expectedIndent)));
    }

    // Diagnostics: if a header is underindented relative to its parent block, report error.
    if (state.stack.length > 0 && headerIndent < state.stack[state.stack.length - 1].requiredContentIndent) {
      const range = new vscode.Range(lineIndex, 0, lineIndex, line.text.length);
      state.diagnostics.push(
        new vscode.Diagnostic(
          range,
          `Block header "${blockName}" should be indented at least ${
            state.stack[state.stack.length - 1].requiredContentIndent
          } spaces (found ${headerIndent}).`,
          vscode.DiagnosticSeverity.Error
        )
      );
    }

    // Diagnostics: check parameters format if present.
    if (paramString) {
      const trimmedParam = paramString.trim();
      if (!trimmedParam.startsWith("{") || !trimmedParam.endsWith("}")) {
        const startIdx = line.text.indexOf(paramString);
        const range = new vscode.Range(lineIndex, startIdx, lineIndex, startIdx + paramString.length);
        state.diagnostics.push(
          new vscode.Diagnostic(range, `Parameters should be enclosed in { }`, vscode.DiagnosticSeverity.Warning)
        );
      }
    }

    // Push block info onto the stack.
    state.stack.push({
      name: blockName,
      headerIndent: headerIndent,
      requiredContentIndent: headerIndent + state.indentLevel,
      line: lineIndex,
    });
  }
}

/**
 * Handler for end lines (struct.end)
 */
class EndLineHandler implements ILineHandler {
  private endRegex = /^(\s*)struct\.end\s*$/;

  canHandle(lineText: string): boolean {
    return this.endRegex.test(lineText);
  }

  handle(line: vscode.TextLine, lineIndex: number, state: ProcessingState): void {
    const match = line.text.match(this.endRegex)!;
    const endIndent = match[1].length;
    const actualIndent = line.firstNonWhitespaceCharacterIndex;

    if (state.stack.length === 0) {
      // Diagnostics: orphan struct.end
      const range = new vscode.Range(lineIndex, 0, lineIndex, line.text.length);
      state.diagnostics.push(
        new vscode.Diagnostic(
          range,
          `Found "struct.end" without a matching "struct.begin".`,
          vscode.DiagnosticSeverity.Error
        )
      );
      // Formatting: force no indent
      if (actualIndent !== 0) {
        const range = new vscode.Range(lineIndex, 0, lineIndex, actualIndent);
        state.edits.push(vscode.TextEdit.replace(range, ""));
      }
    } else {
      const block = state.stack.pop()!;
      // Formatting: ensure end line has same indent as header.
      if (actualIndent !== block.headerIndent) {
        const range = new vscode.Range(lineIndex, 0, lineIndex, actualIndent);
        state.edits.push(vscode.TextEdit.replace(range, " ".repeat(block.headerIndent)));
      }
      // Diagnostics: check end indent matches header.
      if (endIndent !== block.headerIndent) {
        const range = new vscode.Range(lineIndex, 0, lineIndex, line.text.length);
        state.diagnostics.push(
          new vscode.Diagnostic(
            range,
            `Block end indentation (${endIndent}) should match block header indentation (${block.headerIndent}) for block "${block.name}".`,
            vscode.DiagnosticSeverity.Warning
          )
        );
      }
    }
  }
}

/**
 * Handler for content lines (all other nonblank lines)
 */
class ContentLineHandler implements ILineHandler {
  canHandle(lineText: string): boolean {
    // Content lines: any nonblank line that isnt a header or end.
    return lineText.trim().length > 0;
  }

  handle(line: vscode.TextLine, lineIndex: number, state: ProcessingState): void {
    if (state.stack.length > 0) {
      const expectedIndent = state.stack[state.stack.length - 1].requiredContentIndent;
      const actualIndent = line.firstNonWhitespaceCharacterIndex;
      // Formatting: adjust content indent
      if (actualIndent !== expectedIndent) {
        const range = new vscode.Range(lineIndex, 0, lineIndex, actualIndent);
        state.edits.push(vscode.TextEdit.replace(range, " ".repeat(expectedIndent)));
      }
      // Diagnostics: warn if content underindented
      if (actualIndent < expectedIndent) {
        const range = new vscode.Range(lineIndex, 0, lineIndex, line.text.length);
        state.diagnostics.push(
          new vscode.Diagnostic(
            range,
            `Content inside block "${
              state.stack[state.stack.length - 1].name
            }" should be indented at least ${expectedIndent} spaces (found ${actualIndent}).`,
            vscode.DiagnosticSeverity.Warning
          )
        );
      }
    }
  }
}

/**
 * A processor that iterates over document lines and applies handlers.
 */
class DocumentProcessor {
  private handlers: ILineHandler[];

  constructor(handlers: ILineHandler[]) {
    // Order matters: header and end handlers should be evaluated before generic content.
    this.handlers = handlers;
  }

  process(document: vscode.TextDocument, state: ProcessingState): void {
    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      if (line.text.trim().length === 0) continue;
      for (const handler of this.handlers) {
        if (handler.canHandle(line.text)) {
          handler.handle(line, i, state);
          break;
        }
      }
    }
    // Report unclosed blocks.
    while (state.stack.length > 0) {
      const block = state.stack.pop()!;
      const blockLine = document.lineAt(block.line);
      const range = new vscode.Range(block.line, 0, block.line, blockLine.text.length);
      state.diagnostics.push(
        new vscode.Diagnostic(
          range,
          `Block "${block.name}" was not closed. Missing "struct.end".`,
          vscode.DiagnosticSeverity.Error
        )
      );
    }
  }
}

/**
 * Folding Range Provider: allows collapsing nested blocks.
 */
class StalkercfgFoldingRangeProvider implements vscode.FoldingRangeProvider {
  provideFoldingRanges(
    document: vscode.TextDocument,
    context: vscode.FoldingContext,
    token: vscode.CancellationToken
  ): vscode.FoldingRange[] {
    const ranges: vscode.FoldingRange[] = [];
    const stack: { start: number; headerIndent: number; name: string }[] = [];
    const headerRegex = /^(\s*)(.+?)\s*:\s*struct\.begin(?:\s*(\{.*\}))?\s*$/;
    const endRegex = /^(\s*)struct\.end\s*$/;

    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      if (line.text.trim().length === 0) continue;

      const headerMatch = line.text.match(headerRegex);
      if (headerMatch) {
        stack.push({ start: i, headerIndent: headerMatch[1].length, name: headerMatch[2].trim() });
        continue;
      }

      const endMatch = line.text.match(endRegex);
      if (endMatch && stack.length > 0) {
        const block = stack.pop()!;
        // Create a folding range from the header line to the end line.
        // (You can adjust the range if you prefer to hide the header itself.)
        ranges.push(new vscode.FoldingRange(block.start, i, vscode.FoldingRangeKind.Region));
      }
    }
    return ranges;
  }
}

/**
 * Document Symbol Provider: creates an outline of blocks.
 */
class StalkercfgDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
  provideDocumentSymbols(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.DocumentSymbol[]> {
    const symbols: vscode.DocumentSymbol[] = [];
    const stack: vscode.DocumentSymbol[] = [];
    const headerRegex = /^(\s*)(.+?)\s*:\s*struct\.begin(?:\s*(\{.*\}))?\s*$/;
    const endRegex = /^(\s*)struct\.end\s*$/;

    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      if (line.text.trim().length === 0) continue;

      const headerMatch = line.text.match(headerRegex);
      if (headerMatch) {
        const indent = headerMatch[1].length;
        const name = headerMatch[2].trim();
        const symbol = new vscode.DocumentSymbol(
          name,
          "struct block",
          vscode.SymbolKind.Namespace,
          line.range,
          line.range
        );
        // Determine hierarchy: if the stack is empty, add to top-level.
        if (stack.length === 0) {
          symbols.push(symbol);
        } else {
          // If current header indent is greater than the last symbol's indent, nest it.
          const parent = stack[stack.length - 1];
          parent.children.push(symbol);
        }
        stack.push(symbol);
        continue;
      }

      const endMatch = line.text.match(endRegex);
      if (endMatch && stack.length > 0) {
        // Pop the last block symbol and update its range end.
        const symbol = stack.pop()!;
        symbol.range = new vscode.Range(symbol.range.start, line.range.end);
        symbol.selectionRange = symbol.range;
      }
    }
    return symbols;
  }
}

/**
 * Global singleton instances
 */
const indentationService: IIndentationService = new IndentationService();
const handlers: ILineHandler[] = [new HeaderLineHandler(), new EndLineHandler(), new ContentLineHandler()];
const processor = new DocumentProcessor(handlers);

/**
 * Debounce timer for incremental diagnostics.
 */
let diagnosticTimeout: NodeJS.Timeout | undefined;

/**
 * Updates diagnostics by processing the document.
 */
function updateDiagnostics(document: vscode.TextDocument, diagnosticCollection: vscode.DiagnosticCollection): void {
  const state: ProcessingState = {
    edits: [],
    diagnostics: [],
    stack: [],
    indentLevel: indentationService.getIndentLevel(),
    document,
  };

  processor.process(document, state);
  diagnosticCollection.set(document.uri, state.diagnostics);
}

/**
 * Extension activation: registers formatting, diagnostics, folding, and symbol providers.
 */
export function activate(context: vscode.ExtensionContext) {
  const diagnosticCollection = vscode.languages.createDiagnosticCollection("stalker2CfgValidator");

  // Incremental diagnostics with debouncing.
  if (vscode.window.activeTextEditor) {
    updateDiagnostics(vscode.window.activeTextEditor.document, diagnosticCollection);
  }
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (diagnosticTimeout) {
        clearTimeout(diagnosticTimeout);
      }
      diagnosticTimeout = setTimeout(() => {
        updateDiagnostics(e.document, diagnosticCollection);
      }, 300);
    })
  );
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        updateDiagnostics(editor.document, diagnosticCollection);
      }
    })
  );
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      updateDiagnostics(doc, diagnosticCollection);
    })
  );

  // Register document formatting provider.
  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider("stalkercfg", {
      provideDocumentFormattingEdits(
        document: vscode.TextDocument,
        options: vscode.FormattingOptions,
        token: vscode.CancellationToken
      ): vscode.TextEdit[] {
        const state: ProcessingState = {
          edits: [],
          diagnostics: [],
          stack: [],
          indentLevel: indentationService.getIndentLevel(),
          document,
        };
        processor.process(document, state);
        return state.edits;
      },
    })
  );

  // Register folding range provider.
  context.subscriptions.push(
    vscode.languages.registerFoldingRangeProvider("stalkercfg", new StalkercfgFoldingRangeProvider())
  );

  // Register document symbol provider.
  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider("stalkercfg", new StalkercfgDocumentSymbolProvider())
  );
}

export function deactivate() {}
