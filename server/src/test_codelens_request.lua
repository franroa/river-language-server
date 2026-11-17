-- Test Code Lens Request with Proper Parameters
-- This ensures the request is sent with correct parameters

print("=== TESTING CODE LENS REQUEST WITH PROPER PARAMS ===")

local bufnr = vim.api.nvim_get_current_buf()
local filename = vim.api.nvim_buf_get_name(bufnr)

print("Buffer:", bufnr)
print("File:", filename)

-- 1. Check if LSP client is available
local clients = vim.lsp.get_active_clients({bufnr = bufnr})
print("Active clients:", #clients)

if #clients == 0 then
  print("❌ No LSP clients")
  return
end

-- 2. Create proper parameters
local params = {
  textDocument = {
    uri = vim.uri_from_fname(filename),
    version = vim.api.nvim_buf_get_var(bufnr, 'changedtick') or 1
  }
}

print("Request parameters:")
print("  URI:", params.textDocument.uri)
print("  Version:", params.textDocument.version)

-- 3. Send the request
print("\n=== SENDING CODE LENS REQUEST ===")

vim.lsp.buf_request(bufnr, 'textDocument/codeLens', params, function(err, result, ctx, config)
  print("\n=== RESPONSE ===")
  print("Error:", err and vim.inspect(err) or "none")
  print("Result:", result and vim.inspect(result) or "none")

  if err then
    print("❌ Request failed")
    if err.message then
      print("Error message:", err.message)
    end
  elseif not result then
    print("❌ No result")
  elseif #result == 0 then
    print("❌ Empty result")
  else
    print("✅ SUCCESS! Found", #result, "code lenses")
    for i, lens in ipairs(result) do
      print(string.format("  %d. Line %d: %s", i, lens.range.start.line + 1,
        lens.command and lens.command.title or "NO TITLE"))
    end
  end
end)

-- 4. Also test with vim.lsp.util.make_text_document_params
print("\n=== TESTING WITH UTIL FUNCTION ===")

local util_params = vim.lsp.util.make_text_document_params(bufnr)
print("Util params:")
print("  URI:", util_params.textDocument.uri)
print("  Version:", util_params.textDocument.version)

vim.lsp.buf_request(bufnr, 'textDocument/codeLens', util_params, function(err, result, ctx, config)
  print("\n=== UTIL RESPONSE ===")
  print("Error:", err and vim.inspect(err) or "none")
  print("Result:", result and #result or "none")

  if result and #result > 0 then
    print("✅ Util method works! Found", #result, "code lenses")
  end
end)

print("\n=== TEST COMPLETE ===")
print("Check :LspLog for server debug messages")
print("If both requests fail, the issue is on the server side")
print("If one works and the other doesn't, the issue is with parameter construction")