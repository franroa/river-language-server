# Updated Neovim Configuration for Code Lens

Add these settings to your Alloy LSP configuration in Neovim:

```lua
settings = {
  alloyLsp = {
    semanticTokens = {
      enabled = false, -- Keep this as you have it
    },
    symbols = {
      enableFuzzySearch = true,
      enableHierarchy = true,
      maxSymbolResults = 150,
      enableRelationships = true,
    },
    performance = {
      maxFiles = 1000,
      enableCaching = true,
    },
    -- ADD THIS NEW SECTION
    codeLens = {
      enabled = true,
      showReferenceCounts = true,
      showUsageCounts = true, 
      showDocumentationLinks = true,
      showValidationStatus = true,
      refreshOnSave = true,
    },
  },
},
```

## Also add these keybindings for code lens:

```lua
-- Code lens keybindings (add to your LSP on_attach function)
local function on_attach(client, bufnr)
  -- Your existing on_attach code...
  
  -- Code lens keybindings
  if client.server_capabilities.codeLensProvider then
    vim.keymap.set('n', '<leader>cl', vim.lsp.codelens.run, { buffer = bufnr, desc = 'Run code lens' })
    vim.keymap.set('n', '<leader>cL', vim.lsp.codelens.refresh, { buffer = bufnr, desc = 'Refresh code lenses' })
    
    -- Auto-refresh code lenses on save and cursor hold
    vim.api.nvim_create_autocmd({ 'BufWritePost', 'CursorHold' }, {
      buffer = bufnr,
      callback = function()
        if vim.bo[bufnr].filetype == 'alloy' then
          vim.lsp.codelens.refresh()
        end
      end,
    })
  end
end
```

## For testing, you can also add this debug function:

```lua
-- Debug function to test code lens
vim.api.nvim_create_user_command('TestCodeLens', function()
  local bufnr = vim.api.nvim_get_current_buf()
  vim.lsp.buf_request(bufnr, 'textDocument/codeLens', {
    textDocument = vim.lsp.util.make_text_document_params(bufnr)
  }, function(err, result, ctx, config)
    if err then
      print('Error:', err.message)
    elseif result and #result > 0 then
      print('Found ' .. #result .. ' code lenses:')
      for i, lens in ipairs(result) do
        print('  ' .. i .. '. ' .. (lens.command and lens.command.title or 'No title') .. 
              ' at line ' .. (lens.range.start.line + 1))
      end
      
      -- Display them as virtual text
      local ns = vim.api.nvim_create_namespace('debug_codelens')
      vim.api.nvim_buf_clear_namespace(bufnr, ns, 0, -1)
      for _, lens in ipairs(result) do
        vim.api.nvim_buf_set_extmark(bufnr, ns, lens.range.start.line, 0, {
          virt_text = {{'[' .. (lens.command and lens.command.title or 'No title') .. ']', 'Comment'}},
          virt_text_pos = 'eol'
        })
      end
    else
      print('No code lenses found')
    end
  end)
end, {})
```

## After updating your configuration:

1. **Restart Neovim completely** (not just `:LspRestart`)
2. **Open the test file**: `/home/froa/Projects/alloy/river_lsp/server/src/test_simple_codelens.alloy`
3. **Run**: `:TestCodeLens`
4. **Check LSP logs**: `:LspLog` for debug messages starting with `[CodeLens]`

The debug messages will now show:
- Whether code lens is enabled/disabled
- How many lines are being processed
- Which components are found
- Any errors during processing

This should help us identify exactly where the issue is!