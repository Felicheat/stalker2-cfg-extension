import * as vscode from "vscode";

import { validateDocument, formatDocument, buildAST } from "./astBuilder";
import { getIndentLevel, getTabWidth } from "./config";
import { ASTNode, BlockNode } from "./ast";

/**
 * Folding Range Provider: allows collapsing nested blocks.
 */
class StalkercfgFoldingRangeProvider implements vscode.FoldingRangeProvider {
  provideFoldingRanges(
    document: vscode.TextDocument,
    context: vscode.FoldingContext,
    token: vscode.CancellationToken
  ): vscode.FoldingRange[] {
    const tabWidth = getTabWidth();
    const indentLevel = getIndentLevel();
    const ast = buildAST(document, tabWidth, indentLevel);
    const ranges: vscode.FoldingRange[] = [];

    function collectFoldingRanges(node: ASTNode) {
      if (node.type === "Block") {
        const blockNode = node as BlockNode;
        if (blockNode.endLine !== undefined) {
          ranges.push(new vscode.FoldingRange(blockNode.startLine, blockNode.endLine, vscode.FoldingRangeKind.Region));
        }
        blockNode.children.forEach(collectFoldingRanges);
      }
    }

    ast.children.forEach(collectFoldingRanges);
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
    const tabWidth = getTabWidth();
    const indentLevel = getIndentLevel();
    const ast = buildAST(document, tabWidth, indentLevel);

    function collectSymbols(node: ASTNode): vscode.DocumentSymbol[] {
      const symbols: vscode.DocumentSymbol[] = [];
      if (node.type === "Block") {
        const blockNode = node as BlockNode;
        const range = new vscode.Range(
          blockNode.startLine,
          0,
          blockNode.endLine ?? blockNode.startLine,
          document.lineAt(blockNode.endLine ?? blockNode.startLine).text.length
        );
        const symbol = new vscode.DocumentSymbol(
          blockNode.header.name,
          "struct block",
          vscode.SymbolKind.Namespace,
          range,
          range
        );
        symbol.children = blockNode.children.flatMap(collectSymbols);
        symbols.push(symbol);
      }
      return symbols;
    }

    return ast.children.flatMap(collectSymbols);
  }
}

export function activate(context: vscode.ExtensionContext) {
  const diagnosticCollection = vscode.languages.createDiagnosticCollection("stalker2CfgValidator");
  let diagnosticTimeout: NodeJS.Timeout | undefined;

  function updateDiagnostics(document: vscode.TextDocument) {
    if (!/\.cfg$/i.test(document.uri.fsPath || document.fileName || "")) {
      diagnosticCollection.set(document.uri, []);
      return;
    }
    const tabWidth = getTabWidth();
    const indentLevel = getIndentLevel();
    const diagnostics = validateDocument(document, tabWidth, indentLevel);
    diagnosticCollection.set(document.uri, diagnostics);
  }

  if (vscode.window.activeTextEditor) {
    updateDiagnostics(vscode.window.activeTextEditor.document);
  }

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        updateDiagnostics(editor.document);
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (diagnosticTimeout) {
        clearTimeout(diagnosticTimeout);
      }
      diagnosticTimeout = setTimeout(() => updateDiagnostics(e.document), 300);
    })
  );

  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider("stalkercfg", {
      provideDocumentFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
        return formatDocument(document, getIndentLevel(), getTabWidth());
      },
    })
  );

  context.subscriptions.push(
    vscode.languages.registerFoldingRangeProvider("stalkercfg", new StalkercfgFoldingRangeProvider())
  );

  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider("stalkercfg", new StalkercfgDocumentSymbolProvider())
  );
}

export function deactivate() {}
