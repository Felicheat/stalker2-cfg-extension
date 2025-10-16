import * as vscode from "vscode";

export type TokenType =
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

export interface Token {
  type: TokenType;
  text: string;
  line: number;
  start: number;
  end: number;
}

export function tokenize(document: vscode.TextDocument): Token[][] {
  const result: Token[][] = [];
  for (let i = 0; i < document.lineCount; i++) {
    const lineText = document.lineAt(i).text;
    const lineTokens: Token[] = [];
    let j = 0;

    const commentIdx = lineText.indexOf("//");
    const processUpTo = commentIdx >= 0 ? commentIdx : lineText.length;

    while (j < processUpTo) {
      const ch = lineText[j];
      if (ch === " " || ch === "\t") {
        j++;
        continue;
      }
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

      if (ch === "'") {
        let endIdx = j + 1;
        while (endIdx < processUpTo) {
          if (lineText[endIdx] === "'") {
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

      const numMatch = /^(-?(?:[0-9]+\.[0-9]*|\.[0-9]+)(?:f)?)|(^-?[0-9]+)/.exec(lineText.slice(j));
      if (numMatch) {
        const txt = numMatch[0];
        const type = numMatch[1] ? "FLOAT" : "INTEGER";
        lineTokens.push({ type, text: txt, line: i, start: j, end: j + txt.length });
        j += txt.length;
        continue;
      }

      if (ch === "{") {
        const endIdx = lineText.indexOf("}", j + 1);
        if (endIdx >= 0 && endIdx < processUpTo) {
          const txt = lineText.slice(j, endIdx + 1);
          lineTokens.push({ type: "OTHER", text: txt, line: i, start: j, end: endIdx + 1 });
          j = endIdx + 1;
          continue;
        }
      }

      const identMatch = /^[A-Za-z_][A-Za-z0-9_\-]*/.exec(lineText.slice(j));
      if (identMatch) {
        const txt = identMatch[0];
        lineTokens.push({ type: "IDENT", text: txt, line: i, start: j, end: j + txt.length });
        j += txt.length;
        continue;
      }

      lineTokens.push({ type: "OTHER", text: ch, line: i, start: j, end: j + 1 });
      j++;
    }

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
