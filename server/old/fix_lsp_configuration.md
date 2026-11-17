# LSP Configuration Fix

The workspace diagnostics are working correctly in the server code, but the LSP isn't connecting to .alloy files properly. Here's what needs to be fixed:

## Issues Found:

1. **Server compilation is outdated** - TypeScript changes need to be compiled
2. **Client extension only handles plaintext files** - Needs to support .alloy files  
3. **Package.json activation is for plaintext** - Should activate for .alloy files

## Fixes Needed:

### 1. Recompile the server
```bash
cd /home/froa/Projects/alloy/river_lsp
npm run compile
```

### 2. Update client/src/extension.ts
Change the documentSelector from:
```typescript
documentSelector: [{ scheme: 'file', language: 'plaintext' }]
```

To:
```typescript
documentSelector: [
  { scheme: 'file', language: 'plaintext', pattern: '**/*.alloy' },
  { scheme: 'file', language: 'alloy' },
  { scheme: 'file', pattern: '**/*.alloy' }
]
```

And change fileEvents from:
```typescript
fileEvents: workspace.createFileSystemWatcher('**/.clientrc')
```

To:
```typescript
fileEvents: workspace.createFileSystemWatcher('**/*.alloy')
```

### 3. Update package.json
Change activationEvents from:
```json
"activationEvents": ["onLanguage:plaintext"]
```

To:
```json
"activationEvents": [
  "onLanguage:plaintext",
  "onLanguage:alloy", 
  "workspaceContains:**/*.alloy"
]
```

### 4. Test the fix
1. Recompile: `npm run compile`
2. Open VS Code in the alloy project folder
3. Open a .alloy file
4. Check that duplicate block errors appear

## Current Status:
- ✅ Workspace diagnostics logic is working correctly
- ✅ Duplicate detection finds the prometheus.remote_write blocks  
- ❌ LSP client not connecting to .alloy files
- ❌ Server changes not compiled

After applying these fixes, the LSP should automatically show workspace duplicate errors when opening .alloy files.