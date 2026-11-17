-- Test if CodeLens is working at all
print("=== TESTING BASIC CODELENS ===")

local bufnr = vim.api.nvim_get_current_buf()
local clients = vim.lsp.get_active_clients({bufnr = bufnr})

print("Active clients:", #clients)

if #clients == 0 then
  print("❌ No LSP clients")
  return
end

-- Get current line content
local cursor = vim.api.nvim_win_get_cursor(0)
local current_line = vim.api.nvim_get_current_line()
print(string.format("Current line %d: '%s'", cursor[1], current_line))

-- Request code lenses
vim.lsp.buf_request(bufnr, 'textDocument/codeLens', {
  textDocument = {
    uri = vim.uri_from_fname(vim.api.nvim_buf_get_name(bufnr)),
    version = vim.api.nvim_buf_get_var(bufnr, 'changedtick') or 1
  }
}, function(err, result, ctx, config)
  print("\n=== CODE LENS RESPONSE ===")
  print("Error:", err and vim.inspect(err) or "none")
  print("Result type:", type(result))
  print("Result count:", result and #result or "none")

  if result and #result > 0 then
    print("✅ Found lenses!")
    for i, lens in ipairs(result) do
      print(string.format("  Lens %d: %s", i, lens.command and lens.command.title or "NO TITLE"))
      print(string.format("    Range: %d:%d - %d:%d",
        lens.range.start.line + 1,
        lens.range.start.character + 1,
        lens.range["end"].line + 1,
        lens.range["end"].character + 1))
      print(string.format("    Command: '%s'", lens.command and lens.command.command or "NO COMMAND"))
    end

    -- Check if cursor is within any lens range
    local cursor_in_any_lens = false
    for i, lens in ipairs(result) do
      local start_line = lens.range.start.line + 1
      local end_line = lens.range["end"].line + 1
      local start_char = lens.range.start.character + 1
      local end_char = lens.range["end"].character + 1

      if cursor[1] >= start_line and cursor[1] <= end_line then
        if cursor[1] == start_line and cursor[1] == end_line then
          if cursor[2] + 1 >= start_char and cursor[2] + 1 <= end_char then
            cursor_in_any_lens = true
            print(string.format("  ✅ Cursor is within lens %d range", i))
            break
          end
        else
          cursor_in_any_lens = true
          print(string.format("  ✅ Cursor is within lens %d range", i))
          break
        end
      end
    end

    if not cursor_in_any_lens then
      print("  ❌ Cursor is NOT within any lens range")
    end

    -- Try to run the lens
    print("\n=== TESTING vim.lsp.codelens.run() ===")
    local success, run_err = pcall(function()
      vim.lsp.codelens.run()
    end)

    if success then
      print("✅ vim.lsp.codelens.run() succeeded")
    else
      print("❌ vim.lsp.codelens.run() failed:", run_err)
    end
  else
    print("❌ No lenses found")
  end
end)

print("CodeLens request sent...")