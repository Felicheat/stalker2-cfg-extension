import * as vscode from "vscode";
import { ASTNode, BlockNode, countIndentFromText, DocumentNode, InvalidNode, PropertyNode } from "./ast";
import { buildAST } from "./parser";
import { validateDocument } from "./validator";

/**
 * Traverses the AST and produces text edits to format the document.
 */
export function formatDocument(
  document: vscode.TextDocument,
  indentLevel: number,
  tabWidth: number
): vscode.TextEdit[] {
  const diagnostics = validateDocument(document, tabWidth, indentLevel);
  if (diagnostics.some((d) => d.severity === vscode.DiagnosticSeverity.Error)) {
    return [];
  }

  const ast = buildAST(document, tabWidth, indentLevel);
  const edits: vscode.TextEdit[] = [];

  const ensureIndent = (line: number, expected: number) => {
    const text = document.lineAt(line).text;
    const actualChars = document.lineAt(line).firstNonWhitespaceCharacterIndex;
    const actual = countIndentFromText(text, tabWidth);
    if (actual !== expected) {
      const range = new vscode.Range(line, 0, line, actualChars);
      edits.push(vscode.TextEdit.replace(range, " ".repeat(expected)));
    }
  };

  const walk = (node: ASTNode, parent?: ASTNode) => {
    if (node.type === "Block") {
      const block = node as BlockNode;
      const parentBlock = parent?.type === "Block" ? (parent as BlockNode) : undefined;
      const expectedHeaderIndent = parentBlock ? parentBlock.requiredContentIndent : 0;

      ensureIndent(block.startLine, expectedHeaderIndent);

      const currentHeaderIndent = countIndentFromText(document.lineAt(block.startLine).text, tabWidth);
      block.requiredContentIndent = currentHeaderIndent + indentLevel;

      for (const child of block.children) {
        walk(child, block);
      }
      if (block.endLine != null) {
        ensureIndent(block.endLine, currentHeaderIndent);
      }
    } else if (node.type === "Property") {
      const prop = node as PropertyNode;
      const parentBlock = parent?.type === "Block" ? (parent as BlockNode) : undefined;
      if (parentBlock) {
        ensureIndent(prop.startLine, parentBlock.requiredContentIndent);
      }
    } else if (node.type === "Invalid") {
      const invalidNode = node as InvalidNode;
      const parentBlock = parent?.type === "Block" ? (parent as BlockNode) : undefined;
      if (parentBlock) {
        ensureIndent(invalidNode.startLine, parentBlock.requiredContentIndent);
      }
    } else if (node.type === "Document") {
      (node as DocumentNode).children.forEach((c) => walk(c, node));
    }
  };

  walk(ast);
  return edits;
}
