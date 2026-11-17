# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Build and Compilation
- `npm run compile` - Compile TypeScript to JavaScript for both client and server
- `tsc -b` - Direct TypeScript build command
- `npm run watch` - Compile in watch mode for development
- `tsc -b -w` - Direct TypeScript watch mode

### Testing
- `npm test` - Run end-to-end tests using the e2e.sh script
- Tests are located in `client/src/test/` and compiled to `client/out/test/`

### Linting
- `npm run lint` - Run ESLint on the codebase
- `eslint` - Direct ESLint command

### Setup
- `npm install` - Install dependencies for root, client, and server (via postinstall script)
- `npm run postinstall` - Manually run the postinstall script that installs dependencies in all directories

## Architecture

This is a Language Server Protocol (LSP) implementation for Grafana Alloy configuration files, structured as a VS Code extension with separate client and server components.

### Project Structure
- **Root**: Contains main package.json and shared configuration
- **Client** (`/client/`): VS Code extension that communicates with the language server
- **Server** (`/server/`): The actual language server implementation

### Language Server Features
The server (`server/src/server.ts`) implements:
- **Completions**: Provides autocomplete for Alloy components and their properties
- **Diagnostics**: Validates Alloy configuration syntax and checks for missing required attributes
- **Hover**: Shows documentation for Alloy components and properties
- **Component Library**: Extensive predefined snippets for Prometheus, Loki, OpenTelemetry components

### Key Implementation Details
- Uses `vscode-languageserver` for server implementation
- Client connects via Node.js IPC transport
- Block parsing with proper nested brace handling, string escaping, and comment support
- Context-aware completions based on current block type
- Diagnostic system validates required attributes per component type

### Language Support
Currently configured for:
- File scheme: `file`
- Language: `plaintext` (in client configuration)
- Alloy configuration syntax with components like `prometheus.scrape`, `loki.write`, `otelcol.*`

## Development Workflow

1. Run `npm install` to install all dependencies
2. Use `npm run watch` or `tsc -b -w` for development with auto-compilation
3. Debug using VS Code's "Launch Client" configuration
4. Test with `npm test` before committing changes
5. Lint code with `npm run lint`

## Testing
End-to-end tests verify the language server functionality by testing completion and diagnostic features in a VS Code extension host environment.