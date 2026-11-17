-- Enable Code Lens in Neovim
-- This script fixes the code lens issue by properly configuring Neovim

print("=== ENABLING CODE LENS IN NEOVIM ===")

-- 1. Ensure code lens module is available
if not vim.lsp.codelens then
  print("ERROR: vim.lsp.codelens is not available in this Neovim version")
  print("Code lens requires Neovim 0.6.0 or later")
  return
end

-- 2. Set up proper code lens handler
vim.lsp.handlers["textDocument/codeLens"] = function(err, result, ctx, config)
  if err then
    print("Code lens error:", err.message)
    return
  end

  if not result then
    print("No code lens result")
    return
  end

  print("Code lens handler received", #result, "lenses")

  -- Call the default handler
  vim.lsp.codelens.on_codelens(err, result, ctx, config)
end

-- 3. Set up autocmd to refresh code lenses
vim.api.nvim_create_autocmd({ "BufEnter", "CursorHold", "InsertLeave" }, {
  pattern = "*.alloy",
  callback = function()
    local bufnr = vim.api.nvim_get_current_buf()
    local clients = vim.lsp.get_active_clients({bufnr = bufnr})

    -- Check if any client supports code lens
    for _, client in ipairs(clients) do
      if client.server_capabilities.codeLensProvider then
        vim.defer_fn(function()
          vim.lsp.codelens.refresh()
        end, 100)
        break
      end
    end
  end,
  desc = "Refresh code lenses for Alloy files"
})

-- 4. Set up keybindings
local function setup_keybindings()
  local bufnr = vim.api.nvim_get_current_buf()
  local clients = vim.lsp.get_active_clients({bufnr = bufnr})

  -- Only set up keybindings if we have a client that supports code lens
  for _, client in ipairs(clients) do
    if client.server_capabilities.codeLensProvider then
      vim.keymap.set('n', '<leader>clr', function()
        vim.lsp.codelens.refresh()
        print("Code lenses refreshed")
      end, { buffer = bufnr, desc = 'Refresh code lenses' })

      vim.keymap.set('n', '<leader>cld', function()
        vim.lsp.codelens.display(nil, bufnr)
        print("Code lenses displayed")
      end, { buffer = bufnr, desc = 'Display code lenses' })

      vim.keymap.set('n', '<leader>clx', function()
        vim.lsp.codelens.run()
        print("Code lens executed")
      end, { buffer = bufnr, desc = 'Execute code lens at cursor' })

      print("Code lens keybindings set up:")
      print("  <leader>clr - Refresh code lenses")
      print("  <leader>cld - Display code lenses")
      print("  <leader>clx - Execute code lens at cursor")
      break
    end
  end
end

-- Set up keybindings immediately if we have clients
setup_keybindings()

-- Also set up keybindings when LSP attaches
vim.api.nvim_create_autocmd("LspAttach", {
  callback = function(args)
    local bufnr = args.buf
    local client = vim.lsp.get_client_by_id(args.data.client_id)

    if client and client.server_capabilities.codeLensProvider then
      vim.keymap.set('n', '<leader>clr', function()
        vim.lsp.codelens.refresh()
        print("Code lenses refreshed")
      end, { buffer = bufnr, desc = 'Refresh code lenses' })

      vim.keymap.set('n', '<leader>cld', function()
        vim.lsp.codelens.display(nil, bufnr)
        print("Code lenses displayed")
      end, { buffer = bufnr, desc = 'Display code lenses' })

      vim.keymap.set('n', '<leader>clx', function()
        vim.lsp.codelens.run()
        print("Code lens executed")
      end, { buffer = bufnr, desc = 'Execute code lens at cursor' })

      print("Code lens enabled for buffer", bufnr)
    end
  end,
  desc = "Set up code lens keybindings on LSP attach"
})

-- 5. Force refresh code lenses for current buffer
vim.defer_fn(function()
  local bufnr = vim.api.nvim_get_current_buf()
  local clients = vim.lsp.get_active_clients({bufnr = bufnr})

  for _, client in ipairs(clients) do
    if client.server_capabilities.codeLensProvider then
      print("Found code lens capable client:", client.name)
      vim.lsp.codelens.refresh()
      break
    end
  end
end, 500)

print("Code lens setup complete!")
print("Try running :lua vim.lsp.codelens.refresh() to test")