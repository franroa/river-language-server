-- Final Code Lens Fix
-- Comprehensive solution for code lens issues

print("=== FINAL CODE LENS FIX ===")

-- 1. Clean up any existing handlers
vim.lsp.handlers["textDocument/codeLens"] = nil

-- 2. Set up a robust handler
vim.lsp.handlers["textDocument/codeLens"] = function(err, result, ctx, config)
  -- Handle errors gracefully
  if err then
    print("Code lens error:", err.message)
    return
  end

  if not result or #result == 0 then
    print("No code lenses available")
    return
  end

  print("Received", #result, "code lenses")

  -- Use pcall to prevent coroutine errors
  local success, handler_err = pcall(function()
    vim.lsp.codelens.on_codelens(err, result, ctx, config)
  end)

  if not success then
    print("Handler error, using fallback:", handler_err)
    -- Fallback: show as messages
    for i, lens in ipairs(result) do
      if lens.command and lens.command.title then
        local line = lens.range.start.line + 1
        print(string.format("Code lens %d (line %d): %s", i, line, lens.command.title))
      end
    end
  end
end

-- 3. Safe refresh function
local function safe_codelens_refresh()
  local bufnr = vim.api.nvim_get_current_buf()
  local clients = vim.lsp.get_active_clients({bufnr = bufnr})

  if #clients == 0 then
    print("No LSP clients")
    return
  end

  -- Check if any client supports code lens
  local has_support = false
  for _, client in ipairs(clients) do
    if client.server_capabilities.codeLensProvider then
      has_support = true
      break
    end
  end

  if not has_support then
    print("No client supports code lens")
    return
  end

  -- Safe refresh
  local success, err = pcall(function()
    vim.lsp.codelens.refresh()
  end)

  if success then
    print("Code lenses refreshed")
  else
    print("Refresh failed, trying manual request:", err)
    manual_codelens_request()
  end
end

-- 4. Manual request function
function manual_codelens_request()
  local bufnr = vim.api.nvim_get_current_buf()
  local params = vim.lsp.util.make_text_document_params(bufnr)

  print("Manual code lens request...")

  vim.lsp.buf_request(bufnr, 'textDocument/codeLens', params, function(err, result, ctx, config)
    if err then
      print("Manual request error:", err.message)
      return
    end

    if not result or #result == 0 then
      print("No code lenses found")
      return
    end

    print("Manual request successful:", #result, "lenses")

    -- Show results
    for i, lens in ipairs(result) do
      if lens.command and lens.command.title then
        local line = lens.range.start.line + 1
        print(string.format("  Line %d: %s", line, lens.command.title))
      end
    end

    -- Try to display them
    local success, display_err = pcall(function()
      vim.lsp.codelens.on_codelens(nil, result, ctx, config)
    end)

    if not success then
      print("Display failed:", display_err)
    end
  end)
end

-- 5. Set up keybindings
vim.keymap.set('n', '<leader>clr', safe_codelens_refresh, { desc = 'Refresh code lenses safely' })
vim.keymap.set('n', '<leader>clm', manual_codelens_request, { desc = 'Manual code lens request' })

-- 6. Auto-setup on LSP attach
vim.api.nvim_create_autocmd("LspAttach", {
  callback = function(args)
    local client = vim.lsp.get_client_by_id(args.data.client_id)
    if client and client.server_capabilities.codeLensProvider then
      print("Code lens enabled for", client.name)

      -- Set up buffer-local keybindings
      vim.keymap.set('n', '<leader>clr', safe_codelens_refresh, { buffer = args.buf, desc = 'Refresh code lenses' })
      vim.keymap.set('n', '<leader>clm', manual_codelens_request, { buffer = args.buf, desc = 'Manual code lens request' })

      -- Auto-refresh after a delay
      vim.defer_fn(safe_codelens_refresh, 1000)
    end
  end
})

-- 7. Initial setup
vim.defer_fn(function()
  safe_codelens_refresh()
end, 500)

print("Final fix applied!")
print("Keybindings:")
print("  <leader>clr - Safe refresh")
print("  <leader>clm - Manual request")
print("Code lenses should work now, or at least show messages if display fails")