-- Manual Code Lens Test
-- This script manually requests code lenses to test if the server is working

print("=== MANUAL CODE LENS TEST ===")

local bufnr = vim.api.nvim_get_current_buf()
local filename = vim.api.nvim_buf_get_name(bufnr)

print("Testing file:", filename)
print("Buffer:", bufnr)

-- 1. Check if we have LSP clients
local clients = vim.lsp.get_active_clients({bufnr = bufnr})
print("Active clients:", #clients)

local has_codelens_client = false
for _, client in ipairs(clients) do
  print(string.format("Client: %s", client.name))
  if client.server_capabilities.codeLensProvider then
    print("  ✓ Supports code lens")
    has_codelens_client = true
  else
    print("  ✗ Does not support code lens")
  end
end

if not has_codelens_client then
  print("ERROR: No LSP client supports code lens!")
  return
end

-- 2. Create request parameters
local params = vim.lsp.util.make_text_document_params(bufnr)
print("Request parameters:")
print("  URI:", params.textDocument.uri)
print("  Version:", params.textDocument.version)

-- 3. Send manual code lens request
print("\n=== SENDING CODE LENS REQUEST ===")

vim.lsp.buf_request(bufnr, 'textDocument/codeLens', params, function(err, result, ctx, config)
  print("\n=== CODE LENS RESPONSE ===")
  print("Error:", err and err.message or "none")
  print("Result type:", type(result))
  print("Result count:", result and #result or "none")

  if err then
    print("ERROR:", err.message)
    return
  end

  if not result then
    print("No result returned")
    return
  end

  if #result == 0 then
    print("Empty result - no code lenses found")
    return
  end

  print("SUCCESS! Found", #result, "code lenses:")
  for i, lens in ipairs(result) do
    print(string.format("  %d. Line %d-%d: %s",
      i,
      lens.range.start.line + 1,
      lens.range.end.line + 1,
      lens.command and lens.command.title or "NO_TITLE"
    ))

    if lens.command then
      print(string.format("     Command: %s", lens.command.command))
      if lens.command.arguments then
        print(string.format("     Args: %s", vim.inspect(lens.command.arguments)))
      end
    end
  end

  -- 4. Try to display the code lenses
  print("\n=== ATTEMPTING TO DISPLAY CODE LENSES ===")
  local success, display_err = pcall(function()
    vim.lsp.codelens.display(result, bufnr)
    print("Display: SUCCESS")
  end)

  if not success then
    print("Display: FAILED -", display_err)
  end
end)

print("Request sent. Waiting for response...")
print("Check LSP logs with :LspLog for server-side debug messages")