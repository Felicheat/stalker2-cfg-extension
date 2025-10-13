const fs = require('fs');
const path = require('path');

async function main() {
  const outDir = path.resolve(__dirname, '..', 'out');
  const astBuilderPath = path.join(outDir, 'astBuilder.cjs');
  if (!fs.existsSync(astBuilderPath)) {
    console.error('Compiled AST bundle not found. Run npm run compile first.');
    process.exit(1);
  }
  // ensure a minimal vscode shim exists so compiled bundle can require('vscode')
  const shimDir = path.join(outDir, 'node_modules', 'vscode');
  const shimIndex = path.join(shimDir, 'index.js');
  if (!fs.existsSync(shimIndex)) {
    fs.mkdirSync(shimDir, { recursive: true });
    fs.writeFileSync(shimIndex, `module.exports = {
  Range: class Range { constructor(sL, sC, eL, eC) { this.start = { line: sL, character: sC }; this.end = { line: eL, character: eC }; } },
  Diagnostic: class Diagnostic { constructor(range, message, severity) { this.range = range; this.message = message; this.severity = severity; } },
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
  TextEdit: { replace: (r, t) => ({ range: r, newText: t }) }
};
`);
  }

  // ensure Node can resolve 'vscode' from out/node_modules
  const nmPath = path.join(outDir, 'node_modules');
  if (!module.paths.includes(nmPath)) module.paths.unshift(nmPath);
  const { validateDocument, formatDocument } = require(astBuilderPath);
  const examplePath = path.resolve(__dirname, '..', 'Example', 'ExampleNightvision.cfg');
  if (!fs.existsSync(examplePath)) {
    console.error('Example file not found:', examplePath);
    process.exit(1);
  }
  const text = fs.readFileSync(examplePath, 'utf8');
  // Create a minimal document-like object used by the AST builder functions
  const lines = text.split(/\r?\n/);
  const document = {
    uri: { fsPath: examplePath },
    lineCount: lines.length,
    lineAt(i) {
      return { text: lines[i] || '', firstNonWhitespaceCharacterIndex: (lines[i] || '').search(/\S|$/) };
    }
  };

  const diagnostics = validateDocument(document);
  console.log('Diagnostics:');
  console.log(`  total: ${diagnostics.length}`);
  diagnostics.slice(0, 10).forEach(d => console.log(`- [${d.severity}] line ${d.range.start.line + 1}: ${d.message}`));
  if (diagnostics.length > 10) console.log(`  ...and ${diagnostics.length - 10} more`);

  const edits = formatDocument(document, 3);
  console.log('\nProposed edits:');
  console.log(`  total: ${edits.length}`);
  edits.slice(0, 20).forEach(e => console.log(`- replace line ${e.range.start.line + 1} indent with "${e.newText.replace(/\n/g, '\\n')}"`));
  if (edits.length > 20) console.log(`  ...and ${edits.length - 20} more`);
}

main().catch(e => { console.error(e); process.exit(1); });
