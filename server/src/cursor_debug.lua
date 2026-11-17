-- Debug script to check cursor position vs code lens ranges
print("=== CURSOR VS CODE LENS DEBUG ===")

local bufnr = vim.api.nvim_get_current_buf()
local cursor = vim.api.nvim_win_get_cursor(0)
local cursor_line = cursor[1] - 1  -- Convert to 0-based
local cursor_col = cursor[2]

print(string.format("Cursor position: line %d (0-based: %d), column %d", cursor[1], cursor_line, cursor_col))

-- Get current line content
local lines = vim.api.nvim_buf_get_lines(bufnr, cursor_line, cursor_line + 1, false)
if #lines > 0 then
  local line_content = lines[1]
  print(string.format("Current line content: '%s'", line_content))
  print(string.format("Character at cursor: '%s'", string.sub(line_content, cursor_col + 1, cursor_col + 1)))
end

-- Request code lenses and check ranges
vim.lsp.buf_request(bufnr, 'textDocument/codeLens', {
  textDocument = vim.lsp.util.make_text_document_params(bufnr)
}, function(err, result, ctx, config)
  if err then
    print("Error:", err.message)
    return
  end
  
  if not result or #result == 0 then
    print("❌ No code lenses found!")
    return
  end
  
  print(string.format("✅ Found %d code lenses:", #result))
  
  local found_at_cursor = false
  for i, lens in ipairs(result) do
    local start_line = lens.range.start.line
    local start_char = lens.range.start.character
    local end_line = lens.range['end'].line
    local end_char = lens.range['end'].character
    
    print(string.format("  %d. %s", i, lens.command and lens.command.title or "No title"))
    print(string.format("     Range: line %d-%d, chars %d-%d", start_line, end_line, start_char, end_char))
    
    -- Check if cursor is within this code lens range
    local cursor_in_range = false
    if start_line == end_line then
      -- Single line range
      cursor_in_range = (cursor_line == start_line and cursor_col >= start_char and cursor_col <= end_char)
    else
      -- Multi-line range
      cursor_in_range = (cursor_line >= start_line and cursor_line <= end_line)
    end
    
    if cursor_in_range then
      print("     🎯 CURSOR IS IN THIS RANGE!")
      found_at_cursor = true
    else
      print("     ❌ Cursor not in this range")
    end
  end
  
  if not found_at_cursor then
    print(string.format("\n❌ No code lens found at cursor position (line %d, col %d)", cursor_line, cursor_col))
    print("To fix this, place your cursor at the beginning of a component line:")
    for _, lens in ipairs(result) do
      print(string.format("  - Move to line %d, character %d-%d", 
        lens.range.start.line + 1, 
        lens.range.start.character,
        lens.range['end'].character))
    end
  else
    print("\n✅ Found code lens at cursor position!")
  end
  
  -- Show code lenses visually
  local ns = vim.api.nvim_create_namespace('cursor_debug')
  vim.api.nvim_buf_clear_namespace(bufnr, ns, 0, -1)
  
  for _, lens in ipairs(result) do
    vim.api.nvim_buf_set_extmark(bufnr, ns, lens.range.start.line, 0, {
      virt_text = {{'🔍 ' .. (lens.command and lens.command.title or 'No title'), 'WarningMsg'}},
      virt_text_pos = 'eol'
    })
  end
end)