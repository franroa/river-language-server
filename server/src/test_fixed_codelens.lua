-- Test Fixed Code Lens Provider
-- This tests the updated provider without file system operations

print("=== TESTING FIXED CODE LENS PROVIDER ===")

local bufnr = vim.api.nvim_get_current_buf()
local clients = vim.lsp.get_active_clients({bufnr = bufnr})

print("Active clients:", #clients)

if #clients == 0 then
  print("❌ No LSP clients")
  return
end

-- Test the fixed request
print("\n=== SENDING CODE LENS REQUEST ===")

local params = vim.lsp.util.make_text_document_params(bufnr)
if not params or not params.textDocument then
  print("Util function failed, trying manual construction...")
  local filename = vim.api.nvim_buf_get_name(bufnr)
  if filename == "" then
    print("❌ Buffer has no filename - save the file first")
    return
  end
  params = {
    textDocument = {
      uri = vim.uri_from_fname(filename),
      version = vim.api.nvim_buf_get_var(bufnr, 'changedtick') or 1
    }
  }
  print("Manually created params:")
end

print("Request params:")
print("  URI:", params.textDocument.uri)
print("  Version:", params.textDocument.version)

vim.lsp.buf_request(bufnr, 'textDocument/codeLens', params, function(err, result, ctx, config)
  print("\n=== RESPONSE RECEIVED ===")
  print("Error:", err and vim.inspect(err) or "none")
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
    print("❌ Empty result - check server logs")
    return
  end

  print("✅ SUCCESS! Found", #result, "code lenses:")

  for i, lens in ipairs(result) do
    print(string.format("  %d. Line %d: %s",
      i,
      lens.range.start.line + 1,
      lens.command and lens.command.title or "NO TITLE"
    ))

    if lens.command then
      print(string.format("     Command: %s", lens.command.command))
    end
  end

  -- Code lenses generated successfully - they should appear in the editor
  print("\n=== CODE LENSES GENERATED SUCCESSFULLY ===")
  print("The code lenses should now be visible in your editor above the component declarations.")
  print("If you don't see them, try:")
  print("  - :LspRestart to restart the LSP server")
  print("  - Check :LspLog for any errors")
  print("  - Make sure code lenses are enabled in your LSP client")
end)

function show_as_virtual_text(lenses, bufnr)
  local ns = vim.api.nvim_create_namespace('fixed_codelens')
  vim.api.nvim_buf_clear_namespace(bufnr, ns, 0, -1)

  print("Showing as virtual text:")
  for i, lens in ipairs(lenses) do
    if lens.command and lens.command.title then
      vim.api.nvim_buf_set_extmark(bufnr, ns, lens.range.start.line, 0, {
        virt_text = {{string.format("[FIXED %d] %s", i, lens.command.title), 'Comment'}},
        virt_text_pos = 'eol'
      })
      print(string.format("  Line %d: %s", lens.range.start.line + 1, lens.command.title))
    end
  end
end

print("Request sent - check :LspLog for server debug messages")
print("The fixed version should not have file system errors")