import * as vscode from "vscode";

// --- AST Node Definitions ---
export interface ASTNode {
  type: string;
  startLine: number;
}

export interface DocumentNode extends ASTNode {
  type: "Document";
  children: ASTNode[];
}

export interface BlockNode extends ASTNode {
  type: "Block";
  header: HeaderNode;
  children: ASTNode[];
  headerIndent: number;
  requiredContentIndent: number;
  endLine?: number;
}

export interface HeaderNode extends ASTNode {
  type: "Header";
  name: string;
  params?: Record<string, string>;
  paramsRaw?: string;
  indent: number;
}

export interface EndNode extends ASTNode {
  type: "End";
  indent: number;
}

export interface PropertyNode extends ASTNode {
  type: "Property";
  key: string;
  value: string;
  indent: number;
  paramsRaw?: string;
  params?: Record<string, string>;
}

export interface InvalidNode extends ASTNode {
  type: "Invalid";
  text: string;
  indent: number;
}

export interface MalformedHeaderNode extends ASTNode {
  type: "MalformedHeader";
  text: string;
  indent: number;
}

// --- Utility Functions ---
export function createDiagnostic(
  range: vscode.Range,
  message: string,
  severity: vscode.DiagnosticSeverity
): vscode.Diagnostic {
  return new vscode.Diagnostic(range, message, severity);
}

export function countIndentFromText(text: string, tabWidth: number = 2): number {
  let indent = 0;
  for (const char of text) {
    if (char === " ") {
      indent++;
    } else if (char === "\t") {
      indent += tabWidth;
    } else {
      break;
    }
  }
  return indent;
}

export function getTabWidth(document: vscode.TextDocument): number {
  const editorConfig = vscode.workspace.getConfiguration("editor", document.uri);
  const tabSize = editorConfig.get<number>("tabSize") || 2;
  return tabSize;
}
