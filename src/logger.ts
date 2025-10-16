import * as vscode from "vscode";

let outputChannel: vscode.OutputChannel;

/**
 * Initializes the output channel. Call this once from your extension's `activate` function.
 */
export function initializeLogger() {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel("Stalker CFG Parser");
  }
}

/**
 * Logs a message to the dedicated output channel with a timestamp.
 * @param message The message to log.
 */
export function log(message: string) {
  if (outputChannel) {
    const time = new Date().toLocaleTimeString();
    outputChannel.appendLine(`[${time}] ${message}`);
  }
}
