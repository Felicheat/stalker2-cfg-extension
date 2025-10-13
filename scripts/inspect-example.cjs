const fs = require('fs');
const path = require('path');

const outDir = path.resolve(__dirname, '..', 'out');
const astBuilderPath = path.join(outDir, 'astBuilder.cjs');
if (!fs.existsSync(astBuilderPath)) {
  console.error('Compiled AST bundle not found. Run npm run compile first.');
  process.exit(1);
}
const nmPath = path.join(outDir, 'node_modules');
if (!module.paths.includes(nmPath)) module.paths.unshift(nmPath);
const { buildAST } = require(astBuilderPath);

const examplePath = path.resolve(__dirname, '..', 'Example', 'ExampleNightvision.cfg');
const text = fs.readFileSync(examplePath, 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8'));
const defaultTabWidth = pkg.contributes && pkg.contributes.configuration && pkg.contributes.configuration.properties && pkg.contributes.configuration.properties['stalker2CfgValidator.tabWidth'] && pkg.contributes.configuration.properties['stalker2CfgValidator.tabWidth'].default || 3;
const defaultIndent = pkg.contributes && pkg.contributes.configuration && pkg.contributes.configuration.properties && pkg.contributes.configuration.properties['stalker2CfgValidator.indentLevel'] && pkg.contributes.configuration.properties['stalker2CfgValidator.indentLevel'].default || 3;

const lines = text.split(/\r?\n/).map(l => l.replace(/\t/g, ' '.repeat(defaultTabWidth)));
const document = {
  uri: { fsPath: examplePath },
  lineCount: lines.length,
  lineAt(i) { const txt = lines[i] || ''; return { text: txt, firstNonWhitespaceCharacterIndex: txt.search(/\S|$/) }; }
};

const ast = buildAST(document, defaultTabWidth, defaultIndent);

// flatten blocks
const blocks = [];
function collectBlocks(node) {
  if (!node) return;
  if (node.type === 'Block') {
    blocks.push({start: node.startLine, end: node.endLine, name: node.header && node.header.name});
  }
  if (node.children) node.children.forEach(collectBlocks);
}
collectBlocks(ast);
blocks.sort((a,b)=>a.start - b.start);

// naive pairing
function naivePair(lines){
  const stack = [];
  const pairs = [];
  const orphans = [];
  for (let i=0;i<lines.length;i++){
    const t = lines[i];
    if (t.includes('struct.begin')) stack.push({startLine:i, text: t.trim()});
    if (t.includes('struct.end')){
      if (stack.length===0) orphans.push(i);
      else pairs.push({begin: stack.pop(), endLine:i});
    }
  }
  return {pairs, orphans, unmatchedBegins: stack};
}
const naive = naivePair(lines);

// orphan lines from earlier debug
const orphanLines = [104, 1775, 3445, 5115]; // 0-based

console.log('Total blocks found by AST:', blocks.length);
console.log('Total begins by naive scan:', naive.pairs.length + naive.unmatchedBegins.length, 'ends:', lines.filter(l=>l.includes('struct.end')).length);

// For each orphan, print nearest 8 blocks before it, and naive pairing info
for (const ln of orphanLines) {
  console.log('\n--- orphan line', ln+1, '---');
  console.log('line text:', document.lineAt(ln).text);
  const beforeBlocks = blocks.filter(b => b.start <= ln).slice(-8);
  console.log('Nearest AST blocks before this line (up to 8):');
  beforeBlocks.forEach(b => console.log(`  block ${b.name} start:${b.start+1} end:${b.end==null? 'null': b.end+1}`));
  const naiveBefore = naive.pairs.filter(p=>p.begin.startLine <= ln).slice(-8);
  console.log('Nearest naive pairs before this line (up to 8):');
  naiveBefore.forEach(p => console.log(`  begin at ${p.begin.startLine+1} matched to end ${p.endLine+1}`));
  // find first AST block that ends after ln
  const enclosing = blocks.find(b => b.start < ln && (b.end==null || b.end >= ln));
  console.log('AST finds enclosing block for this line:', enclosing ? `${enclosing.name} ${enclosing.start+1}-${enclosing.end==null?'null':enclosing.end+1}` : 'none');
}

// Also show counts where AST endLine is null (unclosed blocks)
const unclosed = blocks.filter(b => b.end == null);
console.log('\nAST unclosed block count:', unclosed.length);
if (unclosed.length>0) console.log('First unclosed block:', unclosed[0]);

console.log('\nNaive unmatched begins count:', naive.unmatchedBegins.length, 'Naive orphan ends count:', naive.orphans.length);

