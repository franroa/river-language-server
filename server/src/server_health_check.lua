-- Server Health Check
-- Check if the LSP server is actually running

print("=== SERVER HEALTH CHECK ===")

-- 1. Check running processes
print("Checking for running LSP server processes...")
local handle = io.popen("ps aux | grep -i alloy | grep -v grep")
if handle then
  local result = handle:read("*a")
  handle:close()

  if result and result ~= "" then
    print("Found alloy processes:")
    print(result)
  else
    print("❌ No alloy LSP server processes found!")
    print("The server may have crashed or never started.")
  end
else
  print("Could not check processes")
end

-- 2. Check Neovim LSP clients
local bufnr = vim.api.nvim_get_current_buf()
local clients = vim.lsp.get_active_clients({bufnr = bufnr})

print("\nNeovim LSP clients:", #clients)
for _, client in ipairs(clients) do
  print(string.format("  %s (ID: %d) - %s",
    client.name,
    client.id,
    vim.lsp.client_is_stopped(client.id) and "STOPPED" or "RUNNING"
  ))
end

-- 3. Try to start the server manually
if #clients == 0 then
  print("\n❌ No LSP clients found!")
  print("Starting LSP server...")

  -- Try to start the LSP
  vim.cmd("LspStart")

  vim.defer_fn(function()
    local new_clients = vim.lsp.get_active_clients({bufnr = bufnr})
    print("After restart:", #new_clients, "clients")

    if #new_clients > 0 then
      print("✅ LSP server started successfully")
    else
      print("❌ Failed to start LSP server")
      print("Check your LSP configuration and server path")
    end
  end, 2000)
end

print("\n=== RECOMMENDATIONS ===")
print("If no server processes are found:")
print("1. Check if the server executable exists")
print("2. Verify your LSP configuration")
print("3. Try starting the server manually")
print("4. Check LSP logs with :LspLog")