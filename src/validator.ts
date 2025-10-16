import * as vscode from "vscode";
import {
  ASTNode,
  BlockNode,
  createDiagnostic,
  DocumentNode,
  InvalidNode,
  MalformedHeaderNode,
  PropertyNode,
} from "./ast";
import { buildAST } from "./parser";
import { Token, tokenize } from "./tokenizer";

/**
 * Traverses the AST and produces diagnostics for validation errors.
 */
export function validateDocument(
  document: vscode.TextDocument,
  tabWidth: number,
  indentLevel: number
): vscode.Diagnostic[] {
  const ast = buildAST(document, tabWidth, indentLevel);
  const diagnostics: vscode.Diagnostic[] = [];
  const lineTokens = tokenize(document);

  function push(line: number, character: number, message: string, severity: vscode.DiagnosticSeverity) {
    const lineLength = document.lineAt(line).text.length;
    const range = new vscode.Range(line, character, line, lineLength);
    diagnostics.push(createDiagnostic(range, message, severity));
  }

  const bracketStack: Token[] = [];
  for (const tokens of lineTokens) {
    for (const token of tokens) {
      if (token.type === "LBRACE" || token.type === "LBRACKET") {
        bracketStack.push(token);
      } else if (token.type === "RBRACE") {
        if (bracketStack.length === 0 || bracketStack[bracketStack.length - 1].type !== "LBRACE") {
          push(token.line, token.start, "Unexpected closing brace.", vscode.DiagnosticSeverity.Error);
        } else {
          bracketStack.pop();
        }
      } else if (token.type === "RBRACKET") {
        if (bracketStack.length === 0 || bracketStack[bracketStack.length - 1].type !== "LBRACKET") {
          push(token.line, token.start, "Unexpected closing bracket.", vscode.DiagnosticSeverity.Error);
        } else {
          bracketStack.pop();
        }
      }
    }
  }
  for (const token of bracketStack) {
    push(
      token.line,
      token.start,
      `Unclosed ${token.text === "{" ? "brace" : "bracket"}.`,
      vscode.DiagnosticSeverity.Warning
    );
  }

  const checkNode = (node: ASTNode, parent?: ASTNode) => {
    if (node.type === "Block") {
      const block = node as BlockNode;
      const knownKeys = new Set<string>();
      for (const child of block.children) {
        if (child.type === "Property") {
          const prop = child as PropertyNode;

          // Allow multiple '[*]' keys, as they represent array elements
          if (prop.key === "[*]") {
            continue;
          }

          if (knownKeys.has(prop.key)) {
            push(
              prop.startLine,
              prop.indent,
              `Duplicate property key "${prop.key}" in block "${block.header.name}".`,
              vscode.DiagnosticSeverity.Warning
            );
          } else {
            knownKeys.add(prop.key);
          }
        }
      }

      if (!/^[A-Za-z0-9_\-\.\[\]\*]+$/.test(block.header.name)) {
        push(
          block.startLine,
          0,
          `Invalid block name: "${block.header.name}". Block names can only contain alphanumeric characters, underscores, hyphens, periods, asterisks, and square brackets.`,
          vscode.DiagnosticSeverity.Warning
        );
      }

      const lineText = document.lineAt(block.startLine).text;
      const colonIndex = lineText.indexOf(":");
      if (colonIndex > 0 && lineText[colonIndex - 1] !== " " && lineText[colonIndex - 2] === " ") {
        push(
          block.startLine,
          colonIndex - 1,
          "Inconsistent spacing around ':'. Expected 'name : struct.begin'.",
          vscode.DiagnosticSeverity.Warning
        );
      }
      if (colonIndex > 0 && lineText[colonIndex + 1] !== " " && lineText[colonIndex + 2] === " ") {
        push(
          block.startLine,
          colonIndex + 1,
          "Inconsistent spacing around ':'. Expected 'name : struct.begin'.",
          vscode.DiagnosticSeverity.Warning
        );
      }

      if (parent && parent.type === "Block") {
        const expected = (parent as BlockNode).requiredContentIndent;
        if (block.header.indent < expected) {
          push(
            block.startLine,
            0,
            `Block header "${block.header.name}" should be indented at least ${expected} spaces (found ${block.header.indent}).`,
            vscode.DiagnosticSeverity.Warning
          );
        }
      }

      if (block.endLine == null) {
        push(
          block.startLine,
          0,
          `Block "${block.header.name}" was not closed. Missing "struct.end".`,
          vscode.DiagnosticSeverity.Error
        );
      }

      for (const child of block.children) {
        checkNode(child, block);
      }
    } else if (node.type === "End") {
      push(node.startLine, 0, `Found "struct.end" without a matching "struct.begin".`, vscode.DiagnosticSeverity.Error);
    } else if (node.type === "Property") {
      const prop = node as PropertyNode;
      if (!/^[A-Za-z0-9_\-\.\[\]\*]+$/.test(prop.key)) {
        push(
          prop.startLine,
          0,
          `Invalid property key: "${prop.key}". Property keys can only contain alphanumeric characters, underscores, hyphens, periods, asterisks, and square brackets.`,
          vscode.DiagnosticSeverity.Warning
        );
      }
      if (prop.value === "") {
        push(prop.startLine, 0, `Property "${prop.key}" has an empty value.`, vscode.DiagnosticSeverity.Warning);
      }
      if (parent && parent.type === "Block") {
        const expected = (parent as BlockNode).requiredContentIndent;
        if (prop.indent < expected) {
          push(
            prop.startLine,
            0,
            `Content inside block "${
              (parent as BlockNode).header.name
            }" should be indented at least ${expected} spaces (found ${prop.indent}).`,
            vscode.DiagnosticSeverity.Warning
          );
        }
      }
    } else if (node.type === "Invalid") {
      const invalid = node as InvalidNode;
      let message = `Invalid syntax: "${invalid.text}". Expected a property (key = value) or a block definition.`;
      if (/^(".*"|'.*')/.test(invalid.text)) {
        message = `Floating string literal found. All values must be part of a 'key = value' assignment.`;
      } else if (/^-?(\d+(\.\d*)?|\.\d+)(f)?$/.test(invalid.text)) {
        message = `Floating numeric literal found. All values must be part of a 'key = value' assignment.`;
      }
      push(invalid.startLine, invalid.indent, message, vscode.DiagnosticSeverity.Warning);
    } else if (node.type === "MalformedHeader") {
      const malformed = node as MalformedHeaderNode;
      const afterColon = malformed.text.split(":")[1]?.trim();
      if (afterColon && afterColon.includes("struct") && afterColon.includes("begin")) {
        push(
          malformed.startLine,
          0,
          `Possible typo in keyword. Did you mean 'struct.begin'?`,
          vscode.DiagnosticSeverity.Warning
        );
      } else {
        push(malformed.startLine, 0, `Expected 'struct.begin' after ':'.`, vscode.DiagnosticSeverity.Warning);
      }
    } else if (node.type === "Document") {
      (node as DocumentNode).children.forEach((child) => checkNode(child, node));
    }
  };

  checkNode(ast);
  return diagnostics;
}
