-- Code Lens Fix for Neovim
-- Run this after confirming the debug script shows code lenses are being generated

-- 1. Ensure proper Neovim LSP configuration
vim.lsp.handlers["textDocument/codeLens"] = function(err, result, ctx, config)
  if err then
    print("Code lens error:", err.message)
    return
  end

  if not result then
    print("No code lens result")
    return
  end

  print("Code lens handler called with", #result, "lenses")

  -- Use the default handler but with debug logging
  vim.lsp.codelens.on_codelens(err, result, ctx, config)
end

-- 2. Force refresh code lenses
vim.api.nvim_create_autocmd("BufEnter", {
  pattern = "*.alloy",
  callback = function()
    vim.defer_fn(function()
      if vim.lsp.buf.server_ready() then
        vim.lsp.codelens.refresh()
      end
    end, 500)
  end
})

-- 3. Add keybindings for manual testing
vim.keymap.set('n', '<leader>clr', function()
  vim.lsp.codelens.refresh()
  print("Code lenses refreshed")
end, { desc = 'Refresh code lenses' })

vim.keymap.set('n', '<leader>cld', function()
  vim.lsp.codelens.display(nil, 0)
  print("Code lenses displayed")
end, { desc = 'Display code lenses' })

vim.keymap.set('n', '<leader>clx', function()
  vim.lsp.codelens.run()
  print("Code lens executed")
end, { desc = 'Execute code lens' })

-- 4. Alternative: Show code lenses as virtual text
local function show_codelens_virtual_text()
  local bufnr = vim.api.nvim_get_current_buf()
  local params = vim.lsp.util.make_text_document_params(bufnr)

  vim.lsp.buf_request(bufnr, 'textDocument/codeLens', params, function(err, result, ctx, config)
    if err then
      print("Code lens request error:", err.message)
      return
    end

    if not result or #result == 0 then
      print("No code lenses found")
      return
    end

    -- Clear existing virtual text
    local ns = vim.api.nvim_create_namespace('alloy_codelens')
    vim.api.nvim_buf_clear_namespace(bufnr, ns, 0, -1)

    -- Add virtual text for each code lens
    for _, lens in ipairs(result) do
      if lens.command and lens.command.title then
        vim.api.nvim_buf_set_extmark(bufnr, ns, lens.range.start.line, 0, {
          virt_text = {{ lens.command.title, 'Comment' }},
          virt_text_pos = 'eol',
          hl_mode = 'combine'
        })
      end
    end

    print("Added", #result, "code lens virtual texts")
  end)
end

-- Keybinding to show virtual text version
vim.keymap.set('n', '<leader>clv', show_codelens_virtual_text, { desc = 'Show code lenses as virtual text' })

print("Code lens fix loaded. Use <leader>clr to refresh, <leader>cld to display, <leader>clv for virtual text")