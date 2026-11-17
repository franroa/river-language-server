-- LSP Restart and Code Lens Fix
-- This script restarts the LSP server and sets up code lens properly

print("=== LSP RESTART AND CODE LENS FIX ===")

-- 1. Stop all LSP clients
local bufnr = vim.api.nvim_get_current_buf()
local clients = vim.lsp.get_active_clients({bufnr = bufnr})

print("Stopping", #clients, "LSP clients...")
for _, client in ipairs(clients) do
  print("Stopping:", client.name)
  vim.lsp.stop_client(client.id)
end

-- 2. Wait a moment for cleanup
vim.defer_fn(function()
  print("Restarting LSP...")

  -- 3. Start LSP again
  vim.cmd("LspStart")

  -- 4. Wait for LSP to start
  vim.defer_fn(function()
    print("Setting up code lens...")

    -- 5. Set up code lens handler
    vim.lsp.handlers["textDocument/codeLens"] = function(err, result, ctx, config)
      if err then
        print("Code lens error:", err.message)
        return
      end

      if not result or #result == 0 then
        print("No code lenses")
        return
      end

      print("Code lens handler received", #result, "lenses")

      -- Safe display
      local success, display_err = pcall(function()
        vim.lsp.codelens.on_codelens(err, result, ctx, config)
      end)

      if not success then
        print("Display failed, showing as messages:", display_err)
        for i, lens in ipairs(result) do
          if lens.command and lens.command.title then
            print(string.format("Lens %d (line %d): %s", i, lens.range.start.line + 1, lens.command.title))
          end
        end
      end
    end

    -- 6. Set up keybindings
    vim.keymap.set('n', '<leader>clr', function()
      vim.lsp.codelens.refresh()
      print("Code lenses refreshed")
    end, { desc = 'Refresh code lenses' })

    vim.keymap.set('n', '<leader>clt', function()
      -- Test code lens at cursor
      local line = vim.api.nvim_win_get_cursor(0)[1] - 1
      print("Testing code lens at line", line + 1)
      vim.lsp.codelens.run()
    end, { desc = 'Test code lens at cursor' })

    -- 7. Auto-refresh
    vim.api.nvim_create_autocmd("BufEnter", {
      pattern = "*.alloy",
      callback = function()
        vim.defer_fn(function()
          vim.lsp.codelens.refresh()
        end, 1000)
      end
    })

    -- 8. Initial refresh
    vim.defer_fn(function()
      vim.lsp.codelens.refresh()
      print("Initial code lens refresh complete")
    end, 2000)

    print("Code lens setup complete!")
    print("Keybindings:")
    print("  <leader>clr - Refresh code lenses")
    print("  <leader>clt - Test code lens at cursor")

  end, 1000) -- Wait 1 second for LSP to start

end, 500) -- Wait 0.5 seconds for cleanup