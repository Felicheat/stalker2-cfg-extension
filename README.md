# STALKER 2 CFG Struct Validator VS Code Extension

A lightweight Visual Studio Code extension for validating Stalker 2 CFG file formats that use `struct.begin`/`struct.end` blocks. The extension checks for proper block nesting, indentation, and header parameter formatting, providing real-time diagnostics to help you catch mistakes as you code.

## Features

- **Block Matching:** Ensures every `struct.begin` has a corresponding `struct.end`.
- **Indentation Checks:** Verifies that all content inside blocks is indented at least 2 extra spaces relative to the block header.
- **Parameter Validation:** Validates that optional parameters in block headers are enclosed in `{ }` and follow a key=value syntax.
- **Nested Blocks Support:** Supports validation of arbitrarily nested blocks.

## Requirements

- **Visual Studio Code:** Version 1.60.0 or later.
- **Node.js:** Version 16 (or later) is recommended.
- **npm:** Comes with Node.js.

## Installation

### Using a VSIX File

If you have a packaged VSIX file:

1. Open Visual Studio Code.
2. Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`).
3. Type and select **Extensions: Install from VSIX...**.
4. Navigate to and select the downloaded `.vsix` file.

### From Source (For Developers)

1. **Clone the Repository:**

   ```bash
   git clone https://github.com/Felicheat/stalker2-cfg-extension
   cd stalker2-cfg-extension
