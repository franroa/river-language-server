-- Manual Server Start
-- Start the Alloy LSP server manually

print("=== MANUAL SERVER START ===")

-- 1. Check if server is already running
local handle = io.popen("ps aux | grep -i alloy | grep -v grep")
if handle then
  local result = handle:read("*a")
  handle:close()

  if result and result ~= "" then
    print("Server already running:")
    print(result)
    return
  end
end

print("No server found, starting manually...")

-- 2. Try to start the server
-- This assumes the server is built and available
local server_cmd = "cd /home/froa/Projects/alloy/river_lsp/server && npm run start"

print("Starting server with command:")
print(server_cmd)

-- Start server in background
local start_result = os.execute(server_cmd .. " &")
if start_result then
  print("✅ Server start command executed")

  -- Wait a moment for server to start
  vim.defer_fn(function()
    print("Checking if server started...")

    local check_handle = io.popen("ps aux | grep -i alloy | grep -v grep")
    if check_handle then
      local check_result = check_handle:read("*a")
      check_handle:close()

      if check_result and check_result ~= "" then
        print("✅ Server is now running:")
        print(check_result)

        -- Now try to connect LSP client
        vim.defer_fn(function()
          print("Connecting LSP client...")
          vim.cmd("LspStart")

          vim.defer_fn(function()
            local clients = vim.lsp.get_active_clients()
            print("Connected clients:", #clients)

            if #clients > 0 then
              print("✅ LSP connection successful!")
              print("You can now test code lenses")
            else
              print("❌ LSP connection failed")
            end
          end, 1000)
        end, 2000)
      else
        print("❌ Server failed to start")
      end
    end
  end, 3000)
else
  print("❌ Failed to execute server start command")
end

print("\nIf this doesn't work, check:")
print("1. Server build status: cd /home/froa/Projects/alloy/river_lsp/server && npm run compile")
print("2. Server dependencies: cd /home/froa/Projects/alloy/river_lsp/server && npm install")
print("3. Your LSP configuration in Neovim")