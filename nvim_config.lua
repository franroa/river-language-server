-- Complete Neovim configuration for Alloy LSP with Inlay Hints
-- Add this to your ~/.config/nvim/init.lua or test it directly

-- Enable inlay hints globally first
vim.lsp.inlay_hint.enable(true)

-- File type detection for .alloy files
vim.filetype.add({
  extension = {
    alloy = 'alloy',
  },
})

-- Set up the language server
local lspconfig = require('lspconfig')
local configs = require('lspconfig.configs')

-- Check if we already defined it to avoid redefining
if not configs.alloy_lsp then
  configs.alloy_lsp = {
    default_config = {
      cmd = { 'node', '/home/froa/Projects/alloy/river_lsp/server/out/server.js', '--stdio' },
      filetypes = { 'alloy' },
      root_dir = function(fname)
        return lspconfig.util.find_git_ancestor(fname) or vim.fn.getcwd()
      end,
      settings = {},
      init_options = {},
      capabilities = vim.lsp.protocol.make_client_capabilities(),
    },
  }
end

-- Setup the language server with proper inlay hints configuration
lspconfig.alloy_lsp.setup({
  capabilities = (function()
    local capabilities = vim.lsp.protocol.make_client_capabilities()
    -- Ensure inlay hints are enabled in capabilities
    capabilities.textDocument = capabilities.textDocument or {}
    capabilities.textDocument.inlayHint = {
      dynamicRegistration = false,
      resolveSupport = {
        properties = { 'tooltip', 'textEdits', 'label' }
      }
    }
    return capabilities
  end)(),
  
  on_attach = function(client, bufnr)
    print(string.format("LSP client attached to buffer %d", bufnr))
    print("Client name:", client.name)
    print("Inlay hint provider:", vim.inspect(client.server_capabilities.inlayHintProvider))
    
    -- Enable inlay hints if supported
    if client.server_capabilities.inlayHintProvider then
      print("Enabling inlay hints for buffer", bufnr)
      vim.lsp.inlay_hint.enable(true, { bufnr = bufnr })
      
      -- Verify they're enabled
      vim.defer_fn(function()
        local enabled = vim.lsp.inlay_hint.is_enabled({ bufnr = bufnr })
        print("Inlay hints enabled for buffer", bufnr, ":", enabled)
      end, 1000)
    else
      print("Server does not support inlay hints")
    end
    
    -- Key mappings
    local opts = { buffer = bufnr, remap = false }
    
    -- Toggle inlay hints
    vim.keymap.set("n", "<leader>ih", function()
      local current = vim.lsp.inlay_hint.is_enabled({ bufnr = bufnr })
      vim.lsp.inlay_hint.enable(not current, { bufnr = bufnr })
      print("Inlay hints", not current and "enabled" or "disabled")
    end, opts)
    
    -- Force refresh inlay hints
    vim.keymap.set("n", "<leader>ir", function()
      -- This might help refresh inlay hints
      vim.lsp.inlay_hint.enable(false, { bufnr = bufnr })
      vim.defer_fn(function()
        vim.lsp.inlay_hint.enable(true, { bufnr = bufnr })
        print("Inlay hints refreshed")
      end, 100)
    end, opts)
    
    -- Manual inlay hint request (for testing)
    vim.keymap.set("n", "<leader>im", function()
      local params = {
        textDocument = vim.lsp.util.make_text_document_params(bufnr),
        range = {
          start = { line = 0, character = 0 },
          ['end'] = { line = vim.api.nvim_buf_line_count(bufnr), character = 0 }
        }
      }
      
      vim.lsp.buf_request(bufnr, 'textDocument/inlayHint', params, function(err, result)
        if err then
          print("Error requesting inlay hints:", vim.inspect(err))
        else
          print("Inlay hints result:", vim.inspect(result))
        end
      end)
    end, opts)
    
    print("Keybindings added:")
    print("  <leader>ih - Toggle inlay hints")
    print("  <leader>ir - Refresh inlay hints")
    print("  <leader>im - Manual inlay hint request")
  end,
  
  on_init = function(client)
    print("LSP client initialized:", client.name)
  end,
  
  handlers = {
    -- Custom inlay hints handler for debugging
    ['textDocument/inlayHint'] = function(err, result, ctx, config)
      if err then
        print("Inlay hints handler error:", vim.inspect(err))
        return
      end
      
      print("Inlay hints handler called with result:", vim.inspect(result))
      
      -- Call the default handler
      vim.lsp.handlers['textDocument/inlayHint'](err, result, ctx, config)
    end,
  },
})

-- Auto command to ensure inlay hints are enabled when opening alloy files
vim.api.nvim_create_autocmd("FileType", {
  pattern = "alloy",
  callback = function(args)
    local bufnr = args.buf
    print(string.format("Alloy file opened in buffer %d", bufnr))
    
    -- Wait for LSP to attach, then enable inlay hints
    vim.defer_fn(function()
      local clients = vim.lsp.get_active_clients({ bufnr = bufnr })
      if #clients > 0 then
        print("LSP clients active for buffer:", #clients)
        for _, client in ipairs(clients) do
          if client.server_capabilities.inlayHintProvider then
            vim.lsp.inlay_hint.enable(true, { bufnr = bufnr })
            print("Inlay hints force-enabled for buffer", bufnr)
            break
          end
        end
      else
        print("No LSP clients active for buffer", bufnr)
      end
    end, 2000)
  end,
})

print("Alloy LSP configuration loaded!")
print("Open a .alloy file and check the output for debugging info")
print("Use :messages to see all print statements")