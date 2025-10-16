import * as vscode from "vscode";
import {
  BlockNode,
  countIndentFromText,
  DocumentNode,
  EndNode,
  InvalidNode,
  MalformedHeaderNode,
  PropertyNode,
} from "./ast";
import { log } from "./logger";
import { tokenize } from "./tokenizer";

/**
 * Builds an AST from the document's text. This version uses a robust, stack-based
 * parsing approach that is immune to whitespace inconsistencies.
 */
export function buildAST(document: vscode.TextDocument, tabWidth: number, indentLevel: number): DocumentNode {
  log(`Starting AST build for: ${document.uri.fsPath}`);
  const lineTokens = tokenize(document);
  const lines = document.lineCount;
  const root: DocumentNode = { type: "Document", startLine: 0, children: [] };
  const blockStack: BlockNode[] = [];

  const headerRegex = /^(\s*)(.+?)\s*:\s*struct\.begin\b(?:\s*(\{[^}]*\}))?/;

  for (let i = 0; i < lines; i++) {
    const text = document.lineAt(i).text;
    const skipLines = new Set<number>();

    // Skip lines that are empty or were part of a multi-line param block or are a comment
    if (text.trim().length === 0 || skipLines.has(i) || text.trim().startsWith("//")) {
      continue;
    }

    // --- PRIORITY 1: Check for a valid 'struct.begin' header ---
    if (headerRegex.test(text)) {
      const m = text.match(headerRegex)!;
      const prefixWhitespace = m[1];
      const indent = countIndentFromText(prefixWhitespace, tabWidth);
      const name = m[2].trim();
      let paramsRaw = m[3];
      let params: Record<string, string> | undefined = undefined;
      if (paramsRaw) {
        const inner = paramsRaw.replace(/^\{\s*/, "").replace(/\s*\}$/, "");
        const parts = inner
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean);
        if (parts.length > 0) {
          params = {};
          for (const part of parts) {
            const eq = part.indexOf("=");
            if (eq <= 0) params[part] = "true";
            else params[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
          }
        }
      }

      const newBlock: BlockNode = {
        type: "Block",
        startLine: i,
        header: { type: "Header", startLine: i, name, indent, params, paramsRaw },
        children: [],
        headerIndent: indent,
        requiredContentIndent: indent + indentLevel,
      };

      if (blockStack.length > 0) {
        const parent = blockStack[blockStack.length - 1];
        parent.children.push(newBlock);
      } else {
        root.children.push(newBlock);
      }
      blockStack.push(newBlock);
      continue;
    }

    // --- PRIORITY 2: Check for a 'struct.end' ---
    if (/^struct\.end$/.test(text.trim())) {
      if (blockStack.length > 0) {
        const closedBlock = blockStack.pop()!;
        closedBlock.endLine = i;
      } else {
        root.children.push({ type: "End", startLine: i, indent: countIndentFromText(text, tabWidth) } as EndNode);
      }
      continue;
    }

    // --- PRIORITY 3: Check for a Property ('key = value') ---
    if (text.includes("=")) {
      const tokens = lineTokens[i] || [];
      const eqIdx = tokens.findIndex((t) => t.type === "EQUAL");
      if (eqIdx > 0) {
        const key = tokens
          .slice(0, eqIdx)
          .map((t) => t.text)
          .join("");
        let valueText = document.lineAt(i).text.slice(tokens[eqIdx].end).trim();
        const prop: PropertyNode = {
          type: "Property",
          startLine: i,
          key: key.trim(),
          value: valueText,
          indent: countIndentFromText(text, tabWidth),
        };
        if (blockStack.length > 0) {
          blockStack[blockStack.length - 1].children.push(prop);
        } else {
          root.children.push(prop);
        }
        continue;
      }
    }

    // --- PRIORITY 4: Check for a Malformed Header (potential typo) ---
    if (text.includes(":")) {
      const malformedHeader: MalformedHeaderNode = {
        type: "MalformedHeader",
        startLine: i,
        text: text.trim(),
        indent: countIndentFromText(text, tabWidth),
      };
      if (blockStack.length > 0) {
        blockStack[blockStack.length - 1].children.push(malformedHeader);
      } else {
        root.children.push(malformedHeader);
      }
      continue;
    }

    // --- PRIORITY 5: Default to InvalidNode ---
    const invalidNode: InvalidNode = {
      type: "Invalid",
      startLine: i,
      text: text.trim(),
      indent: countIndentFromText(text, tabWidth),
    };
    if (blockStack.length > 0) {
      blockStack[blockStack.length - 1].children.push(invalidNode);
    } else {
      root.children.push(invalidNode);
    }
  }

  log(`AST build finished. Found ${root.children.length} root node(s).`);
  return root;
}
