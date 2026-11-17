-- Complete Code Lens Solution
-- This handles all the issues we've encountered

print("=== COMPLETE CODE LENS SOLUTION ===")

-- 1. Check and restart LSP if needed
local function restart_lsp_if_needed()
  local bufnr = vim.api.nvim_get_current_buf()
  local clients = vim.lsp.get_active_clients({bufnr = bufnr})

  print("Checking", #clients, "clients...")

  local needs_restart = false
  for _, client in ipairs(clients) do
    if vim.lsp.client_is_stopped(client.id) then
      print("Client stopped:", client.name)
      needs_restart = true
    end
  end

  if needs_restart or #clients == 0 then
    print("Restarting LSP...")

    -- Stop all clients
    for _, client in ipairs(clients) do
      vim.lsp.stop_client(client.id)
    end

    -- Start fresh
    vim.defer_fn(function()
      vim.cmd("LspStart")
      print("LSP restarted")
    end, 500)
  else
    print("LSP clients are running")
  end
end

-- 2. Set up robust code lens handler
local function setup_codelens_handler()
  vim.lsp.handlers["textDocument/codeLens"] = function(err, result, ctx, config)
    if err then
      print("Code lens error:", err.message)
      return
    end

    if not result then
      print("No code lens result")
      return
    end

    print("Code lens handler: received", #result, "lenses")

    -- Show as virtual text (most reliable)
    show_codelens_virtual_text(result, ctx.bufnr)
  end
end

-- 3. Virtual text display function
function show_codelens_virtual_text(lenses, bufnr)
  local ns = vim.api.nvim_create_namespace('alloy_codelens')
  vim.api.nvim_buf_clear_namespace(bufnr, ns, 0, -1)

  print("Displaying code lenses as virtual text:")

  for i, lens in ipairs(lenses) do
    if lens.command and lens.command.title then
      local line = lens.range.start.line
      local title = lens.command.title

      vim.api.nvim_buf_set_extmark(bufnr, ns, line, 0, {
        virt_text = {{string.format("🔍 %s", title), 'Comment'}},
        virt_text_pos = 'eol',
        hl_mode = 'combine'
      })

      print(string.format("  Line %d: %s", line + 1, title))
    end
  end
end

-- 4. Safe code lens request
local function safe_codelens_request()
  local bufnr = vim.api.nvim_get_current_buf()
  local params = vim.lsp.util.make_text_document_params(bufnr)

  print("Requesting code lenses...")

  vim.lsp.buf_request(bufnr, 'textDocument/codeLens', params, function(err, result, ctx, config)
    if err then
      print("Request error:", err.message)
      return
    end

    if not result or #result == 0 then
      print("No code lenses found")
      return
    end

    print("SUCCESS: Found", #result, "code lenses")
    show_codelens_virtual_text(result, bufnr)
  end)
end

-- 5. Set up keybindings
local function setup_keybindings()
  vim.keymap.set('n', '<leader>clr', function()
    restart_lsp_if_needed()
    vim.defer_fn(safe_codelens_request, 1000)
  end, { desc = 'Restart LSP and refresh code lenses' })

  vim.keymap.set('n', '<leader>clt', safe_codelens_request, { desc = 'Test code lens request' })

  vim.keymap.set('n', '<leader>clc', function()
    local ns = vim.api.nvim_create_namespace('alloy_codelens')
    vim.api.nvim_buf_clear_namespace(0, ns, 0, -1)
    print("Code lens virtual text cleared")
  end, { desc = 'Clear code lens virtual text' })
end

-- 6. Auto-setup
vim.api.nvim_create_autocmd("LspAttach", {
  callback = function(args)
    local client = vim.lsp.get_client_by_id(args.data.client_id)
    if client and client.server_capabilities.codeLensProvider then
      print("Code lens enabled for", client.name)
      vim.defer_fn(safe_codelens_request, 2000)
    end
  end
})

-- 7. Initialize
setup_codelens_handler()
setup_keybindings()

-- 8. Initial check and request
vim.defer_fn(function()
  restart_lsp_if_needed()
  vim.defer_fn(safe_codelens_request, 1500)
end, 500)

print("Complete solution applied!")
print("Keybindings:")
print("  <leader>clr - Restart LSP and refresh code lenses")
print("  <leader>clt - Test code lens request")
print("  <leader>clc - Clear virtual text")
print("")
print("Code lenses will appear as virtual text at the end of lines")
print("Look for 🔍 symbols with lens information")