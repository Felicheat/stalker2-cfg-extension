# STALKER 2 CFG Struct Validator VS Code Extension

A lightweight Visual Studio Code extension for validating Stalker 2 CFG file formats that use `struct.begin`/`struct.end` blocks. The extension builds an Abstract Syntax Tree (AST) to validate block structure, indentation, and parameter formatting, providing real-time diagnostics to help you catch mistakes as you code.

## Features

- **AST-Based Validation:** Uses a robust two-pass parser to build and validate the document structure.
- **Block Matching:** Ensures every `struct.begin` has a corresponding `struct.end` through proper AST construction.
- **Indentation Checks:** Verifies that all content inside blocks is properly indented relative to their parent blocks.
- **Enhanced Parameter Handling:**
  - Supports inline parameters in block headers: `BlockName : struct.begin {key=value}`
  - Recognizes standalone parameter lines: `{bskipref}`
  - Handles array notation: `[*]` and `[0]` index formats
  - Supports parameters on property lines: `[*] = empty {bskipref}`
- **Tab Support:** Configurable tab width (defaults to 3 spaces) for proper indentation validation
- **Nested Blocks:** Full support for arbitrarily nested block structures
- **Document Symbols:** Provides outline view of the cfg file structure
- **Code Folding:** Supports collapsing/expanding block structures

## Configuration

The extension supports the following settings:

- `stalker2CfgValidator.indentLevel`: Number of spaces for content indentation (default: 3)
- `stalker2CfgValidator.tabWidth`: Number of spaces a tab character represents (default: 3)

## Requirements

- **Visual Studio Code:** Version 1.60.0 or later.
- **Node.js:** Version 18 (or later) is recommended.
- **npm:** Comes with Node.js.

## Installation

### From Source (For Developers)

1. **Clone the Repository:**

   ```bash
   git clone https://github.com/Felicheat/stalker2-cfg-extension.git
   cd stalker2-cfg-extension
   ```

2. **Install Dependencies:**

   ```bash
   npm install
   ```

3. **Compile the Extension:**

   ```bash
   npm run compile
   ```

4. **Launch the Extension in VS Code:**

   - Open the project folder in VS Code.
   - Press `F5` to open a new Extension Development Host with the extension loaded.

### Creating the VSIX Package

Once you have the files set up and your code compiled (i.e., the `out/extension.cjs` file exists), you can create the VSIX file using the [VSCE](https://github.com/microsoft/vscode-vsce) tool.

1. **Install VSCE (if you haven't already):**

   ```bash
   npm install -g vsce
   ```

2. **Package the Extension:**

   From the root of your project, run:

   ```bash
   vsce package
   ```

   This will create a VSIX file (e.g., `struct-validator-0.0.1.vsix`) that you can distribute for offline installation.

### Using a VSIX File

If you have a packaged VSIX file:

1. Open Visual Studio Code.
2. Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`).
3. Type and select **Extensions: Install from VSIX...**.
4. Navigate to and select the downloaded `.vsix` file.

## File Format Support

The extension recognizes the following syntax patterns:

```cfg
BlockName : struct.begin {optional_params}
   Property = Value
   ArrayItem[*] = Value {optional_params}
   
   NestedBlock : struct.begin
      [0] : struct.begin
         Content = Value
      struct.end
   struct.end
struct.end
```

Special handling is provided for:
- Array indices: `[*]` or `[0]` notation
- Standalone parameter lines: `{bskipref}`
- Property parameters: `PropertyName = Value {params}`
- Multi-line parameter blocks