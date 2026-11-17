# Code Lens Debugging Guide

## Step 1: Check if Code Lenses are Actually Generated

First, let's see if the LSP server is generating any code lenses:

```lua
:lua vim.lsp.buf_request(0, 'textDocument/codeLens', {textDocument = vim.lsp.util.make_text_document_params()}, function(err, result) if result and #result > 0 then print("Found " .. #result .. " code lenses:") for i, lens in ipairs(result) do print("  Line " .. (lens.range.start.line + 1) .. ": " .. (lens.command and lens.command.title or "No title")) end else print("No code lenses found. Error:", err) end end)
```

## Step 2: Visual Code Lens Detection

Try this command to show all code lenses with visual markers:

```lua
:lua local bufnr = 0; vim.lsp.buf_request(bufnr, 'textDocument/codeLens', {textDocument = vim.lsp.util.make_text_document_params()}, function(err, result) if result then local ns = vim.api.nvim_create_namespace('debug_codelens'); vim.api.nvim_buf_clear_namespace(bufnr, ns, 0, -1); for i, lens in ipairs(result) do vim.api.nvim_buf_set_extmark(bufnr, ns, lens.range.start.line, 0, {virt_text = {{'[CODELENS] ' .. (lens.command and lens.command.title or 'No title'), 'WarningMsg'}}, virt_text_pos = 'eol'}); end; print('Added ' .. #result .. ' code lens markers'); else print('No code lenses:', err); end; end)
```

## Step 3: Check Server Capabilities

```lua
:lua local clients = vim.lsp.get_active_clients(); for _, client in pairs(clients) do if client.name:match("alloy") then print("Code lens capability:", vim.inspect(client.server_capabilities.codeLensProvider)); end; end
```

## Step 4: Manual Testing at Specific Lines

Based on the test file, try placing your cursor on these specific lines and running `:lua vim.lsp.codelens.run()`:

### Line 9 - declare "database"
This should show a usage count code lens

### Line 31 - prometheus.scrape "app_metrics" 
This should show a reference count code lens

### Line 152 - database "primary"
This should show usage information

## Step 5: Alternative Code Lens Execution

If standard code lens doesn't work, try this direct approach:

```lua
:lua local bufnr = 0; local line = vim.api.nvim_win_get_cursor(0)[1] - 1; vim.lsp.buf_request(bufnr, 'textDocument/codeLens', {textDocument = vim.lsp.util.make_text_document_params()}, function(err, result) if result then for _, lens in ipairs(result) do if lens.range.start.line <= line and line <= lens.range['end'].line then print('Executing code lens:', lens.command.title); vim.lsp.buf.execute_command(lens.command); return; end; end; print('No code lens found at line ' .. (line + 1)); else print('Error:', err); end; end)
```

## Step 6: Check LSP Logs

Check for any errors in the LSP logs:
```
:LspLog
```

Look for errors related to:
- Code lens requests
- Command execution
- Component data loading

## Troubleshooting Common Issues

### Issue 1: No code lenses generated
**Solution**: The LSP server might not be calculating references properly.

### Issue 2: Code lenses present but not executable
**Solution**: Commands might not be properly registered.

### Issue 3: Components not found
**Solution**: Workspace scanning might have failed.

## Manual Command Testing

Try executing the code lens commands directly:

```lua
-- Test reference counting
:lua vim.lsp.buf.execute_command({command = "alloy.showReferences", arguments = {"prometheus.scrape", "app_metrics"}})

-- Test component documentation
:lua vim.lsp.buf.execute_command({command = "alloy.showComponentDocs", arguments = {"prometheus.scrape"}})

-- Test declare usage counting
:lua vim.lsp.buf.execute_command({command = "alloy.showDeclareUsages", arguments = {"database"}})
```

## Expected Code Lens Locations

In the test file `test_all_providers.alloy`, you should find code lenses at:

1. **Line 9**: `declare "database"` → Should show "2 usages"
2. **Line 20**: `declare "monitoring_config"` → Should show "2 usages"  
3. **Line 31**: `prometheus.scrape "app_metrics"` → Should show "1 reference" + "📖 Show docs"
4. **Line 40**: `prometheus.scrape "database_metrics"` → Should show reference count
5. **Line 174**: `export "database_connections"` → Should show "1 usage of export"

## Force Code Lens Refresh

Sometimes code lenses need to be refreshed after the workspace is fully loaded:

```lua
-- Wait a moment then refresh
:lua vim.defer_fn(function() vim.lsp.codelens.refresh(); vim.defer_fn(function() vim.lsp.codelens.display(nil, 0); end, 1000); end, 2000)
```

## Alternative: Show All Available Commands

To see what commands are available:

```lua
:lua local clients = vim.lsp.get_active_clients(); for _, client in pairs(clients) do if client.name:match("alloy") then print("Available commands:"); for _, cmd in ipairs(client.server_capabilities.executeCommandProvider.commands) do print("  " .. cmd); end; end; end
```

## Debug Output

If none of the above works, run this comprehensive debug:

```lua
:lua print("=== CODE LENS DEBUG ==="); local bufnr = 0; print("Buffer:", bufnr, "loaded:", vim.api.nvim_buf_is_loaded(bufnr)); local clients = vim.lsp.get_active_clients({bufnr = bufnr}); print("Active clients:", #clients); for _, client in pairs(clients) do print("Client:", client.name, "supports code lens:", not not client.server_capabilities.codeLensProvider); end; vim.lsp.buf_request(bufnr, 'textDocument/codeLens', {textDocument = vim.lsp.util.make_text_document_params()}, function(err, result) print("Code lens result - Error:", err, "Results:", result and #result or 0); if result then for i, lens in ipairs(result) do print(string.format("  [%d] Line %d: %s", i, lens.range.start.line + 1, lens.command and lens.command.title or "NO_COMMAND")); end; end; end)
```

This will give you a complete picture of what's happening with code lenses in your setup.