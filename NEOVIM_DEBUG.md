# Neovim Inlay Hints Debugging Guide

The language server is now compiled with debugging enabled. Here's how to troubleshoot:

## 1. Check Neovim Version

```bash
nvim --version
```

**You need Neovim 0.10.0 or higher** for inlay hints support.

## 2. Test Configuration Step by Step

### Step 1: Basic LSP Setup

Add this minimal config to test:

```lua
-- ~/.config/nvim/init.lua
local lspconfig = require('lspconfig')
local configs = require('lspconfig.configs')

-- Define custom Alloy LSP
if not configs.alloy_lsp then
  configs.alloy_lsp = {
    default_config = {
      cmd = { 'node', '/home/froa/Projects/alloy/river_lsp/server/out/server.js', '--stdio' },
      filetypes = { 'alloy' },
      root_dir = lspconfig.util.find_git_ancestor,
    },
  }
end

-- Setup with debugging
lspconfig.alloy_lsp.setup({
  on_attach = function(client, bufnr)
    print("LSP attached to buffer:", bufnr)
    print("Inlay hint capability:", client.server_capabilities.inlayHintProvider)
    
    if client.server_capabilities.inlayHintProvider then
      print("Enabling inlay hints...")
      vim.lsp.inlay_hint.enable(true, { bufnr = bufnr })
    end
  end,
})

-- File type detection
vim.filetype.add({
  extension = { alloy = 'alloy' },
})

-- Enable inlay hints globally
vim.lsp.inlay_hint.enable(true)
```

### Step 2: Test the Server

1. **Open the test file**: `nvim test.alloy` 
2. **Check LSP status**: `:LspInfo`
3. **Check server logs**: Look for debug output in your terminal

### Step 3: Debug Commands

Run these commands in Neovim:

```vim
" Check if inlay hints are enabled
:lua print("Inlay hints enabled:", vim.lsp.inlay_hint.is_enabled())

" Check active clients
:lua print(vim.inspect(vim.lsp.get_active_clients()))

" Check server capabilities
:lua local clients = vim.lsp.get_active_clients(); if clients[1] then print(vim.inspect(clients[1].server_capabilities.inlayHintProvider)) end

" Manually request inlay hints
:lua vim.lsp.buf.inlay_hint()

" Toggle inlay hints manually
:lua vim.lsp.inlay_hint.enable(not vim.lsp.inlay_hint.is_enabled())
```

## 3. Check Debug Output

The server now outputs debug information to stderr. Look for messages like:

```
[DEBUG] Server initialized with inlay hints capability: true
[DEBUG] Inlay hints requested for: file:///path/to/test.alloy
[DEBUG] Processing 4 lines for inlay hints
[DEBUG] Line 1: "forward_to = [argument.prometheus_remote_write.value]"
[DEBUG] Generated 2 inlay hints
```

## 4. Common Issues

### Issue: LSP Not Starting
- Check the server path is correct
- Verify Node.js is installed: `node --version`
- Check for error messages in `:LspLog`

### Issue: No Inlay Hints Capability
If the server doesn't advertise inlay hints capability:
- Check server debug output for initialization message
- Verify the server compiled correctly

### Issue: Inlay Hints Not Requested
If the server never receives inlay hint requests:
- Your Neovim version might be too old (< 0.10)
- Inlay hints might not be enabled: `:lua vim.lsp.inlay_hint.enable(true)`
- The client might not support inlay hints

### Issue: Server Receives Requests but No Hints Show
If you see debug output but no visual hints:
- Check if the component JSON files exist
- The hints might be there but invisible (check Neovim colorscheme)

## 5. Manual Test

Run this in Neovim to manually test:

```lua
:lua vim.lsp.buf_request(0, 'textDocument/inlayHint', {
  textDocument = vim.lsp.util.make_text_document_params(),
  range = {
    start = { line = 0, character = 0 },
    ["end"] = { line = 10, character = 0 }
  }
}, function(err, result) 
  print("Inlay hints result:", vim.inspect(result))
end)
```

## 6. Expected Result

With everything working, you should see:

```alloy
prometheus.scrape "metrics" {
	forward_to = list(MetricsReceiver)  [argument.prometheus_remote_write.value]
	targets = list(map(string))  [{"__address__" = "basicservice:8080"}]
}
```

The type information should appear inline before the values.

## 7. Disable Debug Mode

Once working, remove the debug console.error statements from the server to clean up output.