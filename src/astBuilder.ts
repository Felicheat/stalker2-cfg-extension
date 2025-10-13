import * as vscode from "vscode";
import {
  ASTNode,
  DocumentNode,
  BlockNode,
  HeaderNode,
  EndNode,
  PropertyNode,
  createDiagnostic,
} from "./ast";

// Token-level tokenizer. Produces tokens per line to enable richer parsing.
type TokenType =
  | "IDENT"
  | "LBRACE"
  | "RBRACE"
  | "COLON"
  | "EQUAL"
  | "DOT"
  | "LBRACKET"
  | "RBRACKET"
  | "COMMENT"
  | "OTHER";

interface Token {
  type: TokenType;
  text: string;
  line: number;
  start: number;
  end: number;
}

function tokenize(document: vscode.TextDocument): Token[][] {
  const result: Token[][] = [];
  for (let i = 0; i < document.lineCount; i++) {
    const lineText = document.lineAt(i).text;
    const lineTokens: Token[] = [];
    let j = 0;

    // check for comment start
    const commentIdx = lineText.indexOf("//");
    const processUpTo = commentIdx >= 0 ? commentIdx : lineText.length;

    while (j < processUpTo) {
      const ch = lineText[j];
      // whitespace
      if (ch === " " || ch === "\t") {
        j++;
        continue;
      }
      // punctuation
      if (ch === "{") {
        lineTokens.push({ type: "LBRACE", text: "{", line: i, start: j, end: j + 1 });
        j++;
        continue;
      }
      if (ch === "}") {
        lineTokens.push({ type: "RBRACE", text: "}", line: i, start: j, end: j + 1 });
        j++;
        continue;
      }
      if (ch === ":") {
        lineTokens.push({ type: "COLON", text: ":", line: i, start: j, end: j + 1 });
        j++;
        continue;
      }
      if (ch === "=") {
        lineTokens.push({ type: "EQUAL", text: "=", line: i, start: j, end: j + 1 });
        j++;
        continue;
      }
      if (ch === ".") {
        lineTokens.push({ type: "DOT", text: ".", line: i, start: j, end: j + 1 });
        j++;
        continue;
      }
      if (ch === "[") {
        lineTokens.push({ type: "LBRACKET", text: "[", line: i, start: j, end: j + 1 });
        j++;
        continue;
      }
      if (ch === "]") {
        lineTokens.push({ type: "RBRACKET", text: "]", line: i, start: j, end: j + 1 });
        j++;
        continue;
      }

      // identifier (including bracketed indices) or other sequences
      const identMatch = /^[A-Za-z_\[\]][A-Za-z0-9_\[\]\-]*/.exec(lineText.slice(j));
      if (identMatch) {
        const txt = identMatch[0];
        lineTokens.push({ type: "IDENT", text: txt, line: i, start: j, end: j + txt.length });
        j += txt.length;
        continue;
      }

      // otherwise consume a single other character (useful for values)
      lineTokens.push({ type: "OTHER", text: ch, line: i, start: j, end: j + 1 });
      j++;
    }

    // add comment token if present
    if (commentIdx >= 0) {
      lineTokens.push({ type: "COMMENT", text: lineText.slice(commentIdx), line: i, start: commentIdx, end: lineText.length });
    }

    result.push(lineTokens);
  }
  return result;
}

// Build a simple AST from tokens. Keeps stack of open blocks.
export function buildAST(document: vscode.TextDocument): DocumentNode {
  const lineTokens = tokenize(document);
  const root: DocumentNode = { type: "Document", startLine: 0, children: [] };
  const stack: BlockNode[] = [];

  for (let i = 0; i < lineTokens.length; i++) {
    const tokens = lineTokens[i];
    const text = document.lineAt(i).text;
    if (text.trim().length === 0) continue;

    // skip comment-only lines
    if (tokens.length === 0) continue;

    // Helper to find token by sequence
    const tok = (idx: number) => (idx >= 0 && idx < tokens.length ? tokens[idx] : undefined);

    // detect header: IDENT COLON IDENT('struct') DOT IDENT('begin') [LBRACE ... RBRACE]
    const first = tok(0);
    const second = tok(1);
    if (
      first && second &&
      first.type === "IDENT" &&
      second.type === "COLON"
    ) {
      // scan for struct.begin after colon
      // find index of IDENT 'struct'
      const structIdx = tokens.findIndex(t => t.type === "IDENT" && t.text === "struct");
      const dotIdx = structIdx >= 0 ? structIdx + 1 : -1;
      const beginIdx = dotIdx >= 0 ? dotIdx + 1 : -1;
      if (structIdx >= 0 && tok(dotIdx) && tok(beginIdx) && tok(dotIdx)!.type === "DOT" && tok(beginIdx)!.type === "IDENT" && tok(beginIdx)!.text === "begin") {
        const name = first.text;
        // optionally extract params between braces as raw substring
        const lbrace = tokens.find(t => t.type === "LBRACE");
        const rbrace = tokens.find(t => t.type === "RBRACE");
        const paramsRaw = lbrace && rbrace ? text.slice(lbrace.start, rbrace.end) : undefined;
        // parse paramsRaw like { key=value, other=val }
        let paramsObj: Record<string, string> | undefined = undefined;
        if (paramsRaw) {
          try {
            const inner = paramsRaw.slice(1, -1).trim();
            if (inner.length > 0) {
              paramsObj = {};
              const parts = inner.split(",").map(p => p.trim()).filter(Boolean);
              for (const part of parts) {
                const eq = part.indexOf("=");
                if (eq <= 0) {
                  // leave malformed value as-is; validation will catch
                  paramsObj[part] = "";
                } else {
                  const k = part.slice(0, eq).trim();
                  const v = part.slice(eq + 1).trim();
                  paramsObj[k] = v;
                }
              }
            }
          } catch {
            paramsObj = undefined;
          }
        }

        const headerNode: HeaderNode = {
          type: "Header",
          startLine: i,
          name,
          params: paramsObj,
          paramsRaw: paramsRaw,
          indent: document.lineAt(i).firstNonWhitespaceCharacterIndex,
        };
        const block: BlockNode = {
          type: "Block",
          startLine: i,
          header: headerNode,
          children: [],
          headerIndent: headerNode.indent,
          requiredContentIndent: headerNode.indent + 2,
        };
        if (stack.length === 0) root.children.push(block);
        else stack[stack.length - 1].children.push(block);
        stack.push(block);
        continue;
      }
    }

    // detect end: IDENT('struct') DOT IDENT('end') anywhere on the line
    const structTokenIdx = tokens.findIndex(t => t.type === "IDENT" && t.text === "struct");
    if (structTokenIdx >= 0) {
      const dot = tokens[structTokenIdx + 1];
      const endTok = tokens[structTokenIdx + 2];
      if (dot && dot.type === "DOT" && endTok && endTok.type === "IDENT" && endTok.text === "end") {
        const indent = document.lineAt(i).firstNonWhitespaceCharacterIndex;
        const endNode: EndNode = { type: "End", startLine: i, indent };
        if (stack.length === 0) {
          root.children.push(endNode);
        } else {
          const block = stack.pop()!;
          block.endLine = i;
          block.children.push(endNode);
        }
        continue;
      }
    }

    // detect assignment: IDENT EQUAL ...
    if (tokens.length >= 3 && tokens[0].type === "IDENT") {
      const eqIdx = tokens.findIndex(t => t.type === "EQUAL");
      if (eqIdx > 0) {
        const key = tokens.slice(0, eqIdx).map(t => t.text).join("");
        const valueText = text.slice(tokens[eqIdx].end).trim();
        const prop: PropertyNode = { type: "Property", startLine: i, key: key.trim(), value: valueText, indent: document.lineAt(i).firstNonWhitespaceCharacterIndex };
        if (stack.length === 0) root.children.push(prop);
        else stack[stack.length - 1].children.push(prop);
        continue;
      }
    }

    // fallback: treat as content/property with raw line text
    const fallback: PropertyNode = { type: "Property", startLine: i, key: "_line", value: text.trim(), indent: document.lineAt(i).firstNonWhitespaceCharacterIndex };
    if (stack.length === 0) root.children.push(fallback);
    else stack[stack.length - 1].children.push(fallback);
  }

  // any unclosed blocks: set endLine to last line
  while (stack.length > 0) {
    const b = stack.pop()!;
    b.endLine = document.lineCount - 1;
  }

  return root;
}

// Validate AST and return diagnostics. Uses basic rules similar to previous logic.
export function validateDocument(document: vscode.TextDocument): vscode.Diagnostic[] {
  const ast = buildAST(document);
  const diagnostics: vscode.Diagnostic[] = [];

  function push(line: number, message: string, severity: vscode.DiagnosticSeverity) {
    const range = new vscode.Range(line, 0, line, Math.max(1, document.lineAt(line).text.length));
    diagnostics.push(createDiagnostic(range, message, severity));
  }

  const checkNode = (node: any, parent?: any) => {
    if (node.type === "Block") {
      // header indent check vs parent
      if (parent && parent.type === "Block") {
        const expected = parent.requiredContentIndent ?? parent.headerIndent + 2;
        if (node.header.indent < expected) {
          push(node.startLine, `Block header "${node.header.name}" should be indented at least ${expected} spaces (found ${node.header.indent}).`, vscode.DiagnosticSeverity.Error);
        }
      }
      // ensure end exists
      if (node.endLine == null) {
        push(node.startLine, `Block "${node.header.name}" was not closed. Missing "struct.end".`, vscode.DiagnosticSeverity.Error);
      }
      // validate params shape if present
      if (node.header.paramsRaw && node.header.params == null) {
        push(node.startLine, `Malformed parameters for block "${node.header.name}". Expected { key=value, ... }`, vscode.DiagnosticSeverity.Warning);
      } else if (node.header.params) {
        // example rule: keys must be alphanumeric and values non-empty
        for (const k of Object.keys(node.header.params)) {
          if (!/^[A-Za-z0-9_\-]+$/.test(k)) {
            push(node.startLine, `Parameter name "${k}" looks invalid (allowed: A-Za-z0-9_-).`, vscode.DiagnosticSeverity.Warning);
          }
          const v = node.header.params[k];
          if (v === "") {
            push(node.startLine, `Parameter "${k}" has empty value or is malformed.`, vscode.DiagnosticSeverity.Warning);
          }
        }
      }
      // check children recursively
      for (const c of node.children) checkNode(c, node);
    } else if (node.type === "End") {
      // top-level end diagnostic
      // if no corresponding block around it, warn
      // (we detect orphan ends because buildAST attaches EndNode to root if orphan)
      // find previous sibling in ast
      // simple heuristic: if parent is Document and it's an End node that's not inside a block
      // We'll report orphan ends attached to root.
      // Implementation: handled in buildAST where orphan EndNodes are direct children of root
      // so check here:
      push(node.startLine, `Found "struct.end" without a matching "struct.begin".`, vscode.DiagnosticSeverity.Error);
    } else if (node.type === "Property") {
      // optionally validate property indentation relative to enclosing block
      if (parent && parent.type === "Block") {
        const expected = parent.requiredContentIndent ?? parent.headerIndent + 2;
        if (node.indent < expected) {
          push(node.startLine, `Content inside block "${parent.header.name}" should be indented at least ${expected} spaces (found ${node.indent}).`, vscode.DiagnosticSeverity.Warning);
        }
      }
    } else if (node.type === "Document") {
      for (const c of node.children) checkNode(c, node);
    }
  };

  checkNode(ast, undefined);
  return diagnostics;
}

// Format document: produce TextEdits similar to previous formatter.
export function formatDocument(document: vscode.TextDocument, indentLevel: number = 2): vscode.TextEdit[] {
  const ast = buildAST(document);
  const edits: vscode.TextEdit[] = [];

  const ensureIndent = (line: number, expected: number) => {
    const text = document.lineAt(line).text;
    const actual = document.lineAt(line).firstNonWhitespaceCharacterIndex;
    if (actual !== expected) {
      const range = new vscode.Range(line, 0, line, actual);
      edits.push(vscode.TextEdit.replace(range, " ".repeat(expected)));
    }
  };

  const walk = (node: any, parent?: any) => {
    if (node.type === "Block") {
      const expectedHeaderIndent = parent && parent.type === "Block" ? parent.requiredContentIndent ?? parent.headerIndent + indentLevel : 0;
      ensureIndent(node.startLine, expectedHeaderIndent);
      // update requiredContentIndent for children checks
      node.requiredContentIndent = node.headerIndent + indentLevel;
      for (const c of node.children) walk(c, node);
      if (node.endLine != null) {
        ensureIndent(node.endLine, node.headerIndent);
      }
    } else if (node.type === "Property") {
      if (parent && parent.type === "Block") {
        ensureIndent(node.startLine, parent.requiredContentIndent ?? parent.headerIndent + indentLevel);
      }
    } else if (node.type === "Document") {
      for (const c of node.children) walk(c, parent);
    }
  };

  walk(ast, undefined);
  return edits;
}
