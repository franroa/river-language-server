-- Check LSP Server Status
-- This script checks if the LSP server is running and responsive

print("=== LSP SERVER STATUS CHECK ===")

local bufnr = vim.api.nvim_get_current_buf()
local clients = vim.lsp.get_active_clients({bufnr = bufnr})

print("Active clients:", #clients)

for _, client in ipairs(clients) do
  print(string.format("\n=== CLIENT: %s ===", client.name))
  print("ID:", client.id)
  print("Status:", vim.lsp.client_is_stopped(client.id) and "STOPPED" or "RUNNING")

  -- Check if server is responsive
  print("Testing server responsiveness...")

  -- Simple hover request to test
  vim.lsp.buf_request(bufnr, 'textDocument/hover', {
    textDocument = vim.lsp.util.make_text_document_params(bufnr),
    position = { line = 0, character = 0 }
  }, function(err, result, ctx, config)
    print("Hover test:")
    print("  Error:", err and err.message or "none")
    print("  Result:", result and "SUCCESS" or "FAILED")

    if err then
      print("❌ Server is not responding - needs restart")
    else
      print("✅ Server is responsive")
    end
  end)

  -- Check code lens capability
  print("Code lens capability:", vim.inspect(client.server_capabilities.codeLensProvider))
end

-- Check if we can find the server process
print("\n=== CHECKING SERVER PROCESS ===")
local success, result = pcall(function()
  -- Try to find node processes (assuming the server is running via node)
  vim.fn.system("ps aux | grep -i alloy | grep -v grep")
  local output = vim.fn.system("ps aux | grep -i alloy | grep -v grep")
  if output and output ~= "" then
    print("Found alloy processes:")
    print(output)
  else
    print("No alloy processes found")
  end
end)

if not success then
  print("Could not check processes:", result)
end

print("\n=== RECOMMENDATIONS ===")
print("If server is not responding:")
print("1. :LspStop")
print("2. :LspStart")
print("3. Wait a few seconds")
print("4. Run the minimal test again")