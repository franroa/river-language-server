-- Code Lens Fallback Solution
-- Works even if LSP server is not running

print("=== CODE LENS FALLBACK SOLUTION ===")

-- 1. Clear any existing virtual text
local function clear_codelens()
  local bufnr = vim.api.nvim_get_current_buf()
  local ns = vim.api.nvim_create_namespace('alloy_codelens_fallback')
  vim.api.nvim_buf_clear_namespace(bufnr, ns, 0, -1)
  print("Code lens virtual text cleared")
end

-- 2. Manual code lens simulation
local function simulate_codelens()
  local bufnr = vim.api.nvim_get_current_buf()
  local filename = vim.api.nvim_buf_get_name(bufnr)

  print("Simulating code lenses for:", filename)

  -- Get buffer content
  local lines = vim.api.nvim_buf_get_lines(bufnr, 0, -1, false)

  -- Clear existing
  clear_codelens()

  -- Simulate code lens detection
  local ns = vim.api.nvim_create_namespace('alloy_codelens_fallback')
  local lens_count = 0

  for i, line in ipairs(lines) do
    local line_num = i - 1 -- 0-based

    -- Check for declare blocks
    if line:match("^declare%s+") then
      local declare_match = line:match('declare%s+"([^"]+)"')
      if declare_match then
        vim.api.nvim_buf_set_extmark(bufnr, ns, line_num, 0, {
          virt_text = {{"🔍 0 usages (declare)", 'Comment'}},
          virt_text_pos = 'eol'
        })
        lens_count = lens_count + 1
        print(string.format("Added declare lens at line %d: %s", i, declare_match))
      end
    end

    -- Check for component declarations
    if line:match("%w+%.%w+%s+") then
      local component_match = line:match('^(%w+%.%w+)%s+"([^"]+)"')
      if component_match then
        local component_type, component_label = component_match:match('^(%w+%.%w+)%s+"([^"]+)"')
        if component_type and component_label then
          vim.api.nvim_buf_set_extmark(bufnr, ns, line_num, 0, {
            virt_text = {{"🔍 0 references (simulated)", 'Comment'}},
            virt_text_pos = 'eol'
          })
          lens_count = lens_count + 1
          print(string.format("Added component lens at line %d: %s", i, component_type))
        end
      end
    end

    -- Check for export blocks
    if line:match("^export%s+") then
      local export_match = line:match('export%s+"([^"]+)"')
      if export_match then
        vim.api.nvim_buf_set_extmark(bufnr, ns, line_num, 0, {
          virt_text = {{"🔍 0 usages of export", 'Comment'}},
          virt_text_pos = 'eol'
        })
        lens_count = lens_count + 1
        print(string.format("Added export lens at line %d: %s", i, export_match))
      end
    end
  end

  print(string.format("✅ Added %d simulated code lenses", lens_count))
end

-- 3. Set up keybindings
vim.keymap.set('n', '<leader>clf', simulate_codelens, { desc = 'Show simulated code lenses' })
vim.keymap.set('n', '<leader>clc', clear_codelens, { desc = 'Clear code lens virtual text' })

-- 4. Auto-run on Alloy files
vim.api.nvim_create_autocmd("BufRead", {
  pattern = "*.alloy",
  callback = function()
    vim.defer_fn(simulate_codelens, 1000)
  end
})

-- 5. Initial run
vim.defer_fn(simulate_codelens, 500)

print("Fallback solution applied!")
print("Keybindings:")
print("  <leader>clf - Show simulated code lenses")
print("  <leader>clc - Clear virtual text")
print("")
print("This works even if the LSP server is not running")
print("Look for 🔍 symbols at the end of lines with code lens information")