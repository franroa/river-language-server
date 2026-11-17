-- Check Server Logs for Code Lens Debug Info
-- This helps us see what's happening on the server side

print("=== CHECKING SERVER LOGS ===")

-- 1. Check if LSP is running and responsive
local bufnr = vim.api.nvim_get_current_buf()
local clients = vim.lsp.get_active_clients({bufnr = bufnr})

print("Active clients:", #clients)

if #clients == 0 then
  print("❌ No LSP clients - restart LSP first")
  print("Try: :LspStop then :LspStart")
  return
end

-- 2. Send a test request to trigger server logging
print("\n=== SENDING TEST REQUEST TO TRIGGER LOGGING ===")

vim.lsp.buf_request(bufnr, 'textDocument/codeLens', vim.lsp.util.make_text_document_params(bufnr), function(err, result, ctx, config)
  print("Test request completed")
  print("Error:", err and err.message or "none")
  print("Result:", result and #result or "none")

  print("\n=== NEXT STEPS ===")
  print("1. Check :LspLog for server debug messages")
  print("2. Look for messages starting with '[DEBUG]' or '[CodeLens]'")
  print("3. If you see server logs, the issue is in the code lens logic")
  print("4. If you don't see server logs, the request isn't reaching the server")
end)

-- 3. Also test a simple request to make sure LSP is working
print("\n=== TESTING BASIC LSP FUNCTIONALITY ===")

vim.lsp.buf_request(bufnr, 'textDocument/hover', {
  textDocument = vim.lsp.util.make_text_document_params(bufnr),
  position = { line = 0, character = 0 }
}, function(err, result, ctx, config)
  print("Hover test:")
  print("  Error:", err and err.message or "none")
  print("  Result:", result and "SUCCESS" or "FAILED")

  if result then
    print("✅ LSP is working - server is responsive")
  else
    print("❌ LSP is not working - check server status")
  end
end)

print("\n=== INSTRUCTIONS ===")
print("After running this script:")
print("1. Run :LspLog")
print("2. Look for code lens related messages")
print("3. Share any [DEBUG] or [CodeLens] messages you find")
print("4. If no server logs appear, the request isn't reaching the server")