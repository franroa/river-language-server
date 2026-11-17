# LSP Providers Testing Guide

This guide shows how to test all the new LSP providers in Neovim using the `test_all_providers.alloy` file.

## Prerequisites

1. Ensure your Alloy LSP server is running and properly configured in Neovim
2. Open the `test_all_providers.alloy` file in Neovim
3. Make sure the LSP client is connected (check `:LspInfo`)

## Testing Each Provider

### 1. Type Definition Provider

**What it does**: Navigates to component type definitions (different from regular go-to-definition)

**How to test**:
1. Place cursor on any component type like `prometheus.scrape` on line 31
2. Use the type definition command:
   - `:lua vim.lsp.buf.type_definition()`
   - Or if you have a keybinding: `<leader>D` or similar

**Expected behavior**:
- Should navigate to the component type definition file
- For declare blocks like `database` on line 152, should jump to the declare block definition on line 9

**Test locations**:
- Line 31: `prometheus.scrape` → should find prometheus scrape component definition
- Line 152: `database "primary"` → should jump to declare block on line 9
- Line 161: `monitoring_config "prod"` → should jump to declare block on line 20

### 2. Code Lens Provider

**What it does**: Shows reference counts and quick actions above component blocks

**How to test**:
1. Ensure code lens is enabled: `:lua vim.lsp.codelens.display()`
2. Look for text appearing above component declarations

**Expected behavior**:
- Above component declarations, you should see:
  - Reference counts (e.g., "2 references")
  - Quick action links (e.g., "📖 Show docs")
  - Usage counts for declare blocks

**Test locations**:
- Line 31: `prometheus.scrape "app_metrics"` → should show reference count
- Line 9: `declare "database"` → should show usage count (used 2 times)
- Line 20: `declare "monitoring_config"` → should show usage count
- Line 174: `export "database_connections"` → should show export usage count

### 3. Color Provider

**What it does**: Shows color swatches for color values in the code

**How to test**:
1. Look for colored squares/rectangles next to color values
2. Click on them to see color picker (if supported)

**Expected behavior**:
- Color swatches should appear next to:
  - Hex colors: `#ff0000`, `#00ff00`, `#0000ff`
  - RGB colors: `rgb(255, 0, 0)`
  - RGBA colors: `rgba(0, 255, 0, 0.5)`
  - HSL colors: `hsl(240, 100%, 50%)`
  - Named colors: `"red"`, `"blue"`

**Test locations**:
- Line 26: `"#ff6b6b"` → should show pinkish color swatch
- Lines 109-117: Various color formats in the colored_metrics targets
- Line 158: `"#ff4444"` → should show red color swatch
- Line 163: `"#44ff44"` → should show green color swatch

### 4. Linked Editing Provider

**What it does**: Enables synchronized editing of related identifiers

**How to test**:
1. Place cursor on a component label like `"web_server"` on line 122
2. Start editing the name
3. All references should update simultaneously

**Expected behavior**:
- When editing component labels, all references should highlight and update together
- When editing declare block names, all usages should update
- Multi-cursor editing should work for related identifiers

**Test locations**:
- Line 122: `"web_server"` → should link with reference on line 133
- Line 152: `"primary"` in `database "primary"` → should link with references
- Line 9: `"database"` in declare block → should link with usages on lines 152, 155

### 5. Type Hierarchy Provider

**What it does**: Shows component inheritance and relationship trees

**How to test**:
1. Place cursor on a component type like `prometheus.scrape`
2. Use type hierarchy commands:
   - `:lua vim.lsp.buf.typehierarchy()`
   - Or prepare type hierarchy: `:lua vim.lsp.buf_request(0, 'textDocument/prepareTypeHierarchy', vim.lsp.util.make_position_params())`

**Expected behavior**:
- Should show hierarchical relationships between component types
- Parent types: `prometheus` → `monitoring`
- Child types: `prometheus` → `prometheus.scrape`, `prometheus.remote_write`
- Component families grouped logically

**Test locations**:
- Line 31: `prometheus.scrape` → should show prometheus family hierarchy
- Line 59: `loki.source.file` → should show loki family hierarchy  
- Line 87: `otelcol.receiver.otlp` → should show otelcol family hierarchy
- Line 200: `pyroscope.scrape` → should show pyroscope family hierarchy

## Testing Commands and Keybindings

If you have custom keybindings, here are suggested mappings for testing:

```lua
-- Type definition
vim.keymap.set('n', '<leader>D', vim.lsp.buf.type_definition)

-- Code lens
vim.keymap.set('n', '<leader>cl', vim.lsp.codelens.run)
vim.keymap.set('n', '<leader>cL', vim.lsp.codelens.refresh)

-- Type hierarchy
vim.keymap.set('n', '<leader>th', function()
  vim.lsp.buf_request(0, 'textDocument/prepareTypeHierarchy', vim.lsp.util.make_position_params())
end)
```

## Debugging

If providers aren't working:

1. **Check LSP status**: `:LspInfo`
2. **Check capabilities**: `:lua print(vim.inspect(vim.lsp.get_active_clients()[1].server_capabilities))`
3. **Check logs**: `:LspLog` or check Neovim messages with `:messages`
4. **Manual test**: Use direct LSP calls:
   ```lua
   -- Test type definition
   vim.lsp.buf_request(0, 'textDocument/typeDefinition', vim.lsp.util.make_position_params())
   
   -- Test code lens
   vim.lsp.buf_request(0, 'textDocument/codeLens', {textDocument = vim.lsp.util.make_text_document_params()})
   
   -- Test document colors
   vim.lsp.buf_request(0, 'textDocument/documentColor', {textDocument = vim.lsp.util.make_text_document_params()})
   ```

## Expected Provider Capabilities

Your LSP server should advertise these capabilities:

```json
{
  "typeDefinitionProvider": true,
  "codeLensProvider": {"resolveProvider": true},
  "colorProvider": true,
  "linkedEditingRangeProvider": true,
  "typeHierarchyProvider": true
}
```

## Integration with Neovim Features

### With nvim-cmp
- Type definitions should appear in completion menus
- Color previews should show in completions

### With telescope.nvim
- Type hierarchy should integrate with Telescope pickers
- Code lens actions should be accessible via Telescope

### With nvim-treesitter
- Color highlighting should work alongside syntax highlighting
- Linked editing should respect treesitter boundaries

## Performance Notes

- **Code Lens**: May take a moment to calculate reference counts on large files
- **Type Hierarchy**: First calculation might be slower as it scans the workspace
- **Color Provider**: Should be fast as it uses regex matching
- **Linked Editing**: Performance depends on file size and number of references

## Troubleshooting Common Issues

1. **No color swatches**: Check if your Neovim version supports document color
2. **Code lens not showing**: Ensure `vim.lsp.codelens.display()` is called
3. **Type hierarchy empty**: Make sure workspace is properly scanned
4. **Linked editing not working**: Check LSP server version compatibility
5. **Type definition same as definition**: Working correctly - some components may have identical results

This comprehensive test file covers all the new provider features and should give you a complete picture of their functionality!