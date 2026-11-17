-- Test Updated Code Lens Provider
-- This tests the improved component detection logic

print("=== TESTING UPDATED CODE LENS PROVIDER ===")

local bufnr = vim.api.nvim_get_current_buf()
local clients = vim.lsp.get_active_clients({bufnr = bufnr})

print("Active clients:", #clients)

if #clients == 0 then
  print("❌ No LSP clients - restart LSP first")
  print("Try: :LspStop then :LspStart")
  return
end

-- Test the updated component detection
print("\n=== TESTING COMPONENT DETECTION ===")

-- Read the current file
local lines = vim.api.nvim_buf_get_lines(bufnr, 0, -1, false)
print("File has", #lines, "lines")

-- Test patterns that should work with the updated logic
local patterns_found = {
  declare = 0,
  component = 0,
  export = 0
}

for i, line in ipairs(lines) do
  local trimmed = line:match("^%s*(.-)%s*$") or line

  -- Test declare pattern
  if trimmed:match('^declare%s+"') then
    patterns_found.declare = patterns_found.declare + 1
    print(string.format("✅ Found declare at line %d: %s", i, trimmed))
  end

  -- Test component patterns (using known component names)
  local known_components = {
    "prometheus.scrape",
    "prometheus.remote_write",
    "loki.write",
    "otelcol.receiver",
    "pyroscope.scrape"
  }

  for _, comp in ipairs(known_components) do
    if trimmed:match('^' .. comp:gsub('%.', '%%.') .. '%s+"') then
      patterns_found.component = patterns_found.component + 1
      print(string.format("✅ Found component at line %d: %s", i, trimmed))
      break
    end
  end

  -- Test export pattern
  if trimmed:match('^export%s+"') then
    patterns_found.export = patterns_found.export + 1
    print(string.format("✅ Found export at line %d: %s", i, trimmed))
  end
end

print(string.format("\n=== PATTERNS FOUND ==="))
print("Declare blocks:", patterns_found.declare)
print("Components:", patterns_found.component)
print("Export blocks:", patterns_found.export)
print("Total patterns:", patterns_found.declare + patterns_found.component + patterns_found.export)

if patterns_found.declare + patterns_found.component + patterns_found.export > 0 then
  print("✅ Patterns detected - code lens should work!")
else
  print("❌ No patterns detected - check file content")
end

-- Test LSP request
print("\n=== TESTING LSP REQUEST ===")
vim.lsp.buf_request(bufnr, 'textDocument/codeLens', vim.lsp.util.make_text_document_params(bufnr), function(err, result, ctx, config)
  print("LSP Response:")
  print("  Error:", err and err.message or "none")
  print("  Result:", result and #result or "none")

  if err then
    print("❌ LSP request failed")
  elseif not result then
    print("❌ No result from server")
  elseif #result == 0 then
    print("❌ Server returned empty result")
  else
    print("✅ Server returned", #result, "code lenses!")
    for i, lens in ipairs(result) do
      print(string.format("  %d. Line %d: %s", i, lens.range.start.line + 1,
        lens.command and lens.command.title or "NO TITLE"))
    end
  end
end)

print("\n=== TEST COMPLETE ===")
print("If patterns are found but LSP returns empty, the issue is in the server logic")
print("If patterns are not found, the issue is in the pattern matching")
print("Check :LspLog for server-side debug messages")