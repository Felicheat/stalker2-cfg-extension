const fs = require("fs");
const path = require("path");

async function main() {
  const outDir = path.resolve(__dirname, "..", "out");
  const astBuilderPath = path.join(outDir, "astBuilder.cjs");
  if (!fs.existsSync(astBuilderPath)) {
    console.error("Compiled AST bundle not found. Run npm run compile first.");
    process.exit(1);
  }
  const { formatDocument } = require(astBuilderPath);
  const examplePath = path.resolve(__dirname, "..", "Example", "ExampleNightvision.cfg");
  const destPath = path.resolve(__dirname, "..", "Example", "ExampleNightvision.formatted.cfg");
  const text = fs.readFileSync(examplePath, "utf8");
  const lines = text.split(/\r?\n/);
  const document = {
    uri: { fsPath: examplePath },
    lineCount: lines.length,
    lineAt(i) {
      return { text: lines[i] || "", firstNonWhitespaceCharacterIndex: (lines[i] || "").search(/\S|$/) };
    },
  };
  const edits = formatDocument(document, 3);
  // apply edits (assume edits only replace leading indent)
  const outLines = [...lines];
  for (const e of edits) {
    const lineIdx = e.range.start.line;
    const newIndent = e.newText;
    const content = outLines[lineIdx].trimStart();
    outLines[lineIdx] = newIndent + content;
  }
  fs.writeFileSync(destPath, outLines.join("\n"), "utf8");
  console.log("Wrote formatted file to", destPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
