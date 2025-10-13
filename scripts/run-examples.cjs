const fs = require("fs");
const path = require("path");

async function main() {
  const outDir = path.resolve(__dirname, "..", "out");
  const astBuilderPath = path.join(outDir, "astBuilder.cjs");
  if (!fs.existsSync(astBuilderPath)) {
    console.error("Compiled AST bundle not found. Run npm run compile first.");
    process.exit(1);
  }

  // ensure a minimal vscode shim exists so compiled bundle can require('vscode')
  const shimDir = path.join(outDir, "node_modules", "vscode");
  const shimIndex = path.join(shimDir, "index.js");
  if (!fs.existsSync(shimIndex)) {
    fs.mkdirSync(shimDir, { recursive: true });
    fs.writeFileSync(
      shimIndex,
      `module.exports = {
  Range: class Range { constructor(sL, sC, eL, eC) { this.start = { line: sL, character: sC }; this.end = { line: eL, character: eC }; } },
  Diagnostic: class Diagnostic { constructor(range, message, severity) { this.range = range; this.message = message; this.severity = severity; } },
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
  TextEdit: { replace: (r, t) => ({ range: r, newText: t }) }
};
`
    );
  }

  const nmPath = path.join(outDir, "node_modules");
  if (!module.paths.includes(nmPath)) module.paths.unshift(nmPath);
  const { buildAST } = require(astBuilderPath);

  const exampleDir = path.resolve(__dirname, "..", "Example");
  if (!fs.existsSync(exampleDir)) {
    console.error("Example directory not found:", exampleDir);
    process.exit(1);
  }

  const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "package.json"), "utf8"));
  const defaultIndent =
    (pkg.contributes &&
      pkg.contributes.configuration &&
      pkg.contributes.configuration.properties &&
      pkg.contributes.configuration.properties["stalker2CfgValidator.tabWidth"] &&
      pkg.contributes.configuration.properties["stalker2CfgValidator.tabWidth"].default) ||
    3;

  const defaultTabWidth =
    (pkg.contributes &&
      pkg.contributes.configuration &&
      pkg.contributes.configuration.properties &&
      pkg.contributes.configuration.properties["stalker2CfgValidator.tabWidth"] &&
      pkg.contributes.configuration.properties["stalker2CfgValidator.tabWidth"].default) ||
    3;

  const files = fs.readdirSync(exampleDir).filter((f) => f.toLowerCase().endsWith(".cfg"));
  if (files.length === 0) {
    console.log("No .cfg files found in Example/");
    return;
  }

  console.log(`Scanning ${files.length} .cfg files in Example/`);

  for (const file of files) {
    const fp = path.join(exampleDir, file);
    const raw = fs.readFileSync(fp, "utf8");
    const lines = raw.split(/\r?\n/).map((l) => l.replace(/\t/g, " ".repeat(defaultTabWidth)));
    const doc = {
      uri: { fsPath: fp },
      lineCount: lines.length,
      lineAt(i) {
        const txt = lines[i] || "";
        return { text: txt, firstNonWhitespaceCharacterIndex: txt.search(/\S|$/) };
      },
    };
    const ast = buildAST(doc, defaultTabWidth, defaultIndent);
    const topLevelChildren = ast.children || [];
    const orphanEnds = topLevelChildren.filter((c) => c.type === "End").map((c) => c.startLine);
    console.log("\nFile:", file);
    console.log(
      "  lines:",
      lines.length,
      "top-level children:",
      topLevelChildren.length,
      "orphan struct.end count:",
      orphanEnds.length
    );
    if (orphanEnds.length > 0) {
      orphanEnds.slice(0, 10).forEach((ln) => {
        console.log(`   - line ${ln + 1}: ${doc.lineAt(ln).text}`);
        // show two lines of context before
        const before = Math.max(0, ln - 2);
        for (let k = before; k <= Math.min(lines.length - 1, ln + 2); k++) {
          console.log(`       ${k + 1}: ${doc.lineAt(k).text}`);
        }
      });
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
