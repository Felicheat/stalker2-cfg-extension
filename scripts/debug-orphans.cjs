const fs = require("fs");
const path = require("path");

function expandTabs(lines, tabWidth) {
  return lines.map((l) => l.replace(/\t/g, " ".repeat(tabWidth)));
}

function scanFile(fp, tabWidth = 3) {
  const raw = fs.readFileSync(fp, "utf8");
  const lines = expandTabs(raw.split(/\r?\n/), tabWidth);
  const begins = [];
  const ends = [];

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i];
    if (t.includes("struct.begin")) begins.push({ line: i, text: t.trim() });
    if (t.includes("struct.end")) ends.push({ line: i, text: t.trim() });
  }

  // naive pairing using stack
  const stack = [];
  const orphans = [];
  const matchedPairs = [];
  // We'll scan every line and push begins, pop on ends
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i];
    if (t.includes("struct.begin")) {
      stack.push({ startLine: i, text: t.trim() });
    }
    if (t.includes("struct.end")) {
      if (stack.length === 0) {
        orphans.push({ line: i, text: t.trim() });
      } else {
        const b = stack.pop();
        matchedPairs.push({ begin: b, end: { line: i, text: t.trim() } });
      }
    }
  }

  return { lines, begins, ends, matchedPairs, unmatchedBegins: stack, orphans };
}

async function main() {
  const exampleDir = path.resolve(__dirname, "..", "Example");
  const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "package.json"), "utf8"));
  const defaultTabWidth =
    (pkg.contributes &&
      pkg.contributes.configuration &&
      pkg.contributes.configuration.properties &&
      pkg.contributes.configuration.properties["stalker2CfgValidator.tabWidth"] &&
      pkg.contributes.configuration.properties["stalker2CfgValidator.tabWidth"].default) ||
    3;

  const files = fs.readdirSync(exampleDir).filter((f) => f.toLowerCase().endsWith(".cfg"));
  for (const file of files) {
    const fp = path.join(exampleDir, file);
    const report = scanFile(fp, defaultTabWidth);
    console.log("\n---", file, "---");
    console.log("lines:", report.lines.length);
    console.log("struct.begin count:", report.begins.length);
    console.log("struct.end count:", report.ends.length);
    console.log("matched pairs:", report.matchedPairs.length);
    console.log("unmatched begins:", report.unmatchedBegins.length);
    console.log("orphan ends:", report.orphans.length);
    if (report.orphans.length > 0) {
      console.log("first orphan contexts:");
      report.orphans.slice(0, 10).forEach((o) => {
        console.log("  orphan line", o.line + 1, ":", o.text);
        const start = Math.max(0, o.line - 3);
        for (let i = start; i <= Math.min(report.lines.length - 1, o.line + 2); i++) {
          const prefix = i === o.line ? ">>" : "  ";
          console.log(prefix, (i + 1).toString().padStart(5), report.lines[i]);
        }
      });
    }
    if (report.unmatchedBegins.length > 0) {
      console.log("first unmatched begin contexts:");
      report.unmatchedBegins.slice(0, 10).forEach((b) => {
        console.log("  begin line", b.startLine + 1, ":", b.text);
        const start = Math.max(0, b.startLine - 3);
        for (let i = start; i <= Math.min(report.lines.length - 1, b.startLine + 2); i++) {
          const prefix = i === b.startLine ? ">>" : "  ";
          console.log(prefix, (i + 1).toString().padStart(5), report.lines[i]);
        }
      });
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
