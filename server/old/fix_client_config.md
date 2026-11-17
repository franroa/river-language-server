# Fix LSP Autocomplete Issues

## Problem
The LSP autocomplete is not working because the client is configured for `plaintext` files instead of `alloy` files.

## Required Changes

### 1. Update Root Package.json
Replace the current package.json content with:

```json
{
  "name": "lsp-sample",
  "description": "Alloy Language Server",
  "author": "Microsoft Corporation",
  "license": "MIT",
  "version": "1.0.0",
  "repository": {
    "type": "git",
    "url": "https://github.com/Microsoft/vscode-extension-samples"
  },
  "publisher": "vscode-samples",
  "categories": [],
  "keywords": ["multi-root ready"],
  "engines": {
    "vscode": "^1.75.0"
  },
  "activationEvents": [
    "onLanguage:alloy"
  ],
  "main": "./client/out/extension",
  "contributes": {
    "languages": [
      {
        "id": "alloy",
        "aliases": ["Alloy", "alloy"],
        "extensions": [".alloy"],
        "configuration": "./language-configuration.json"
      }
    ],
    "configuration": {
      "type": "object",
      "title": "Alloy Language Server",
      "properties": {
        "alloyLanguageServer.maxNumberOfProblems": {
          "scope": "resource",
          "type": "number",
          "default": 100,
          "description": "Controls the maximum number of problems produced by the server."
        },
        "alloyLanguageServer.trace.server": {
          "scope": "window",
          "type": "string",
          "enum": ["off", "messages", "verbose"],
          "default": "off",
          "description": "Traces the communication between VS Code and the language server."
        }
      }
    }
  },
  "scripts": {
    "vscode:prepublish": "npm run compile",
    "compile": "tsc -b",
    "watch": "tsc -b -w",
    "lint": "eslint",
    "postinstall": "cd client && npm install && cd ../server && npm install && cd ..",
    "test": "sh ./scripts/e2e.sh"
  },
  "devDependencies": {
    "@eslint/js": "^9.13.0",
    "@stylistic/eslint-plugin": "^2.9.0",
    "@types/mocha": "^10.0.6",
    "@types/node": "^20",
    "eslint": "^9.13.0",
    "mocha": "^10.3.0",
    "typescript": "^5.8.2",
    "typescript-eslint": "^8.26.0"
  }
}
```

### 2. Update Client Extension
Update `/client/src/extension.ts`:

```typescript
// Change this line:
documentSelector: [{ scheme: 'file', language: 'plaintext' }],

// To this:
documentSelector: [{ scheme: 'file', language: 'alloy' }],

// And change this line:
fileEvents: workspace.createFileSystemWatcher('**/.clientrc')

// To this:
fileEvents: workspace.createFileSystemWatcher('**/*.alloy')
```

### 3. Create Language Configuration
Create `/language-configuration.json` in the project root:

```json
{
  "comments": {
    "lineComment": "//",
    "blockComment": ["/*", "*/"]
  },
  "brackets": [
    ["{", "}"],
    ["[", "]"],
    ["(", ")"]
  ],
  "autoClosingPairs": [
    { "open": "{", "close": "}" },
    { "open": "[", "close": "]" },
    { "open": "(", "close": ")" },
    { "open": "\"", "close": "\"", "notIn": ["string"] }
  ],
  "surroundingPairs": [
    ["{", "}"],
    ["[", "]"],
    ["(", ")"],
    ["\"", "\""]
  ],
  "wordPattern": "(-?\\d*\\.\\d\\w*)|([^\\`\\~\\!\\@\\#\\%\\^\\&\\*\\(\\)\\-\\=\\+\\[\\{\\]\\}\\\\\\|\\;\\:\\'\\\"\\,\\.\\<\\>\\/\\?\\s]+)",
  "indentationRules": {
    "increaseIndentPattern": "^\\s*(declare|beyla|prometheus|loki|otelcol|database_observability|faro|pyroscope|mimir|local|remote|discovery)\\.\\w+\\s+\"[^\"]*\"\\s*\\{[^}]*$|^\\s*(output|attributes|select|filters|metrics|routes|ebpf|discovery|client|http|grpc|basic_auth)\\s*\\{[^}]*$",
    "decreaseIndentPattern": "^\\s*\\}",
    "indentNextLinePattern": "^\\s*(declare|beyla|prometheus|loki|otelcol|database_observability|faro|pyroscope|mimir|local|remote|discovery)\\.\\w+\\s+\"[^\"]*\"\\s*\\{[^}]*$|^\\s*(output|attributes|select|filters|metrics|routes|ebpf|discovery|client|http|grpc|basic_auth)\\s*\\{[^}]*$"
  }
}
```

## Steps to Fix

1. Update the root `package.json` with the content above
2. Update `/client/src/extension.ts` to use `alloy` language
3. Create `/language-configuration.json` with the content above
4. Recompile the extension: `npm run compile`
5. Reload VS Code window
6. Open an `.alloy` file and test autocomplete

## Testing Autocomplete

Create a test file `test.alloy`:

```alloy
beyla.ebpf "test" {
  // Type Ctrl+Space here to see completions
}
```

You should see:
- `enforce_sys_caps`
- `debug`
- `trace_printer`
- Block completions like `output`, `attributes`, `select`