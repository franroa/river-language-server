-- Check Code Lens Configuration
-- Verify that code lens is enabled in the LSP configuration

print("=== CHECKING CODE LENS CONFIGURATION ===")

local bufnr = vim.api.nvim_get_current_buf()
local clients = vim.lsp.get_active_clients({bufnr = bufnr})

print("Active clients:", #clients)

for _, client in ipairs(clients) do
  print(string.format("\n=== CLIENT: %s ===", client.name))

  -- Check server capabilities
  print("Code lens capability:", client.server_capabilities.codeLensProvider ~= nil)

  if client.server_capabilities.codeLensProvider then
    print("Code lens provider details:")
    for k, v in pairs(client.server_capabilities.codeLensProvider) do
      print(string.format("  %s: %s", k, vim.inspect(v)))
    end
  end

  -- Check client configuration
  print("Client config:")
  if client.config and client.config.settings then
    print("  Has settings:", true)
    if client.config.settings.alloyLsp then
      print("  Alloy LSP settings:")
      for k, v in pairs(client.config.settings.alloyLsp) do
        print(string.format("    %s: %s", k, vim.inspect(v)))
      end
    else
      print("  No alloyLsp settings found")
    end
  else
    print("  No settings found")
  end

  -- Check initialization options
  if client.config and client.config.init_options then
    print("Init options:")
    for k, v in pairs(client.config.init_options) do
      print(string.format("  %s: %s", k, vim.inspect(v)))
    end
  end
end

-- Test code lens request with detailed logging
print("\n=== TESTING CODE LENS REQUEST ===")

local params = vim.lsp.util.make_text_document_params(bufnr)
print("Request params:")
print("  URI:", params.textDocument.uri)
print("  Version:", params.textDocument.version)

vim.lsp.buf_request(bufnr, 'textDocument/codeLens', params, function(err, result, ctx, config)
  print("\nCode lens response:")
  print("  Error:", err and vim.inspect(err) or "none")
  print("  Result:", result and vim.inspect(result) or "none")

  if err then
    print("❌ Request failed")
    if err.code then
      print("Error code:", err.code)
      print("Error message:", err.message)
    end
  elseif not result then
    print("❌ No result")
  elseif #result == 0 then
    print("❌ Empty result - check server logs")
  else
    print("✅ Success! Found", #result, "code lenses")
  end

  print("\n=== NEXT STEPS ===")
  print("1. Check :LspLog for server debug messages")
  print("2. Look for '[CodeLens]' messages")
  print("3. If no server logs, the request isn't reaching the server")
  print("4. If server logs show 'Code lens enabled: false', code lens is disabled")
end)

print("Request sent - waiting for response...")