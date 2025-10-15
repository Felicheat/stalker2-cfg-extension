import * as vscode from "vscode";

const DEFAULT_TAB_WIDTH = 3;
const DEFAULT_INDENT_LEVEL = 3;

export function getTabWidth(): number {
  const config = vscode.workspace.getConfiguration("stalker2CfgValidator");
  return config.get<number>("tabWidth", DEFAULT_TAB_WIDTH);
}

export function getIndentLevel(): number {
  const config = vscode.workspace.getConfiguration("stalker2CfgValidator");
  return config.get<number>("indentLevel", DEFAULT_INDENT_LEVEL);
}

export function countIndentFromText(s: string): number {
  let count = 0;
  const tabWidth = getTabWidth();
  for (const ch of s) {
    if (ch === " ") count += 1;
    else if (ch === "\t") count += tabWidth;
    else break;
  }
  return count;
}
