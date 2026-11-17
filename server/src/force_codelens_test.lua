-- Force code lens request test
print("=== FORCING CODE LENS REQUEST ===")

local bufnr = vim.api.nvim_get_current_buf()

-- 1. Check if LSP client supports code lens
local clients = vim.lsp.get_active_clients({bufnr = bufnr})
print("Active clients for buffer:", #clients)

for _, client in ipairs(clients) do
  print("Client:", client.name)
  print("Code lens capability:", vim.inspect(client.server_capabilities.codeLensProvider))
end

-- 2. Force a manual code lens request
print("\n=== MANUAL CODE LENS REQUEST ===")
local params = vim.lsp.util.make_text_document_params(bufnr)
print("Sending request with params:", vim.inspect(params))

-- Use vim.lsp.buf_request_all to see all responses
vim.lsp.buf_request_all(bufnr, 'textDocument/codeLens', params, function(responses)
  print("\n=== CODE LENS RESPONSES ===")
  for client_id, response in pairs(responses) do
    print("Client ID:", client_id)
    print("Error:", response.err and response.err.message or "none")
    print("Result:", response.result and #response.result or "none")
    
    if response.result then
      print("Code lenses:")
      for i, lens in ipairs(response.result) do
        print(string.format("  %d. %s at line %d", 
          i, 
          lens.command and lens.command.title or "NO_TITLE",
          lens.range.start.line + 1
        ))
      end
    end
  end
end)

-- 3. Test individual LSP client request
print("\n=== INDIVIDUAL CLIENT REQUEST ===")
for _, client in ipairs(clients) do
  if client.server_capabilities.codeLensProvider then
    print("Requesting code lens from:", client.name)
    client.request('textDocument/codeLens', params, function(err, result, ctx, config)
      print("Response from", client.name)
      print("Error:", err and err.message or "none")
      print("Result:", result and #result or "none")
      if result then
        for i, lens in ipairs(result) do
          print(string.format("  %d. %s", i, lens.command and lens.command.title or "NO_TITLE"))
        end
      end
    end, bufnr)
  else
    print("Client", client.name, "does not support code lens")
  end
end

print("\n=== Check LSP logs now with :LspLog ===")