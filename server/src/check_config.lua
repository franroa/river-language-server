-- Check LSP Configuration
-- Verify that code lens is enabled in the configuration

print("=== CHECK LSP CONFIGURATION ===")

local bufnr = vim.api.nvim_get_current_buf()
local clients = vim.lsp.get_active_clients({bufnr = bufnr})

print("Active clients:", #clients)

for _, client in ipairs(clients) do
  print(string.format("\n=== CLIENT: %s ===", client.name))

  -- Check server capabilities
  print("Server capabilities:")
  print("  Code lens provider:", client.server_capabilities.codeLensProvider ~= nil)

  if client.server_capabilities.codeLensProvider then
    print("  Code lens provider details:", vim.inspect(client.server_capabilities.codeLensProvider))
  end

  -- Check client configuration
  print("Client configuration:")
  if client.config and client.config.settings then
    print("  Settings:", vim.inspect(client.config.settings))
  else
    print("  No settings found")
  end

  -- Check initialization options
  if client.config and client.config.init_options then
    print("  Init options:", vim.inspect(client.config.init_options))
  else
    print("  No init options")
  end

  -- Check workspace configuration
  print("Workspace configuration:")
  local workspace_config = vim.lsp.buf_get_clients()[client.id]
  if workspace_config then
    print("  Workspace config:", vim.inspect(workspace_config))
  else
    print("  No workspace config")
  end
end

-- Check Neovim's LSP configuration
print("\n=== NEOVIM LSP CONFIG ===")
print("Code lens handler set:", vim.lsp.handlers["textDocument/codeLens"] ~= nil)

-- Check if there are any autocmds for code lens
print("\n=== CODE LENS AUTOCMDS ===")
local autocmds = vim.api.nvim_get_autocmds({event = "LspAttach"})
print("LspAttach autocmds:", #autocmds)

for _, autocmd in ipairs(autocmds) do
  if autocmd.desc and autocmd.desc:match("codelens") then
    print("  Code lens autocmd:", autocmd.desc)
  end
end

-- Test a simple request to see if server is responsive
print("\n=== SERVER RESPONSIVENESS TEST ===")
vim.lsp.buf_request(bufnr, 'textDocument/hover', {
  textDocument = vim.lsp.util.make_text_document_params(bufnr),
  position = { line = 0, character = 0 }
}, function(err, result, ctx, config)
  print("Hover test result:")
  print("  Error:", err and err.message or "none")
  print("  Result:", result and "SUCCESS" or "FAILED")

  if result then
    print("✅ Server is responsive")
  else
    print("❌ Server is not responding")
  end
end)

print("\n=== CONFIGURATION CHECK COMPLETE ===")
print("If code lens is enabled but not working, the issue is in the server logic")
print("If code lens is disabled, check your LSP configuration")