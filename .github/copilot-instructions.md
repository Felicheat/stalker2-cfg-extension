# Copilot / AI assistant instructions — stalker2-cfg-extension

Purpose: help an AI agent become productive quickly when editing this VS Code extension.

- Project type: Visual Studio Code extension written in TypeScript. Entry source: `src/extension.ts`.
- Build output: bundled CommonJS file at `out/extension.cjs` (built by `esbuild` via `esbuild.js`).

Quick commands (repo root):

```bash
npm install
npm run check-types   # run TypeScript type checks
npm run compile       # typecheck + build (uses node esbuild.js)
npm run watch         # parallel watch (esbuild + tsc)
npm run package       # creates VSIX with vsce (requires vsce installed)
node esbuild.js --watch   # build only (esbuild) in watch mode
```

How the extension is organized (big picture):

- `src/extension.ts` - single-file implementation of the extension runtime. It:
  - registers diagnostics (incremental, debounced), a document formatter (returns TextEdits), folding provider, and document-symbol provider;
  - implements a small processing pipeline: `DocumentProcessor` + three handlers (`HeaderLineHandler`, `EndLineHandler`, `ContentLineHandler`) that compute `edits` and `diagnostics` for a document.
- `esbuild.js` - build script that bundles `src/extension.ts` -> `out/extension.cjs`. Supports `--watch` and `--production`.
- `syntaxes/struct.tmLanguage.json` - grammar used for the `stalkercfg` language (block levels, assignments, comments).
- `themes/structTheme-color-theme.json` - color tokens used by the contributed theme.
- `src/configuration/language-config.json` - language configuration (onEnter rules, comment tokens).
- `package.json` - contribution points: language id `stalkercfg`, activation on `onLanguage:stalkercfg`, main `out/extension.cjs` and extension configuration options.

Important patterns and project-specific quirks to preserve or follow:

- Indentation logic is centralized in `IndentationService` (reads `stalker2CfgValidator.indentLevel`) and applied by handlers. When changing indentation rules, update both the default in `package.json` contributes (currently `3`) and `IndentationService` fallback (currently `2`) — they differ in the source and can cause confusion.
- The formatting provider returns computed `vscode.TextEdit[]` from the same processor used for diagnostics. Prefer modifying the handler code (`HeaderLineHandler`, `EndLineHandler`, `ContentLineHandler`) to change formatting behavior.
- Block detection relies on regexes in `src/extension.ts` and also mirrored in the grammar under `syntaxes/struct.tmLanguage.json`. If you change block header syntax, update both places.

Editing and debugging workflow for contributors:

- After code changes run `npm run compile` to regenerate `out/extension.cjs` before launching an Extension Development Host.
- For rapid iteration use `npm run watch` or `node esbuild.js --watch` and open F5 in VS Code (Extension Development Host)
- Use `Format Document` in the host to exercise the formatting provider; open a `.cfg` file to trigger diagnostics/outline/folding.

Testing and CI:

- This repository contains no unit tests. Type-checking is enforced via `tsc --noEmit` (run with `npm run check-types`).

Where to make common changes (examples):

- Add a new diagnostic rule: edit handlers in `src/extension.ts` (push Diagnostic objects into `state.diagnostics`).
- Change grammar/token scopes: edit `syntaxes/struct.tmLanguage.json` and `themes/structTheme-color-theme.json` together so tokens keep color mappings.
- Change config default: update `package.json` contributes.configuration and mirror fallback in `IndentationService`.

Notes for AI agents editing code:

- Preserve existing public APIs (the extension activation function and exported `activate`/`deactivate`).
- Keep edits minimal and run `npm run check-types` and `npm run compile` locally to validate changes. If you modify regexes, include examples in comments and update the grammar if needed.
- Do not assume tests exist. Validate behavior by running the extension in the VS Code Extension Development Host (F5) and opening sample `.cfg` files.

If something is unclear or you want more examples (sample .cfg inputs, expected diagnostics, or a CI workflow), tell me which area to expand and I will update this file.

AST-based parsing (recommended migration notes)

- Why: the current implementation uses line-based handlers and regexes in `src/extension.ts`. Moving to an AST makes parsing, validation, formatting, and future features (autocomplete/schema validation) more robust and testable.

- Mapping existing handlers to AST node types (concrete):

  - `HeaderLineHandler` -> HeaderNode (represents `name: struct.begin {params}` with fields: `name`, `params`, `headerIndent`, `line`)
  - `EndLineHandler` -> EndNode (represents `struct.end`, contains `line` and indent)
  - `ContentLineHandler` -> PropertyNode / ContentNode (assignments, values, or nested block content)
  - `DocumentProcessor` -> Parser/ASTBuilder (iterates lines or tokens and emits an AST root `DocumentNode` with children)

- Concrete migration steps:

  1. Add a small AST module (e.g., `src/ast.ts`) that defines node interfaces/classes: `DocumentNode`, `BlockNode`, `HeaderNode`, `EndNode`, `PropertyNode`, and a `Token` type with `text`, `start`, `end`, `line`.
  2. Implement a tokenizer that converts document text into token stream (identifiers, punctuation, keywords like `struct.begin`/`struct.end`, braces, equals, comments). A simple whitespace+regex tokenizer is sufficient to start.
  3. Replace `DocumentProcessor` with an `ASTBuilder` that consumes tokens and constructs the node hierarchy (push/pop blocks on a stack similar to current logic). Emit helpful node metadata (line numbers and indent) used by diagnostics/formatting.
  4. Implement validators that traverse the AST and produce `vscode.Diagnostic[]` (same shape as current `state.diagnostics`). Implement formatters that traverse and produce `vscode.TextEdit[]` (or reconstruct text from AST).
  5. Keep the existing public API (`activate`/`deactivate`) and wire the diagnostics/formatting providers to use the new AST validators/formatters. Prefer small, incremental changes: add `src/ast.ts` and a new `src/astBuilder.ts`, then switch `updateDiagnostics` to call the AST validator.

- Minimal examples to include in changes:

  - Example token for a header: { type: 'IDENT', text: 'ItemGenerator', line: 12, start: 0 }
  - Example BlockNode: { type: 'Block', name: 'ItemGenerator', header: HeaderNode, children: [...], startLine: 12, endLine: 20 }

- Tests & validation approach:

  - Start with small unit tests for the tokenizer and AST builder (happy path + orphan `struct.end` + missing `struct.end`).
  - Keep `npm run check-types` in the loop; add a `test` script and a minimal test harness later (Jest or plain node scripts) if desired.

- Important file references when migrating:
  - `src/extension.ts` (activation wiring, current processors)
  - `syntaxes/struct.tmLanguage.json` (update if you change syntax)
  - `esbuild.js` (watch/build settings)
  - `package.json` (scripts and contributes)

If you want, I can scaffold `src/ast.ts` + `src/astBuilder.ts` and wire the extension to use them in small steps (tokenizer, builder, validator). Which part should I implement first? (tokenizer, AST types, builder, or validator/formatter)
