const fs = require('fs');
const path = require('path');

async function main() {
  const outDir = path.resolve(__dirname, '..', 'out');
  const astBuilderPath = path.join(outDir, 'astBuilder.cjs');
  if (!fs.existsSync(astBuilderPath)) {
    console.error('Compiled AST bundle not found. Run npm run compile first.');
    process.exit(1);
  }
  const { validateDocument, formatDocument } = require(astBuilderPath);
  const examplePath = path.resolve(__dirname, '..', 'Example', 'ExampleNightvision.cfg');
  if (!fs.existsSync(examplePath)) {
    console.error('Example file not found:', examplePath);
    process.exit(1);
  }
  const text = fs.readFileSync(examplePath, 'utf8');
  // Create a minimal document-like object used by the AST builder functions
  const document = {
    uri: { fsPath: examplePath },
    lineCount: text.split(/\r?\n/).length,
    lineAt(i) {
      const lines = text.split(/\r?\n/);
      return { text: lines[i] || '', firstNonWhitespaceCharacterIndex: (lines[i] || '').search(/\S|$/) };
    }
  };

  const diagnostics = validateDocument(document);
  console.log('Diagnostics:');
  for (const d of diagnostics) {
    console.log(`- [${d.severity}] line ${d.range.start.line + 1}: ${d.message}`);
  }

  const edits = formatDocument(document, 3);
  console.log('\nProposed edits:');
  for (const e of edits) {
    console.log(`- replace line ${e.range.start.line + 1} indent with "${e.newText.replace(/\n/g, '\\n')}"`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
