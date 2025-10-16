import * as vscode from "vscode";
import { ASTNode, DocumentNode, BlockNode, HeaderNode, EndNode, PropertyNode, createDiagnostic } from "./ast";
import { countIndentFromText, getTabWidth } from "./config";

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
  | "STRING"
  | "DOUBLE_STRING"
  | "INTEGER"
  | "FLOAT"
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

      // capture string literals
      if (ch === "'") {
        let endIdx = j + 1;
        while (endIdx < processUpTo) {
          if (lineText[endIdx] === "'") {
            // check for escaped quote
            if (endIdx + 1 < processUpTo && lineText[endIdx + 1] === "'") {
              endIdx += 2;
            } else {
              endIdx++;
              break;
            }
          } else {
            endIdx++;
          }
        }
        const txt = lineText.slice(j, endIdx);
        lineTokens.push({ type: "STRING", text: txt, line: i, start: j, end: endIdx });
        j = endIdx;
        continue;
      }

      if (ch === '"') {
        let endIdx = j + 1;
        while (endIdx < processUpTo) {
          if (lineText[endIdx] === '"') {
            // check for escaped quote
            if (endIdx + 1 < processUpTo && lineText[endIdx + 1] === '"') {
              endIdx += 2;
            } else {
              endIdx++;
              break;
            }
          } else {
            endIdx++;
          }
        }
        const txt = lineText.slice(j, endIdx);
        lineTokens.push({ type: "DOUBLE_STRING", text: txt, line: i, start: j, end: endIdx });
        j = endIdx;
        continue;
      }

      // capture numbers
      const numMatch = /^(-?(?:[0-9]+\.[0-9]*|\.[0-9]+)(?:f)?)|(^-?[0-9]+)/.exec(lineText.slice(j));
      if (numMatch) {
        const txt = numMatch[0];
        const type = numMatch[1] ? "FLOAT" : "INTEGER";
        lineTokens.push({ type, text: txt, line: i, start: j, end: j + txt.length });
        j += txt.length;
        continue;
      }

      // capture params token if we have a brace pair on the same line (e.g. {refkey=...})
      if (ch === "{") {
        const endIdx = lineText.indexOf("}", j + 1);
        if (endIdx >= 0 && endIdx < processUpTo) {
          const txt = lineText.slice(j, endIdx + 1);
          // push as PARAMS token so parser can consume it specially
          lineTokens.push({ type: "OTHER", text: txt, line: i, start: j, end: endIdx + 1 });
          j = endIdx + 1;
          continue;
        }
      }

      // identifier or other sequences
      const identMatch = /^[A-Za-z_][A-Za-z0-9_\-]*/.exec(lineText.slice(j));
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
      lineTokens.push({
        type: "COMMENT",
        text: lineText.slice(commentIdx),
        line: i,
        start: commentIdx,
        end: lineText.length,
      });
    }

    result.push(lineTokens);
  }
  return result;
}

// Build a simple AST from tokens. Keeps stack of open blocks.
export function buildAST(document: vscode.TextDocument, tabWidth: number, indentLevel: number): DocumentNode {
  const lineTokens = tokenize(document);
  const lines = document.lineCount;
  const root: DocumentNode = { type: "Document", startLine: 0, children: [] };

  type BeginRec = {
    startLine: number;
    name: string;
    indent: number;
    paramsRaw?: string;
    params?: Record<string, string>;
    endLine?: number;
  };
  const begins: BeginRec[] = [];
  const beginStack: number[] = [];
  const orphanEnds: number[] = [];
  const skipLines = new Set<number>();

  // UPDATED: Added \b word boundary to strictly match 'struct.begin' and prevent typos like 'struct.beginm'
  const headerRegex = /^(\s*)(.+?)\s*:\s*struct\.begin\b(?:\s+([\s\S]*))?$/;

  // First pass: collect begins and pair with ends using a stack
  for (let i = 0; i < lines; i++) {
    const text = document.lineAt(i).text;
    if (text.trim().length === 0) continue;

    // Detect struct.begin with strict word boundary
    // The previous regex already had \b, but here we explicitly use the strict headerRegex check.
    if (headerRegex.test(text)) {
      // try regex first to capture inline params
      const m = text.match(headerRegex);
      let name = "";
      let paramsRaw: string | undefined = undefined;
      let indent = countIndentFromText(text);
      if (m) {
        indent = countIndentFromText(m[1]);
        name = m[2].trim();
        paramsRaw = m[3];
      } else {
        // fallback: use tokens to find name left of 'struct'
        const tokens = lineTokens[i] || [];
        const structIdx = tokens.findIndex((t) => t.type === "IDENT" && t.text === "struct");
        if (structIdx > 0) {
          const colonIdx = tokens.findIndex((t) => t.type === "COLON");
          const nameTokens =
            colonIdx >= 0 && colonIdx < structIdx ? tokens.slice(0, colonIdx) : tokens.slice(0, structIdx);
          name = nameTokens
            .map((t) => t.text)
            .join("")
            .trim();
        }
      }
      // if params not inline, look ahead for brace-only block up to 5 lines
      if (!paramsRaw) {
        let acc = "";
        let open = 0;
        let found = false;
        // lookahead window: up to 5 lines (configurable by constant)
        const WINDOW = 5;
        for (let look = i + 1; look < Math.min(lines, i + 1 + WINDOW); look++) {
          const nxt = document.lineAt(look).text;
          if (nxt.trim().length === 0) continue;
          const firstNon = nxt.trimStart()[0];
          // ensure the param block respects indentation (must be at least header indent)
          const nxtIndent = countIndentFromText(nxt);
          if (firstNon !== "{" && open === 0) break;
          if (firstNon === "{" && nxtIndent < indent) break;
          for (const ch of nxt) {
            acc += ch;
            if (ch === "{") open++;
            if (ch === "}") {
              open = Math.max(0, open - 1);
              if (open === 0) {
                found = true;
                break;
              }
            }
          }
          if (found) {
            paramsRaw = acc;
            for (let s = i + 1; s <= look; s++) skipLines.add(s);
            break;
          }
        }
      }
      // Additionally: accept brace-only lines within the header window as params
      if (!paramsRaw) {
        const WINDOW = 3; // allow brace-only lines within next N non-empty lines
        let seen = 0;
        for (let k = i + 1; k < lines && seen < WINDOW; k++) {
          const ln = document.lineAt(k).text;
          if (ln.trim().length === 0) continue;
          seen++;
          const trimmed = ln.trim();
          if (/^\{[^}]*\}$/.test(trimmed)) {
            const nextIndent = countIndentFromText(ln);
            if (nextIndent >= indent) {
              paramsRaw = trimmed;
              skipLines.add(k);
              break;
            }
          }
        }
      }
      // parse paramsRaw into params (flags as true)
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
      const idx = begins.length;
      begins.push({ startLine: i, name, indent, paramsRaw, params, endLine: undefined });
      beginStack.push(idx);
      continue;
    }

    // UPDATED: Check for strict 'struct.end'.
    // This ensures the trimmed line is exactly "struct.end" and nothing else (e.g., no "struct.endd" or "struct.end something").
    if (/^struct\.end$/.test(text.trim())) {
      if (beginStack.length === 0) {
        orphanEnds.push(i);
      } else {
        const bidx = beginStack.pop()!;
        begins[bidx].endLine = i;
      }
      continue;
    }
  }

  // Build BlockNodes from begins
  // Heuristic pass: try to match orphan ends to the most recent unmatched begin before them
  if (orphanEnds.length > 0 && begins.length > 0) {
    const WINDOW_LINES = 500; // allow matching up to this many lines before the end
    const newOrphans: number[] = [];
    for (const eLine of orphanEnds) {
      const eIndent = countIndentFromText(document.lineAt(eLine).text);
      // find unmatched begins before eLine, most recent first
      const candidates = begins
        .map((b, idx) => ({ ...b, idx }))
        .filter((b) => b.startLine < eLine && b.endLine == null)
        .sort((a, b) => b.startLine - a.startLine);
      let matched = false;
      for (const c of candidates) {
        const distance = eLine - c.startLine;
        // prefer candidates within window and with indent <= end indent
        if (distance <= WINDOW_LINES && c.indent <= eIndent) {
          begins[c.idx].endLine = eLine;
          matched = true;
          break;
        }
      }
      if (!matched) {
        // fallback: accept the most recent unmatched begin within the window regardless of indent
        const fallback = candidates.find((c) => eLine - c.startLine <= WINDOW_LINES);
        if (fallback) {
          begins[fallback.idx].endLine = eLine;
          matched = true;
        }
      }
      if (!matched) newOrphans.push(eLine);
    }
    // replace orphanEnds with those we couldn't match
    orphanEnds.length = 0;
    for (const o of newOrphans) orphanEnds.push(o);
  }

  const blocks: BlockNode[] = begins.map(
    (b) =>
      ({
        type: "Block",
        startLine: b.startLine,
        header: {
          type: "Header",
          startLine: b.startLine,
          name: b.name,
          params: b.params,
          paramsRaw: b.paramsRaw,
          indent: b.indent,
        },
        children: [],
        headerIndent: b.indent,
        requiredContentIndent: b.indent + indentLevel,
        endLine: b.endLine,
      } as any)
  );

  // attach blocks into tree by containment (smallest enclosing parent)
  const findParentIdx = (idx: number) => {
    const b = begins[idx];
    let parent: number | undefined = undefined;
    for (let j = 0; j < begins.length; j++) {
      if (j === idx) continue;
      const p = begins[j];
      const pEnd = p.endLine == null ? Infinity : p.endLine;
      const bEnd = b.endLine == null ? Infinity : b.endLine;
      if (p.startLine < b.startLine && pEnd >= bEnd) {
        if (parent == null) parent = j;
        else if (begins[parent].startLine < p.startLine) parent = j;
      }
    }
    return parent;
  };

  const blockNodes: BlockNode[] = blocks;
  for (let i = 0; i < begins.length; i++) {
    const pidx = findParentIdx(i);
    if (pidx == null) {
      root.children.push(blockNodes[i]);
    } else {
      blockNodes[pidx].children.push(blockNodes[i]);
    }
  }

  // helper to find containing block (deepest) for a given line
  const findContainingBlock = (line: number): BlockNode | undefined => {
    let chosen: BlockNode | undefined = undefined;
    const visit = (nodes: BlockNode[]) => {
      for (const b of nodes) {
        if ((b as any).type !== "Block") continue;
        const start = (b as any).startLine;
        const end = (b as any).endLine == null ? Infinity : (b as any).endLine;
        if (start < line && line < end) {
          chosen = b;
          if (Array.isArray((b as any).children) && (b as any).children.length > 0) {
            visit((b as any).children as BlockNode[]);
          }
          return;
        }
      }
    };
    visit(root.children as BlockNode[]);
    return chosen;
  };

  // Second pass: attach properties and explicit EndNodes
  for (let i = 0; i < lines; i++) {
    if (skipLines.has(i)) continue;
    const text = document.lineAt(i).text;
    if (text.trim().length === 0) continue;
    // skip header lines
    if (begins.some((b) => b.startLine === i)) continue;
    // explicit end lines that closed a begin
    const endOwner = begins.findIndex((b) => b.endLine === i);
    if (endOwner >= 0) {
      // This end closes a recorded begin; we don't create a separate EndNode for matched ends
      // (the Block node has endLine populated). This keeps the AST tree simple.
      continue;
    }
    // orphan end
    if (orphanEnds.includes(i)) {
      const indent = countIndentFromText(document.lineAt(i).text);
      const endNode: EndNode = { type: "End", startLine: i, indent };
      root.children.push(endNode);
      continue;
    }
    // property assignment
    const tokens = lineTokens[i] || [];
    const eqIdx = tokens.findIndex((t) => t.type === "EQUAL");
    if (eqIdx > 0) {
      const key = tokens
        .slice(0, eqIdx)
        .map((t) => t.text)
        .join("");
      let valueText = document.lineAt(i).text.slice(tokens[eqIdx].end).trim();
      let propParamsRaw: string | undefined = undefined;
      // check for inline trailing {..} in the value
      const trailingMatch = valueText.match(/^(.*?)(\{\s*[^}]*\s*\})\s*$/);
      if (trailingMatch) {
        valueText = trailingMatch[1].trim();
        propParamsRaw = trailingMatch[2];
      } else {
        // lookahead for brace-only lines immediately after property (small window)
        const WINDOW = 2;
        const propIndent = countIndentFromText(document.lineAt(i).text);
        let seen = 0;
        for (let k = i + 1; k < lines && seen < WINDOW; k++) {
          const ln = document.lineAt(k).text;
          if (ln.trim().length === 0) continue;
          seen++;
          const trimmed = ln.trim();
          if (/^\{[^}]*\}$/.test(trimmed)) {
            const nextIndent = countIndentFromText(ln);
            if (nextIndent >= propIndent) {
              propParamsRaw = trimmed;
              skipLines.add(k);
              break;
            }
          }
        }
      }

      const prop: PropertyNode = {
        type: "Property",
        startLine: i,
        key: key.trim(),
        value: valueText,
        indent: countIndentFromText(document.lineAt(i).text),
        paramsRaw: propParamsRaw,
      };
      if (propParamsRaw) {
        const inner = propParamsRaw.replace(/^\{\s*/, "").replace(/\s*\}$/, "");
        const parts = inner
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean);
        if (parts.length > 0) {
          prop.params = {};
          for (const part of parts) {
            const eq = part.indexOf("=");
            if (eq <= 0) prop.params[part] = "true";
            else prop.params[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
          }
        }
      }
      const container = findContainingBlock(i);
      if (container) container.children.push(prop);
      else root.children.push(prop);
      continue;
    }
    // fallback line content
    const fallback: PropertyNode = {
      type: "Property",
      startLine: i,
      key: "_line",
      value: text.trim(),
      indent: countIndentFromText(document.lineAt(i).text),
    };
    const container = findContainingBlock(i);
    if (container) container.children.push(fallback);
    else root.children.push(fallback);
  }

  return root;
}

// Validate AST and return diagnostics. Uses basic rules similar to previous logic.
export function validateDocument(
  document: vscode.TextDocument,
  tabWidth: number,
  indentLevel: number
): vscode.Diagnostic[] {
  const ast = buildAST(document, tabWidth, indentLevel);
  const diagnostics: vscode.Diagnostic[] = [];

  function push(line: number, character: number, message: string, severity: vscode.DiagnosticSeverity) {
    const range = new vscode.Range(line, character, line, Math.max(1, document.lineAt(line).text.length));
    diagnostics.push(createDiagnostic(range, message, severity));
  }

  const lineTokens = tokenize(document);
  const bracketStack: Token[] = [];
  for (let i = 0; i < lineTokens.length; i++) {
    const tokens = lineTokens[i];
    let hasAssignment = false;
    for (let j = 0; j < tokens.length; j++) {
      const token = tokens[j];
      if (token.type === "EQUAL") {
        hasAssignment = true;
      }
      if (
        (token.type === "STRING" ||
          token.type === "DOUBLE_STRING" ||
          token.type === "INTEGER" ||
          token.type === "FLOAT") &&
        !hasAssignment
      ) {
        if (token.type === "INTEGER") {
          const prevToken = j > 0 ? tokens[j - 1] : null;
          const nextToken = j < tokens.length - 1 ? tokens[j + 1] : null;
          if (prevToken && prevToken.type === "LBRACKET" && nextToken && nextToken.type === "RBRACKET") {
            continue;
          }
        }
        push(
          token.line,
          token.start,
          `Floating value '${token.text}' is not part of an assignment.`,
          vscode.DiagnosticSeverity.Warning
        );
      }
      if (token.type === "STRING" && !token.text.endsWith("'")) {
        push(token.line, token.start, "Unclosed string literal.", vscode.DiagnosticSeverity.Error);
      }
      if (token.type === "DOUBLE_STRING" && !token.text.endsWith('"')) {
        push(token.line, token.start, "Unclosed string literal.", vscode.DiagnosticSeverity.Error);
      }
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
      vscode.DiagnosticSeverity.Error
    );
  }

  const checkNode = (node: any, parent?: any) => {
    if (node.type === "Block") {
      // header indent check vs parent
      if (parent && parent.type === "Block") {
        const expected = parent.requiredContentIndent ?? parent.headerIndent + tabWidth;
        if (node.header.indent < expected) {
          push(
            node.startLine,
            0,
            `Block header "${node.header.name}" should be indented at least ${expected} spaces (found ${node.header.indent}).`,
            vscode.DiagnosticSeverity.Error
          );
        }
      }
      // ensure end exists
      if (node.endLine == null) {
        push(
          node.startLine,
          0,
          `Block "${node.header.name}" was not closed. Missing "struct.end".`,
          vscode.DiagnosticSeverity.Error
        );
      }
      // validate params shape if present
      if (node.header.paramsRaw) {
        if (node.header.params == null) {
          let hint = "Expected { key=value, ... }";
          if (!node.header.paramsRaw.startsWith("{")) {
            hint = "Parameters must start with an opening brace '{'.";
          } else if (!node.header.paramsRaw.endsWith("}")) {
            hint = "Parameters must end with a closing brace '}'.";
          }
          push(
            node.startLine,
            0,
            `Malformed parameters for block "${node.header.name}". ${hint}`,
            vscode.DiagnosticSeverity.Warning
          );
        } else {
          // example rule: keys must be alphanumeric and values non-empty
          for (const k of Object.keys(node.header.params)) {
            const invalidChars = k.match(/[^A-Za-z0-9_\-]/g);
            if (invalidChars) {
              push(
                node.startLine,
                0,
                `Parameter name "${k}" contains invalid characters: ${invalidChars.join(
                  ", "
                )}. Only letters, numbers, underscores, and hyphens are allowed.`,
                vscode.DiagnosticSeverity.Warning
              );
            }
            const v = node.header.params[k];
            if (v === "") {
              push(
                node.startLine,
                0,
                `Parameter "${k}" has an empty value. This may not be intended. Consider removing it if it is not needed.`,
                vscode.DiagnosticSeverity.Warning
              );
            }
          }
        }
      }

      // Check for out-of-order array indices
      const arrayChildren = node.children.filter(
        (c: any) => c.type === "Property" && c.key.startsWith("[") && c.key.endsWith("]") && c.key !== "[*]"
      );
      if (arrayChildren.length > 1) {
        const indices = arrayChildren.map((c: any) => parseInt(c.key.slice(1, -1), 10));
        for (let i = 0; i < indices.length - 1; i++) {
          if (indices[i] > indices[i + 1]) {
            push(
              arrayChildren[i + 1].startLine,
              0,
              "Array elements are out of order.",
              vscode.DiagnosticSeverity.Warning
            );
            break;
          }
          if (indices[i] !== indices[i + 1] - 1) {
            push(
              arrayChildren[i + 1].startLine,
              0,
              `Non-sequential array index. Expected ${indices[i] + 1} but got ${indices[i + 1]}.`,
              vscode.DiagnosticSeverity.Warning
            );
          }
        }
      }

      // check children recursively
      for (const c of node.children) checkNode(c, node);
    } else if (node.type === "End") {
      // Only report orphan 'struct.end' when the End node is a top-level child
      // (i.e., parent is Document or undefined). End nodes inside Blocks are valid.
      if (!parent || parent.type === "Document") {
        // Suppress orphan diagnostic if this end is directly followed by a header or EOF
        const headerRegex = /^(\s*)(.+?)\s*:\s*struct\.begin\b(?:\s*(\{.*\}))?\s*$/;
        const doc = document as vscode.TextDocument;
        const lineCount = doc.lineCount;
        const ln = node.startLine;
        // find next non-empty line
        let nextIdx = ln + 1;
        while (nextIdx < lineCount && doc.lineAt(nextIdx).text.trim().length === 0) nextIdx++;
        const nextIsHeader = nextIdx < lineCount ? headerRegex.test(doc.lineAt(nextIdx).text) : true; // EOF -> treat as ok
        // Also suppress if this end is part of a run of consecutive top-level ends (multiple ends in row)
        let prevIdx = ln - 1;
        while (prevIdx >= 0 && doc.lineAt(prevIdx).text.trim().length === 0) prevIdx--;
        const prevIsEnd = prevIdx >= 0 ? /^\s*struct\.end\s*$/.test(doc.lineAt(prevIdx).text) : false;
        if (!nextIsHeader && !prevIsEnd) {
          push(
            node.startLine,
            0,
            `Found "struct.end" without a matching "struct.begin".`,
            vscode.DiagnosticSeverity.Error
          );
        }
      }
    } else if (node.type === "Property") {
      if (node.value === "") {
        push(node.startLine, 0, `Property "${node.key}" has an empty value.`, vscode.DiagnosticSeverity.Warning);
      }
      // optionally validate property indentation relative to enclosing block
      if (parent && parent.type === "Block") {
        const expected = parent.requiredContentIndent ?? parent.headerIndent + tabWidth;
        if (node.indent < expected) {
          push(
            node.startLine,
            0,
            `Content inside block "${parent.header.name}" should be indented at least ${expected} spaces (found ${node.indent}).`,
            vscode.DiagnosticSeverity.Warning
          );
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
export function formatDocument(
  document: vscode.TextDocument,
  indentLevel: number,
  tabWidth: number
): vscode.TextEdit[] {
  const ast = buildAST(document, tabWidth, indentLevel);
  const edits: vscode.TextEdit[] = [];

  const ensureIndent = (line: number, expected: number) => {
    // use character index for range end but compute actual indent based on tabWidth
    const text = document.lineAt(line).text;
    const actualChars = document.lineAt(line).firstNonWhitespaceCharacterIndex;
    const actual = countIndentFromText(text);
    if (actual !== expected) {
      // Normalize replacement text to spaces of length expected
      const range = new vscode.Range(line, 0, line, actualChars);
      edits.push(vscode.TextEdit.replace(range, " ".repeat(expected)));
    }
  };

  const walk = (node: any, parent?: any) => {
    if (node.type === "Block") {
      const expectedHeaderIndent =
        parent && parent.type === "Block" ? parent.requiredContentIndent ?? parent.headerIndent + indentLevel : 0;
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
