# Code Lens Testing Fix

The error you're seeing is because `vim.lsp.codelens.display()` requires a buffer number parameter.

## Correct Commands

### To display code lenses:
```lua
-- Get current buffer and display code lenses
vim.lsp.codelens.display(nil, 0)
-- OR explicitly specify buffer
vim.lsp.codelens.display(nil, vim.api.nvim_get_current_buf())
```

### To refresh code lenses:
```lua
-- Refresh code lenses for current buffer
vim.lsp.codelens.refresh()
```

### To run/execute a code lens:
```lua
-- Run code lens at cursor position
vim.lsp.codelens.run()
```

## Recommended Keybindings

Add these to your Neovim config:

```lua
-- Code lens keybindings
vim.keymap.set('n', '<leader>cl', function()
  vim.lsp.codelens.run()
end, { desc = 'Run code lens' })

vim.keymap.set('n', '<leader>cL', function()
  vim.lsp.codelens.refresh()
end, { desc = 'Refresh code lenses' })

vim.keymap.set('n', '<leader>cd', function()
  vim.lsp.codelens.display(nil, 0)
end, { desc = 'Display code lenses' })
```

## Auto-refresh Code Lenses

To automatically refresh code lenses when the buffer changes:

```lua
-- Auto-refresh code lenses
vim.api.nvim_create_autocmd({ 'BufEnter', 'CursorHold', 'InsertLeave' }, {
  pattern = '*.alloy',
  callback = function()
    if vim.lsp.buf.server_ready() then
      vim.lsp.codelens.refresh()
    end
  end,
})
```

## Testing Steps

1. **Open the test file**: Open `test_all_providers.alloy` in Neovim

2. **Check LSP is active**: `:LspInfo`

3. **Refresh code lenses**: `:lua vim.lsp.codelens.refresh()`

4. **Display code lenses**: `:lua vim.lsp.codelens.display(nil, 0)`

5. **Look for code lenses**: You should see text above component declarations like:
   - "2 references" above `prometheus.scrape "app_metrics"`
   - "📖 Show docs" above component blocks
   - Usage counts above declare blocks

## Manual Testing

If the above doesn't work, try manual LSP requests:

```lua
-- Manual code lens request
vim.lsp.buf_request(0, 'textDocument/codeLens', {
  textDocument = vim.lsp.util.make_text_document_params()
}, function(err, result, ctx, config)
  if result then
    print("Code lenses found:", #result)
    for i, lens in ipairs(result) do
      print(string.format("Lens %d: %s at line %d", i, lens.command.title, lens.range.start.line + 1))
    end
  else
    print("No code lenses or error:", err)
  end
end)
```

## Debugging Code Lens Issues

1. **Check server capabilities**:
```lua
local clients = vim.lsp.get_active_clients()
for _, client in pairs(clients) do
  if client.name == "alloy_lsp" then
    print("Code lens capability:", client.server_capabilities.codeLensProvider)
  end
end
```

2. **Check for errors in LSP logs**: `:LspLog`

3. **Verify buffer is loaded**: `:lua print(vim.api.nvim_buf_is_loaded(0))`

## Expected Behavior

When working correctly, you should see:
- Text appearing above declare blocks showing usage counts
- Reference counts above component declarations
- Quick action buttons like "📖 Show docs"
- The code lenses should be clickable (if your terminal/GUI supports it)

## Alternative: Virtual Text

If code lenses still don't work, you can enable virtual text to see similar information:

```lua
vim.lsp.handlers["textDocument/codeLens"] = function(err, result, ctx, config)
  if not result then return end
  
  local bufnr = ctx.bufnr
  local ns = vim.api.nvim_create_namespace('codelens_virtual_text')
  vim.api.nvim_buf_clear_namespace(bufnr, ns, 0, -1)
  
  for _, lens in ipairs(result) do
    if lens.command then
      vim.api.nvim_buf_set_extmark(bufnr, ns, lens.range.start.line, 0, {
        virt_text = {{ lens.command.title, 'Comment' }},
        virt_text_pos = 'eol'
      })
    end
  end
end
```

This will show code lens information as virtual text at the end of lines instead of above them.