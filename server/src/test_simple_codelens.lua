-- Simple test to check if code lenses are being generated
print("=== SIMPLE CODE LENS TEST ===")

local bufnr = vim.api.nvim_get_current_buf()
local clients = vim.lsp.get_active_clients({bufnr = bufnr})

print("Active clients:", #clients)

if #clients == 0 then
  print("❌ No LSP clients")
  return
end

-- Get the current buffer name
local filename = vim.api.nvim_buf_get_name(bufnr)
print("Current file:", filename)

-- Send code lens request
vim.lsp.buf_request(bufnr, 'textDocument/codeLens', {
  textDocument = {
    uri = vim.uri_from_fname(filename),
    version = vim.api.nvim_buf_get_var(bufnr, 'changedtick') or 1
  }
}, function(err, result, ctx, config)
  print("\n=== CODE LENS RESPONSE ===")
  print("Error:", err and vim.inspect(err) or "none")
  print("Result type:", type(result))
  print("Result count:", result and #result or "none")

  if err then
    print("❌ Request failed:", err.message)
    return
  end

  if not result then
    print("❌ No result returned")
    return
  end

  if #result == 0 then
    print("❌ Empty result - no code lenses generated")
    print("This could mean:")
    print("  - Component data not loaded")
    print("  - Configuration disabled")
    print("  - No components found in file")
    return
  end

  print("✅ SUCCESS! Found", #result, "code lenses:")

  for i, lens in ipairs(result) do
    print(string.format("  %d. Line %d-%d: %s",
      i,
      lens.range.start.line + 1,
      lens.range["end"].line + 1,
      lens.command and lens.command.title or "NO TITLE"
    ))

    if lens.command then
      print(string.format("     Command: '%s'", lens.command.command or "empty"))
      if lens.command.arguments and #lens.command.arguments > 0 then
        print(string.format("     Args: %s", vim.inspect(lens.command.arguments)))
      else
        print("     Args: none")
      end
    else
      print("     No command attached")
    end
  end

  -- Try to display the lenses
  print("\n=== ATTEMPTING TO DISPLAY LENSES ===")
  local success, display_err = pcall(function()
    vim.lsp.codelens.display(result, bufnr, clients[1])
    print("✅ Display successful")
  end)

  if not success then
    print("❌ Display failed:", display_err)
  end

  print("\n=== TEST COMPLETE ===")
end)

print("Code lens request sent - waiting for response...")