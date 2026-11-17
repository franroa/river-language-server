-- LSP Diagnostic Script
-- Check what's wrong with the LSP setup

print("=== LSP DIAGNOSTIC ===")

local bufnr = vim.api.nvim_get_current_buf()
local clients = vim.lsp.get_active_clients({bufnr = bufnr})

print("Buffer:", bufnr)
print("Active clients:", #clients)

-- 1. Check client status
for _, client in ipairs(clients) do
  print(string.format("\n=== CLIENT: %s ===", client.name))
  print("ID:", client.id)
  print("Status:", vim.lsp.client_is_stopped(client.id) and "STOPPED" or "RUNNING")

  -- Check capabilities
  print("Code lens capability:", vim.inspect(client.server_capabilities.codeLensProvider))

  -- Check if client is responsive
  local is_ready = vim.lsp.buf.server_ready()
  print("Server ready:", is_ready)

  -- Try a simple request
  print("Testing simple request...")
  vim.lsp.buf_request(bufnr, 'textDocument/hover', {
    textDocument = vim.lsp.util.make_text_document_params(bufnr),
    position = { line = 0, character = 0 }
  }, function(err, result, ctx, config)
    print("Hover test result:")
    print("  Error:", err and err.message or "none")
    print("  Result:", result and "success" or "none")
  end)
end

-- 2. Check for dead coroutines
print("\n=== COROUTINE STATUS ===")
local success, err = pcall(function()
  -- This should not cause issues
  vim.lsp.codelens.refresh()
  print("Code lens refresh: OK")
end)

if not success then
  print("Code lens refresh: ERROR -", err)
end

-- 3. Check handlers
print("\n=== LSP HANDLERS ===")
local handlers = vim.lsp.handlers
print("Code lens handler:", handlers["textDocument/codeLens"] and "SET" or "NOT SET")
print("Hover handler:", handlers["textDocument/hover"] and "SET" or "NOT SET")

-- 4. Try to restart LSP
print("\n=== RESTARTING LSP ===")
for _, client in ipairs(clients) do
  print("Restarting client:", client.name)
  vim.lsp.stop_client(client.id)
  vim.defer_fn(function()
    vim.cmd("LspStart " .. client.name)
    print("Client restarted")
  end, 1000)
end

print("\nDiagnostic complete. Wait a moment for restart, then test again.")