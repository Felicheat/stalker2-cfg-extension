# STALKER 2 (.cfg) Language Support

[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code-Marketplace-blue.svg)](https://marketplace.visualstudio.com/items?itemName=Felicheat.stalker2-cfg-validator)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

**The essential VS Code extension for modding STALKER 2.**

This extension provides comprehensive language support for `.cfg` files, transforming VS Code into a powerful and intelligent editor for Stalker 2 configurations. It goes beyond simple syntax highlighting to provide robust error-checking, smart formatting, and code navigation features that make modding faster, easier, and more reliable.

Built on a resilient, stack-based parser, this tool correctly understands your code's structure, even with complex nesting and inconsistent whitespace.

## Key Features

The extension is designed to feel like native language support, providing the features you'd expect from a professional IDE.

### Smart Validation & Diagnostics

- **Real-time Error Checking:** Instantly spots syntax errors, from missing `struct.end` blocks to malformed properties.
- **Intelligent Typo Detection:** Catches common misspellings of keywords like `struct.begin` and suggests the correct alternative.
- **Style & Consistency Linter:** Provides warnings for inconsistent spacing, duplicate property keys, and invalid block or property names, helping you maintain clean code.
- **Floating Value Detection:** Warns you about unassigned string or number literals that would otherwise be ignored by the game engine.

### Powerful Formatting

- **Format on Save:** Automatically formats your entire document to be clean, consistent, and readable every time you save.
- **Whitespace Normalization:** Solves the "tabs vs. spaces" problem by converting all indentation to a consistent format, eliminating a common source of parsing errors.
- **Guaranteed Safety:** The formatter automatically disables itself if it detects critical syntax errors, preventing any possibility of corrupting your file.

### Enhanced IDE Experience

- **Code Folding:** Easily collapse and expand `struct.begin`/`struct.end` blocks to focus on the code you're working on.
- **Document Outline:** The Explorer pane provides a complete symbol tree of your document, allowing you to quickly navigate between any block, no matter how deeply nested.
- **Syntax Highlighting:** A dedicated grammar provides clear and accurate color-coding for keywords, types, properties, and values.

## How It Works

This extension's power comes from its robust parser, which builds an **Abstract Syntax Tree (AST)** of your code in real-time.

1. **Lexical Analysis:** The code is first broken down into a stream of tokens (keywords, names, values).
2. **Stack-Based Parsing:** A stack-based algorithm reads the tokens to build a hierarchical tree of your `struct` blocks. **This method is immune to errors from mixed tabs and spaces.**
3. **Validation & Formatting:** The extension then walks this correct AST to identify errors, find style inconsistencies, and calculate formatting edits.

## Configuration

You can customize the extension's behavior in your VS Code settings:

- `stalker2CfgValidator.indentLevel`: The number of spaces to use for each level of indentation when formatting. (Default: `3`)
- `stalker2CfgValidator.tabWidth`: How many spaces a tab character (`\t`) should be treated as for validation purposes. (Default: `3`)

## Installation

### From the Marketplace (Recommended)

1. Open the **Extensions** view in VS Code (`Ctrl+Shift+X`).
2. Search for `STALKER 2 CFG Struct Validator`.
3. Click **Install**.

### From a VSIX File

1. Open the Command Palette (`Ctrl+Shift+P`).
2. Run **Extensions: Install from VSIX...**
3. Select the `.vsix` file.

## For Developers

### Quick Start

1. Clone the repository: `git clone https://github.com/Felicheat/stalker2-cfg-extension.git`
2. Install dependencies: `npm install`
3. Compile the extension: `npm run compile`
4. Press `F5` to open an Extension Development Host with the extension loaded.

### Scripts

- `npm run watch`: Watch for changes and recompile automatically.
- `npm run package`: Build a `.vsix` distributable file.

## Contributing

Contributions, issues, and feature requests are welcome! Please feel free to open an issue or submit a pull request on the [GitHub repository](https://github.com/Felicheat/stalker2-cfg-extension).
