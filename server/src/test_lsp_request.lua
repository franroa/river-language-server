-- Test LSP Code Lens Request
-- Send a manual request and inspect the response

print("=== TEST LSP CODE LENS REQUEST ===")

local bufnr = vim.api.nvim_get_current_buf()
local clients = vim.lsp.get_active_clients({bufnr = bufnr})

print("Active clients:", #clients)

if #clients == 0 then
  print("❌ No LSP clients")
  return
end

-- Find the alloy client
local alloy_client = nil
for _, client in ipairs(clients) do
  if client.name:match("alloy") then
    alloy_client = client
    break
  end
end

if not alloy_client then
  print("❌ No alloy LSP client found")
  return
end

print("Found alloy client:", alloy_client.name)
print("Supports code lens:", alloy_client.server_capabilities.codeLensProvider ~= nil)

-- Create request parameters
local params = vim.lsp.util.make_text_document_params(bufnr)
print("Request params:")
print("  URI:", params.textDocument.uri)
print("  Version:", params.textDocument.version)

-- Send the request
print("\n=== SENDING REQUEST ===")

vim.lsp.buf_request(bufnr, 'textDocument/codeLens', params, function(err, result, ctx, config)
  print("\n=== RESPONSE RECEIVED ===")
  print("Error:", err and vim.inspect(err) or "none")
  print("Result type:", type(result))
  print("Result:", result and vim.inspect(result) or "none")

  if err then
    print("❌ Request failed with error:", err.message)
    if err.code then
      print("Error code:", err.code)
    end
    return
  end

  if not result then
    print("❌ No result returned")
    return
  end

  if type(result) ~= "table" then
    print("❌ Result is not a table:", type(result))
    return
  end

  if #result == 0 then
    print("❌ Empty result - no code lenses found")
    print("This means the server processed the request but found nothing")
    return
  end

  print("✅ SUCCESS! Found", #result, "code lenses")

  for i, lens in ipairs(result) do
    print(string.format("\nLens %d:", i))
    print("  Range:", vim.inspect(lens.range))
    print("  Command:", lens.command and vim.inspect(lens.command) or "none")

    if lens.command then
      print("  Title:", lens.command.title)
      print("  Command:", lens.command.command)
      if lens.command.arguments then
        print("  Arguments:", vim.inspect(lens.command.arguments))
      end
    end
  end

  -- Try to display them
  print("\n=== ATTEMPTING TO DISPLAY ===")
  local success, display_err = pcall(function()
    vim.lsp.codelens.on_codelens(nil, result, ctx, config)
    print("✅ Display successful")
  end)

  if not success then
    print("❌ Display failed:", display_err)
    -- Fallback: show as virtual text
    show_as_virtual_text(result, bufnr)
  end
end)

function show_as_virtual_text(lenses, bufnr)
  local ns = vim.api.nvim_create_namespace('test_lenses')
  vim.api.nvim_buf_clear_namespace(bufnr, ns, 0, -1)

  for i, lens in ipairs(lenses) do
    if lens.command and lens.command.title then
      vim.api.nvim_buf_set_extmark(bufnr, ns, lens.range.start.line, 0, {
        virt_text = {{string.format("[LENS %d] %s", i, lens.command.title), 'Comment'}},
        virt_text_pos = 'eol'
      })
    end
  end

  print("✅ Showed lenses as virtual text")
end

print("Request sent - waiting for response...")
print("Check :LspLog for server-side debug messages")