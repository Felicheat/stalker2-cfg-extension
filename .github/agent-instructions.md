# Copilot / AI assistant instructions — stalker2-cfg-extension

Purpose: help an AI agent become productive quickly when editing this VS Code extension.

- Project type: Visual Studio Code extension written in TypeScript. Entry source: `src/extension.ts`.
- Build output: bundled CommonJS file at `out/extension.cjs` (built by `esbuild` via `esbuild.js`).

## Quick commands (repo root)

```bash
npm install
npm run check-types   # run TypeScript type checks
npm run compile       # typecheck + build (uses node esbuild.js)
npm run watch         # parallel watch (esbuild + tsc)
npm run package       # creates VSIX with vsce (requires vsce installed)
node esbuild.js --watch   # build only (esbuild) in watch mode
```

## Code Structure

The extension's logic is split across several files inside `src/`:

- **`extension.ts`**: The main entry point. It registers all providers (diagnostics, formatting, folding, symbols) and initializes the logger.
- **`ast.ts`**: Defines the Abstract Syntax Tree (AST) interfaces (`BlockNode`, `PropertyNode`, etc.) and related utility functions.
- **`tokenizer.ts`**: Contains the logic for breaking the source document into a series of tokens (e.g., identifiers, strings, numbers).
- **`parser.ts`**: Responsible for building the AST from the token stream produced by the tokenizer.
- **`validator.ts`**: Traverses the AST to find errors and warnings, producing the diagnostics that appear in the editor.
- **`formatter.ts`**: Traverses the AST to produce text edits for formatting the document.
- **`logger.ts`**: A simple logging utility that writes to a dedicated VS Code output channel.

## How the Extension is Organized (Big Picture)

- **Activation**: The `activate` function in `src/extension.ts` is the entry point. It sets up all the language features.
- **Parsing Pipeline**: The core logic follows a three-step process:
  1.  `tokenizer.ts` reads the document text and splits it into tokens.
  2.  `parser.ts` consumes the tokens and builds an AST.
  3.  `validator.ts` and `formatter.ts` traverse the AST to perform their respective tasks.
- **Configuration**: General language settings (e.g., comment markers) are in `src/configuration/language-config.json`. Extension-specific settings are defined in `package.json`.
- **Syntax Highlighting**: The grammar for syntax highlighting is defined in `syntaxes/struct.tmLanguage.json`.

## Where to Make Common Changes

- **Add a new diagnostic rule**: Modify the `validateDocument` function in `src/validator.ts`. Add new checks that traverse the AST and push `Diagnostic` objects into the `diagnostics` array.
- **Change formatting behavior**: Modify the `formatDocument` function in `src/formatter.ts`. Adjust the logic that creates `TextEdit` objects based on the AST structure.
- **Change grammar/token scopes**: Edit `syntaxes/struct.tmLanguage.json` for grammar changes and `themes/structTheme-color-theme.json` to adjust token colors.
- **Add a new token type**: Update the `TokenType` enum in `src/tokenizer.ts` and add logic to the `tokenize` function to recognize it.

## Next Steps: Enhanced Validation

1.  **Implement Stricter Header Validation:**
    *   In `validator.ts`, inside the `checkNode` function for a `BlockNode`, add a regex check for the `header.name` property.
    *   The regex should enforce that the name only contains `A-Za-z0-9_-.*[]`.
    *   If the name is invalid, push a new error diagnostic.

2.  **Enhance `InvalidNode` Diagnostics:**
    *   In `validator.ts`, inside the `checkNode` function for an `InvalidNode`, add logic to analyze the `text` property.
    *   Use regex to check if the text is a string literal (`^'.*'$` or `^".*"$`).
    *   Use regex to check if the text is a numeric literal (`^-?(\d+(\.\d*)?|\.\d+)(f)?$`).
    *   Update the diagnostic message accordingly.

3.  **Add Duplicate Property Key Validation:**
    *   In `validator.ts`, inside the `checkNode` function for a `BlockNode`, create a `Set` to store the keys of the properties that have been seen.
    *   Iterate through the children of the block. If a `PropertyNode` is found, check if its key is already in the `Set`.
    *   If it is, push a new error diagnostic. Otherwise, add the key to the `Set`.

4.  **Add Property Key Syntax Validation:**
    *   In `validator.ts`, inside the `checkNode` function for a `PropertyNode`, add a regex check for the `key` property.
    *   The regex should enforce that the key only contains `A-Za-z0-9_.`.
    *   If the key is invalid, push a new error diagnostic.

## Notes for AI agents editing code:

- Preserve existing public APIs (the extension activation function and exported `activate`/`deactivate`).
- Keep edits minimal and run `npm run check-types` and `npm run compile` locally to validate changes.
- Do not assume tests exist. Validate behavior by running the extension in the VS Code Extension Development Host (F5) and opening sample `.cfg` files.