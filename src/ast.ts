import * as vscode from "vscode";

// Minimal AST node definitions for the stalkercfg format.
export type NodeType = "Document" | "Block" | "Header" | "End" | "Property";

export interface ASTNode {
  type: NodeType;
  startLine: number;
  endLine?: number;
}

export type Params = Record<string, string>;

export interface HeaderNode extends ASTNode {
  type: "Header";
  name: string;
  params?: Params;
  paramsRaw?: string; // raw text for fallback/error messages
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
  params?: Params;
}

export interface BlockNode extends ASTNode {
  type: "Block";
  header: HeaderNode;
  children: ASTNode[];
  headerIndent: number;
  requiredContentIndent: number;
}

export interface DocumentNode extends ASTNode {
  type: "Document";
  children: ASTNode[];
}

export function createDiagnostic(
  range: vscode.Range,
  message: string,
  severity: vscode.DiagnosticSeverity
): vscode.Diagnostic {
  const d = new vscode.Diagnostic(range, message, severity);
  return d;
}
