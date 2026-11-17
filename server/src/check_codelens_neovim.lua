-- Check if Neovim is properly configured for code lens
print("=== NEOVIM CODE LENS CONFIGURATION CHECK ===")

-- 1. Check if code lens is enabled in Neovim
print("Code lens module available:", vim.lsp.codelens ~= nil)

if vim.lsp.codelens then
  print("Code lens functions:")
  print("  display:", type(vim.lsp.codelens.display))
  print("  refresh:", type(vim.lsp.codelens.refresh))
  print("  run:", type(vim.lsp.codelens.run))
  print("  on_codelens:", type(vim.lsp.codelens.on_codelens))
else
  print("ERROR: vim.lsp.codelens is not available!")
end

-- 2. Check LSP client capabilities
local bufnr = vim.api.nvim_get_current_buf()
local clients = vim.lsp.get_active_clients({bufnr = bufnr})

print("\n=== LSP CLIENT CAPABILITIES ===")
for _, client in ipairs(clients) do
  print(string.format("Client: %s", client.name))
  print("  Code lens capability:", vim.inspect(client.server_capabilities.codeLensProvider))

  if client.server_capabilities.codeLensProvider then
    print("  ✓ Server supports code lens")
  else
    print("  ✗ Server does NOT support code lens")
  end
end

-- 3. Check if code lens is enabled in client config
print("\n=== CLIENT CONFIGURATION ===")
for _, client in ipairs(clients) do
  print(string.format("Client: %s", client.name))
  print("  Config:", vim.inspect(client.config))

  -- Check if code lens is disabled in client config
  if client.config.capabilities and client.config.capabilities.textDocument then
    print("  Text document capabilities:", vim.inspect(client.config.capabilities.textDocument))
  end
end

-- 4. Check Neovim LSP handlers
print("\n=== LSP HANDLERS ===")
local handlers = vim.lsp.handlers
print("Code lens handler registered:", handlers["textDocument/codeLens"] ~= nil)

if handlers["textDocument/codeLens"] then
  print("  Handler type:", type(handlers["textDocument/codeLens"]))
end

-- 5. Check if code lens autocmds are set up
print("\n=== AUTOCOMMANDS ===")
local autocmds = vim.api.nvim_get_autocmds({event = "LspAttach"})
print("LspAttach autocmds:", #autocmds)

for _, autocmd in ipairs(autocmds) do
  if autocmd.desc and autocmd.desc:match("codelens") then
    print("  Code lens autocmd:", autocmd.desc)
  end
end

-- 6. Manual test - try to request code lens
print("\n=== MANUAL CODE LENS TEST ===")
local params = vim.lsp.util.make_text_document_params(bufnr)
print("Request params:", vim.inspect(params))

-- Try the request
vim.lsp.buf_request(bufnr, 'textDocument/codeLens', params, function(err, result, ctx, config)
  print("Manual request result:")
  print("  Error:", err and err.message or "none")
  print("  Result:", result and #result or "none")

  if result then
    for i, lens in ipairs(result) do
      print(string.format("  Lens %d: %s at line %d", i,
        lens.command and lens.command.title or "NO_TITLE",
        lens.range.start.line + 1))
    end
  end
end)

print("\n=== CHECK COMPLETE ===")
print("If code lens is supported but not working, try running the fix script.")