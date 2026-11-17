-- Code Lens Diagnostic Script
-- Comprehensive diagnostic for code lens issues

print("=== CODE LENS DIAGNOSTIC ===")

local bufnr = vim.api.nvim_get_current_buf()
local filename = vim.api.nvim_buf_get_name(bufnr)

print("Buffer:", bufnr)
print("File:", filename)

-- 1. Check LSP client status
local clients = vim.lsp.get_active_clients({bufnr = bufnr})
print("\nLSP Clients:", #clients)

for _, client in ipairs(clients) do
  print(string.format("  %s: %s", client.name,
    client.server_capabilities.codeLensProvider and "✅ supports code lens" or "❌ no code lens support"))
end

-- 2. Test parameter construction
print("\n=== PARAMETER CONSTRUCTION TEST ===")

local util_params = vim.lsp.util.make_text_document_params(bufnr)
print("Util params valid:", util_params ~= nil)
print("Has textDocument:", util_params.textDocument ~= nil)
print("Has URI:", util_params.textDocument and util_params.textDocument.uri ~= nil)
print("URI:", util_params.textDocument and util_params.textDocument.uri or "MISSING")

-- 3. Test different request methods
print("\n=== REQUEST METHOD TESTS ===")

-- Method 1: Standard request
print("Method 1: Standard request")
vim.lsp.buf_request(bufnr, 'textDocument/codeLens', util_params, function(err, result, ctx, config)
  print("  Standard result:", err and "ERROR" or (result and #result or "EMPTY"))
end)

-- Method 2: Direct client request
print("Method 2: Direct client request")
for _, client in ipairs(clients) do
  if client.server_capabilities.codeLensProvider then
    client.request('textDocument/codeLens', util_params, function(err, result, ctx, config)
      print("  Direct result:", err and "ERROR" or (result and #result or "EMPTY"))
    end, bufnr)
  end
end

-- Method 3: Manual parameter construction
print("Method 3: Manual parameters")
local manual_params = {
  textDocument = {
    uri = vim.uri_from_fname(filename),
    version = 1
  }
}
print("Manual URI:", manual_params.textDocument.uri)

vim.lsp.buf_request(bufnr, 'textDocument/codeLens', manual_params, function(err, result, ctx, config)
  print("  Manual result:", err and "ERROR" or (result and #result or "EMPTY"))
end)

-- 4. Check for server errors
print("\n=== SERVER ERROR CHECK ===")
vim.defer_fn(function()
  print("Checking LSP logs for errors...")
  -- This would require reading the LSP log file, but we can check for common issues

  print("\n=== POSSIBLE ISSUES ===")
  print("1. Server not compiled with latest changes")
  print("2. LSP client sending malformed requests")
  print("3. Server configuration issues")
  print("4. Document not properly registered with server")

  print("\n=== RECOMMENDED FIXES ===")
  print("1. Compile server: cd /path/to/server && npm run compile")
  print("2. Restart LSP: :LspStop then :LspStart")
  print("3. Check :LspLog for detailed error messages")
  print("4. Try the debug scripts above")

end, 1000)

print("Diagnostic running... check results above")