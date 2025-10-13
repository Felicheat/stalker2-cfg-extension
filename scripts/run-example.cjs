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

  // ensure Node can resolve 'vscode' from out/node_modules
  const nmPath = path.join(outDir, "node_modules");
  if (!module.paths.includes(nmPath)) module.paths.unshift(nmPath);
  const { validateDocument, formatDocument } = require(astBuilderPath);
  const { buildAST } = require(astBuilderPath);
  const examplePath = path.resolve(__dirname, "..", "Example", "ExampleNightvision.cfg");
  if (!fs.existsSync(examplePath)) {
    console.error("Example file not found:", examplePath);
    process.exit(1);
  }
  const text = fs.readFileSync(examplePath, "utf8");
  // Read settings from package.json config defaults (simple heuristic)
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

  // Create a minimal document-like object used by the AST builder functions
  // Expand tabs into spaces using tabWidth so the in-memory doc matches parser behavior
  const rawLines = text.split(/\r?\n/);
  const lines = rawLines.map((l) => l.replace(/\t/g, " ".repeat(defaultTabWidth)));
  const document = {
    uri: { fsPath: examplePath },
    lineCount: lines.length,
    lineAt(i) {
      const txt = lines[i] || "";
      return { text: txt, firstNonWhitespaceCharacterIndex: txt.search(/\S|$/) };
    },
  };

  const diagnostics = validateDocument(document, defaultTabWidth, defaultIndent);
  console.log("Diagnostics:");
  console.log(`  total: ${diagnostics.length}`);
  diagnostics
    .slice(0, 10)
    .forEach((d) => console.log(`- [${d.severity}] line ${d.range.start.line + 1}: ${d.message}`));
  if (diagnostics.length > 10) console.log(`  ...and ${diagnostics.length - 10} more`);

  const edits = formatDocument(document, defaultIndent, defaultTabWidth);
  console.log("\nProposed edits:");
  console.log(`  total: ${edits.length}`);
  edits
    .slice(0, 20)
    .forEach((e) =>
      console.log(`- replace line ${e.range.start.line + 1} indent with "${e.newText.replace(/\n/g, "\\n")}"`)
    );
  if (edits.length > 20) console.log(`  ...and ${edits.length - 20} more`);

  // Debug: build AST and show orphan End nodes attached to root
  const ast = buildAST(document, defaultTabWidth, defaultIndent);
  const orphanEnds = [];
  if (ast && Array.isArray(ast.children)) {
    for (const c of ast.children) {
      if (c.type === "End") orphanEnds.push(c.startLine);
    }
  }
  console.log("\nAST debug:");
  console.log(`  top-level children: ${ast.children.length}`);
  console.log(`  orphan struct.end (top-level) count: ${orphanEnds.length}`);
  orphanEnds.slice(0, 20).forEach((ln) => {
    const before = Array.from({ length: 2 }, (_, k) => document.lineAt(Math.max(0, ln - 2 + k)).text);
    console.log(`   - line ${ln + 1}: ${document.lineAt(ln).text}`);
    console.log("     context:");
    before.forEach((l, idx) => console.log(`       ${ln - 1 + idx}: ${l}`));
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
