# Neovim LSP Inlay Hints Setup for Alloy

## Prerequisites

1. **Neovim 0.10+** (inlay hints support was added in 0.10)
2. **Node.js** installed on your system

## 1. Language Server Setup

The language server is already configured and built. The compiled server is at:
```
/home/froa/Projects/alloy/river_lsp/server/out/server.js
```

## 2. Neovim Configuration

Add this to your Neovim configuration (typically `~/.config/nvim/init.lua`):

### Basic LSP Setup

```lua
-- Enable inlay hints globally (requires Neovim 0.10+)
vim.lsp.inlay_hint.enable(true)

-- LSP configuration
local lspconfig = require('lspconfig')

-- Define the custom Alloy language server
local configs = require('lspconfig.configs')

if not configs.alloy_lsp then
  configs.alloy_lsp = {
    default_config = {
      cmd = { 'node', '/home/froa/Projects/alloy/river_lsp/server/out/server.js', '--stdio' },
      filetypes = { 'alloy' },
      root_dir = function(fname)
        return lspconfig.util.find_git_ancestor(fname) or vim.fn.getcwd()
      end,
      settings = {},
      capabilities = vim.lsp.protocol.make_client_capabilities(),
    },
  }
end

-- Setup the language server
lspconfig.alloy_lsp.setup({
  capabilities = vim.lsp.protocol.make_client_capabilities(),
  on_attach = function(client, bufnr)
    -- Enable inlay hints for this buffer
    if client.server_capabilities.inlayHintProvider then
      vim.lsp.inlay_hint.enable(true, { bufnr = bufnr })
    end
    
    -- Optional: Add keybindings
    local opts = { buffer = bufnr, remap = false }
    vim.keymap.set("n", "<leader>ih", function()
      vim.lsp.inlay_hint.enable(not vim.lsp.inlay_hint.is_enabled())
    end, opts)
  end,
})
```

### File Type Detection

Add this to detect `.alloy` files:

```lua
-- File type detection for .alloy files
vim.filetype.add({
  extension = {
    alloy = 'alloy',
  },
})
```

## 3. Alternative: Mason.nvim Setup

If you're using Mason.nvim, you can create a custom server configuration:

```lua
-- In your Mason/LSP configuration
local mason_lspconfig = require("mason-lspconfig")
local lspconfig = require("lspconfig")

-- Add custom server configuration
lspconfig.alloy_lsp.setup({
  cmd = { 'node', '/home/froa/Projects/alloy/river_lsp/server/out/server.js', '--stdio' },
  filetypes = { 'alloy' },
  root_dir = lspconfig.util.find_git_ancestor,
  capabilities = require('cmp_nvim_lsp').default_capabilities(),
  on_attach = function(client, bufnr)
    if client.server_capabilities.inlayHintProvider then
      vim.lsp.inlay_hint.enable(true, { bufnr = bufnr })
    end
  end,
})
```

## 4. Verify Setup

1. **Check Neovim Version**:
   ```vim
   :version
   ```
   Should show 0.10 or higher.

2. **Open an Alloy file**:
   ```bash
   nvim test.alloy
   ```

3. **Check LSP Status**:
   ```vim
   :LspInfo
   ```

4. **Test Inlay Hints**:
   Create a test file with content like:
   ```alloy
   prometheus.scrape "metrics" {
       forward_to = [argument.prometheus_remote_write.value]
       targets = [{"__address__" = "basicservice:8080"}]
   }
   ```

## 5. Troubleshooting

### Inlay Hints Not Showing

1. **Check if inlay hints are enabled**:
   ```lua
   :lua print(vim.lsp.inlay_hint.is_enabled())
   ```

2. **Enable inlay hints manually**:
   ```lua
   :lua vim.lsp.inlay_hint.enable(true)
   ```

3. **Check LSP capabilities**:
   ```lua
   :lua print(vim.inspect(vim.lsp.get_active_clients()[1].server_capabilities.inlayHintProvider))
   ```

### Language Server Not Starting

1. **Check the server path is correct**
2. **Verify Node.js is installed**: `node --version`
3. **Check LSP logs**: `:LspLog`

### Debug Mode

Add this to your configuration for debugging:

```lua
vim.lsp.set_log_level("debug")
```

Then check the logs at: `~/.local/state/nvim/lsp.log`

## 6. Expected Output

With inlay hints working, you should see:

```alloy
prometheus.scrape "metrics" {
    forward_to = list(MetricsReceiver)  [argument.prometheus_remote_write.value]
    targets = list(map(string))  [{"__address__" = "basicservice:8080"}]
}

loki.relabel "relabel_rules" {
    forward_to = list(receiver)  [argument.loki_write.value]
}
```

The type information (like `list(MetricsReceiver)`) should appear inline before the values.