-- Test Code Lens Commands
-- Run this to verify that code lens commands are working

print("=== TESTING CODE LENS COMMANDS ===")

-- Test 1: Check available commands
local clients = vim.lsp.get_active_clients()
for _, client in ipairs(clients) do
  if client.name:match("alloy") then
    print("Alloy LSP Commands:")
    if client.server_capabilities.executeCommandProvider then
      for _, cmd in ipairs(client.server_capabilities.executeCommandProvider.commands) do
        print("  " .. cmd)
      end
    else
      print("  No execute command provider")
    end
  end
end

-- Test 2: Try to execute code lens commands directly
print("\n=== TESTING DIRECT COMMAND EXECUTION ===")

local test_commands = {
  { command = "alloy.showReferences", arguments = {"prometheus.scrape", "test_app"} },
  { command = "alloy.showComponentHelp", arguments = {"prometheus.scrape"} },
  { command = "alloy.showComponentDocs", arguments = {"prometheus.scrape"} },
  { command = "alloy.showDeclareUsages", arguments = {"test_db"} },
}

for _, cmd_info in ipairs(test_commands) do
  print(string.format("Testing command: %s", cmd_info.command))
  local success, err = pcall(function()
    vim.lsp.buf.execute_command(cmd_info)
  end)
  if success then
    print("  SUCCESS")
  else
    print("  FAILED:", err)
  end
end

-- Test 3: Check if commands are registered in Neovim
print("\n=== CHECKING COMMAND REGISTRATION ===")
local commands = vim.api.nvim_get_commands({})
for name, _ in pairs(commands) do
  if name:match("alloy") then
    print("Found command:", name)
  end
end

print("\n=== COMMAND TESTING COMPLETE ===")