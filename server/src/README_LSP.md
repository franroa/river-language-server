# Comprehensive Guide: Using Alloy LSP Providers in Neovim

This guide covers how to set up and use all the enhanced LSP features of the Alloy Language Server in Neovim.

## Table of Contents
1. [Prerequisites & Setup](#prerequisites--setup)
2. [LSP Provider Overview](#lsp-provider-overview)
3. [Core LSP Features](#core-lsp-features)
4. [Enhanced Features](#enhanced-features)
5. [Configuration Examples](#configuration-examples)
6. [Keybinding Recommendations](#keybinding-recommendations)
7. [Working with Alloy Files](#working-with-alloy-files)
8. [Troubleshooting](#troubleshooting)
9. [Advanced Usage Tips](#advanced-usage-tips)

## Prerequisites & Setup

### Required Dependencies
```bash
# Install Neovim (0.8+ recommended)
# Ubuntu/Debian
sudo apt install neovim

# macOS
brew install neovim

# Install Node.js for the LSP server
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### LSP Client Setup
You'll need an LSP client plugin. Here are the most popular options:

#### Option 1: Built-in LSP (Neovim 0.8+) with nvim-lspconfig
```lua
-- In your init.lua or ~/.config/nvim/init.lua
-- Install via your package manager (lazy.nvim example):
{
  'neovim/nvim-lspconfig',
  dependencies = {
    'hrsh7th/cmp-nvim-lsp',      -- LSP completion source
    'hrsh7th/nvim-cmp',          -- Completion engine
    'L3MON4D3/LuaSnip',          -- Snippet engine
  },
}
```

#### Option 2: COC (Conquer of Completion)
```vim
" In your vimrc or init.vim
Plug 'neoclide/coc.nvim', {'branch': 'release'}
```

## LSP Provider Overview

The Alloy LSP server provides these capabilities:

| Provider | Feature | Trigger | Description |
|----------|---------|---------|-------------|
| `completion` | Auto-completion | Typing | Component suggestions, arguments, values |
| `hover` | Documentation | `K` (default) | Show component/argument documentation |
| `definition` | Go to definition | `gd` | Jump to component/argument definition |
| `references` | Find references | `gr` | Find all usages of symbol |
| `implementation` | Go to implementation | `gi` | Jump to component implementation |
| `rename` | Symbol rename | `<leader>rn` | Rename symbol across workspace |
| `signatureHelp` | Parameter hints | Typing `(`, `"`, `{` | Show function signatures |
| `formatting` | Format document | `<leader>f` | Format entire document |
| `rangeFormatting` | Format selection | `<leader>f` (visual) | Format selected range |
| `foldingRange` | Code folding | `zc`, `zo`, `za` | Fold/unfold code blocks |
| `documentHighlight` | Symbol highlighting | Cursor movement | Highlight symbol occurrences |
| `codeAction` | Quick fixes | `<leader>ca` | Available code actions |
| `diagnostics` | Error detection | Real-time | Show syntax/semantic errors |

## Core LSP Features

### 1. Auto-Completion
**What it does:** Provides intelligent code completion for Alloy components, arguments, and values.

**Usage:**
- Start typing component names: `prom` → suggests `prometheus.scrape`, `prometheus.exporter.unix`, etc.
- Inside component blocks: suggests valid arguments
- For argument values: suggests appropriate types and examples

**Configuration (nvim-lspconfig):**
```lua
local cmp = require('cmp')
cmp.setup({
  sources = {
    { name = 'nvim_lsp' },  -- LSP completion source
    { name = 'luasnip' },
  },
  mapping = {
    ['<C-Space>'] = cmp.mapping.complete(),
    ['<CR>'] = cmp.mapping.confirm({ select = true }),
    ['<Tab>'] = cmp.mapping.select_next_item(),
    ['<S-Tab>'] = cmp.mapping.select_prev_item(),
  },
})
```

### 2. Hover Documentation
**What it does:** Shows detailed documentation for components and arguments.

**Usage:**
- Place cursor on any component name and press `K`
- Shows component description, usage examples, and argument details

**Example:** Hover over `prometheus.scrape` shows:
```
prometheus.scrape "job_name" {
  targets = [...]
  scrape_interval = "30s"
  ...
}

Scrapes Prometheus metrics from HTTP endpoints.
```

### 3. Go to Definition
**What it does:** Jumps to where symbols are defined.

**Usage:**
- `gd` - Go to definition
- `gD` - Go to declaration (if different from definition)

**Works for:**
- Declared components: Jump to `declare` block
- Declared arguments: Jump to argument definition
- Component references: Jump to component definition

### 4. Find References
**What it does:** Finds all places where a symbol is used.

**Usage:**
- `gr` - Find references
- Opens quickfix list with all occurrences
- Navigate with `:cn` (next) and `:cp` (previous)

**Example:** Find all references to a declared argument:
```alloy
declare "database" {
  argument "connection_string" {
    comment = "Database connection URL"
  }
}

// All references to 'connection_string' will be found
```

### 5. Symbol Rename
**What it does:** Renames symbols across the entire workspace.

**Usage:**
- Place cursor on symbol and press `<leader>rn`
- Type new name and confirm
- All references are updated automatically

**Supports:**
- Component labels
- Declared component names  
- Declared argument names

## Enhanced Features

### Call Hierarchy Provider
**What it does**: Visualizes data flow between Alloy components, showing which components send data to which other components.

**How to use**:
- Position cursor on any component (e.g., `prometheus.scrape "app"`)
- Use `:lua vim.lsp.buf.call_hierarchy()` or your keybinding
- Navigate through incoming/outgoing calls with `<CR>` or `o`

**Example workflow**:
```alloy
prometheus.scrape "metrics" {
  forward_to = [prometheus.remote_write.mimir.receiver]
  targets = [discovery.kubernetes.pods.targets]
}

prometheus.remote_write "mimir" {
  endpoint { url = "https://mimir.example.com" }
}
```
- Cursor on `prometheus.scrape "metrics"` → Shows it receives from `discovery.kubernetes` and sends to `prometheus.remote_write`
- Perfect for tracing data pipelines and understanding component relationships

### Selection Range Provider
**What it does**: Smart text selection that expands to logical boundaries in Alloy syntax.

**How to use**:
- Position cursor anywhere in your code
- Use `<C-w>` repeatedly to expand selection
- Or create custom keybinding: `vim.lsp.buf.range_code_action()`

**Selection expansion levels**:
1. **Word**: `prometheus`
2. **Property**: `forward_to = [...]`
3. **Array element**: `{__address__ = "localhost:8080"}`
4. **Component block**: Entire `prometheus.scrape "app" { ... }`
5. **Declare block**: Entire `declare "config" { ... }`

### Enhanced Workspace Edit Provider
**What it does**: Multi-file refactoring operations for renaming and restructuring Alloy configurations.

**Available commands** (via `:lua` or Command Palette):
```lua
-- Rename component across all files
vim.lsp.buf.execute_command({
  command = "alloy.renameComponentAcrossWorkspace",
  arguments = {"prometheus.scrape", "old_name", "new_name"}
})

-- Rename declare block everywhere it's used
vim.lsp.buf.execute_command({
  command = "alloy.renameDeclareBlockAcrossWorkspace", 
  arguments = {"old_block", "new_block"}
})

-- Extract repeated components to declare block
vim.lsp.buf.execute_command({
  command = "alloy.extractToDeclareBlock"
})

-- Inline declare block (replace usages with actual content)
vim.lsp.buf.execute_command({
  command = "alloy.inlineDeclareBlock",
  arguments = {"block_name"}
})
```

## Enhanced Features

### 6. Signature Help
**What it does:** Shows function signatures and parameter information as you type.

**Triggers:**
- `"` - When typing component labels
- `{` - When entering component blocks
- `=` - When assigning argument values
- ` ` - After component names

**Example:**
```alloy
prometheus.scrape "my_job" |  # Cursor here shows signature
                           ▼
prometheus.scrape "label" { targets = [...], scrape_interval = "30s" }
                             ▲
                   Parameter info shown here
```

**Configuration:**
```lua
vim.lsp.handlers['textDocument/signatureHelp'] = vim.lsp.with(
  vim.lsp.handlers.signature_help, {
    border = 'rounded',
    focusable = false,
  }
)
```

### 7. Document Formatting
**What it does:** Automatically formats your Alloy configuration with proper indentation and spacing.

**Usage:**
- `<leader>f` - Format entire document
- Visual mode + `<leader>f` - Format selected range

**Features:**
- Consistent indentation (configurable tabs/spaces)
- Proper spacing around operators (`key = value`)
- Clean block structure with space before `{`
- Removes trailing whitespace
- Ensures final newline

**Configuration:**
```lua
vim.keymap.set('n', '<leader>f', vim.lsp.buf.format, { desc = 'Format document' })
vim.keymap.set('v', '<leader>f', vim.lsp.buf.format, { desc = 'Format selection' })
```

### 8. Code Folding
**What it does:** Allows folding/unfolding of code blocks for better navigation.

**Usage:**
- `zc` - Close fold under cursor
- `zo` - Open fold under cursor
- `za` - Toggle fold under cursor
- `zR` - Open all folds
- `zM` - Close all folds

**Folds:**
- Component blocks
- Nested argument blocks
- Multi-line comments
- Consecutive single-line comments

**Configuration:**
```lua
vim.opt.foldmethod = 'expr'
vim.opt.foldexpr = 'nvim_treesitter#foldexpr()'
-- Or use LSP folding
vim.opt.foldmethod = 'manual'
```

### 9. Document Highlight
**What it does:** Highlights all occurrences of the symbol under cursor.

**Usage:**
- Simply move cursor to any symbol
- All references are automatically highlighted
- Different highlight types for read vs write access

**Visual feedback:**
- **Read access**: Lighter highlight
- **Write access**: Stronger highlight (assignments)
- **Text occurrences**: Normal highlight

### 10. Code Actions
**What it does:** Provides context-aware quick fixes and refactoring options.

**Usage:**
- `<leader>ca` - Show available code actions
- Select from list of actions

**Actions include:**
- Add missing required arguments
- Extract component blocks
- Fix common syntax issues

## Configuration Examples

### Complete Neovim LSP Setup (init.lua)

```lua
-- Install plugins (using lazy.nvim)
local plugins = {
  {
    'neovim/nvim-lspconfig',
    dependencies = {
      'hrsh7th/cmp-nvim-lsp',
      'hrsh7th/nvim-cmp',
      'L3MON4D3/LuaSnip',
    },
    config = function()
      require('lsp-setup')
    end,
  },
}

-- LSP Setup (lua/lsp-setup.lua)
local lspconfig = require('lspconfig')
local cmp = require('cmp')

-- Alloy LSP Configuration
local alloy_cmd = {
  "node", 
  "/path/to/alloy/river_lsp/server/out/server.js", 
  "--stdio"
}

lspconfig.alloy_lsp = {
  default_config = {
    cmd = alloy_cmd,
    filetypes = { 'alloy' },
    root_dir = lspconfig.util.root_pattern('.git', '.alloy'),
    settings = {},
  },
}

-- Setup Alloy LSP
lspconfig.alloy_lsp.setup({
  capabilities = require('cmp_nvim_lsp').default_capabilities(),
  on_attach = function(client, bufnr)
    local opts = { noremap = true, silent = true, buffer = bufnr }
    
    -- Core LSP keybindings
    vim.keymap.set('n', 'gd', vim.lsp.buf.definition, opts)
    vim.keymap.set('n', 'gD', vim.lsp.buf.declaration, opts)
    vim.keymap.set('n', 'gi', vim.lsp.buf.implementation, opts)
    vim.keymap.set('n', 'gr', vim.lsp.buf.references, opts)
    vim.keymap.set('n', 'K', vim.lsp.buf.hover, opts)
    vim.keymap.set('n', '<C-k>', vim.lsp.buf.signature_help, opts)
    vim.keymap.set('n', '<leader>rn', vim.lsp.buf.rename, opts)
    vim.keymap.set('n', '<leader>ca', vim.lsp.buf.code_action, opts)
    
    -- Formatting
    vim.keymap.set('n', '<leader>f', vim.lsp.buf.format, opts)
    vim.keymap.set('v', '<leader>f', vim.lsp.buf.format, opts)
    
    -- Diagnostics
    vim.keymap.set('n', '[d', vim.diagnostic.goto_prev, opts)
    vim.keymap.set('n', ']d', vim.diagnostic.goto_next, opts)
    vim.keymap.set('n', '<leader>e', vim.diagnostic.open_float, opts)
    vim.keymap.set('n', '<leader>q', vim.diagnostic.setloclist, opts)
    
    -- Document highlight
    if client.server_capabilities.documentHighlightProvider then
      vim.api.nvim_create_augroup("lsp_document_highlight", { clear = false })
      vim.api.nvim_clear_autocmds({ buffer = bufnr, group = "lsp_document_highlight" })
      vim.api.nvim_create_autocmd({ "CursorHold", "CursorHoldI" }, {
        group = "lsp_document_highlight",
        buffer = bufnr,
        callback = vim.lsp.buf.document_highlight,
      })
      vim.api.nvim_create_autocmd({ "CursorMoved" }, {
        group = "lsp_document_highlight",
        buffer = bufnr,
        callback = vim.lsp.buf.clear_references,
      })
    end
  end,
})

-- Completion setup
cmp.setup({
  snippet = {
    expand = function(args)
      require('luasnip').lsp_expand(args.body)
    end,
  },
  mapping = cmp.mapping.preset.insert({
    ['<C-b>'] = cmp.mapping.scroll_docs(-4),
    ['<C-f>'] = cmp.mapping.scroll_docs(4),
    ['<C-Space>'] = cmp.mapping.complete(),
    ['<C-e>'] = cmp.mapping.abort(),
    ['<CR>'] = cmp.mapping.confirm({ select = true }),
    ['<Tab>'] = cmp.mapping.select_next_item(),
    ['<S-Tab>'] = cmp.mapping.select_prev_item(),
  }),
  sources = cmp.config.sources({
    { name = 'nvim_lsp' },
    { name = 'luasnip' },
  }),
})

-- LSP handlers customization
vim.lsp.handlers["textDocument/hover"] = vim.lsp.with(
  vim.lsp.handlers.hover, {
    border = "rounded",
  }
)

vim.lsp.handlers["textDocument/signatureHelp"] = vim.lsp.with(
  vim.lsp.handlers.signature_help, {
    border = "rounded",
    focusable = false,
  }
)
```

### COC Configuration (coc-settings.json)

```json
{
  "languageserver": {
    "alloy": {
      "command": "node",
      "args": ["/path/to/alloy/river_lsp/server/out/server.js", "--stdio"],
      "filetypes": ["alloy"],
      "rootPatterns": [".git", ".alloy"],
      "settings": {}
    }
  },
  "suggest.enablePreview": true,
  "signature.enable": true,
  "codeLens.enable": true,
  "diagnostic.enable": true,
  "hover.target": "float"
}
```

## Keybinding Recommendations

### Essential Keybindings
```lua
-- Navigation
vim.keymap.set('n', 'gd', vim.lsp.buf.definition)         -- Go to definition
vim.keymap.set('n', 'gr', vim.lsp.buf.references)         -- Find references
vim.keymap.set('n', 'gi', vim.lsp.buf.implementation)     -- Go to implementation

-- Documentation
vim.keymap.set('n', 'K', vim.lsp.buf.hover)               -- Show documentation
vim.keymap.set('n', '<C-k>', vim.lsp.buf.signature_help)  -- Signature help

-- Editing
vim.keymap.set('n', '<leader>rn', vim.lsp.buf.rename)     -- Rename symbol
vim.keymap.set('n', '<leader>ca', vim.lsp.buf.code_action) -- Code actions
vim.keymap.set('n', '<leader>f', vim.lsp.buf.format)      -- Format document
vim.keymap.set('v', '<leader>f', vim.lsp.buf.format)      -- Format selection

-- Diagnostics
vim.keymap.set('n', '[d', vim.diagnostic.goto_prev)       -- Previous diagnostic
vim.keymap.set('n', ']d', vim.diagnostic.goto_next)       -- Next diagnostic
vim.keymap.set('n', '<leader>e', vim.diagnostic.open_float) -- Show diagnostic
vim.keymap.set('n', '<leader>q', vim.diagnostic.setloclist) -- Diagnostic list

-- Folding
vim.keymap.set('n', 'zc', 'zc')                          -- Close fold
vim.keymap.set('n', 'zo', 'zo')                          -- Open fold
vim.keymap.set('n', 'za', 'za')                          -- Toggle fold
vim.keymap.set('n', 'zR', 'zR')                          -- Open all folds
vim.keymap.set('n', 'zM', 'zM')                          -- Close all folds
```

### Advanced Keybindings
```lua
-- Workspace
vim.keymap.set('n', '<leader>wa', vim.lsp.buf.add_workspace_folder)
vim.keymap.set('n', '<leader>wr', vim.lsp.buf.remove_workspace_folder)
vim.keymap.set('n', '<leader>wl', function()
  print(vim.inspect(vim.lsp.buf.list_workspace_folders()))
end)

-- Symbol search
vim.keymap.set('n', '<leader>ds', vim.lsp.buf.document_symbol)
vim.keymap.set('n', '<leader>ws', vim.lsp.buf.workspace_symbol)

-- LSP info
vim.keymap.set('n', '<leader>li', '<cmd>LspInfo<CR>')
vim.keymap.set('n', '<leader>lr', '<cmd>LspRestart<CR>')
```

## Working with Alloy Files

### File Type Detection
Create `~/.config/nvim/ftdetect/alloy.vim`:
```vim
au BufRead,BufNewFile *.alloy set filetype=alloy
```

Or in Lua (`~/.config/nvim/lua/filetype.lua`):
```lua
vim.filetype.add({
  extension = {
    alloy = 'alloy',
  },
})
```

### Syntax Highlighting
While waiting for full Treesitter support, you can use basic syntax highlighting:

Create `~/.config/nvim/syntax/alloy.vim`:
```vim
if exists("b:current_syntax")
  finish
endif

syntax match alloyComment "//.*$"
syntax match alloyBlockComment "/\*.*\*/"
syntax match alloyString '"[^"]*"'
syntax match alloyNumber '\v<\d+>'
syntax match alloyBoolean '\v<(true|false)>'
syntax match alloyOperator '='
syntax match alloyBrace '[{}]'
syntax match alloyBracket '[\[\]]'

syntax keyword alloyKeyword declare argument export
syntax keyword alloyComponent prometheus loki otelcol

highlight link alloyComment Comment
highlight link alloyBlockComment Comment
highlight link alloyString String
highlight link alloyNumber Number
highlight link alloyBoolean Boolean
highlight link alloyOperator Operator
highlight link alloyBrace Special
highlight link alloyBracket Special
highlight link alloyKeyword Keyword
highlight link alloyComponent Type

let b:current_syntax = "alloy"
```

## Troubleshooting

### Common Issues

#### 1. LSP Server Not Starting
**Symptoms:** No completion, hover, or diagnostics
**Solutions:**
```bash
# Check if Node.js is installed
node --version

# Check if server file exists
ls -la /path/to/alloy/river_lsp/server/out/server.js

# Test server manually
node /path/to/alloy/river_lsp/server/out/server.js --stdio
```

#### 2. Features Not Working
**Check LSP status:**
```vim
:LspInfo
```

**Enable logging:**
```lua
vim.lsp.set_log_level("debug")
-- Check logs at: ~/.cache/nvim/lsp.log
```

#### 3. Completion Not Showing
**Check completion source:**
```lua
-- Add debug info to completion
cmp.setup({
  sources = cmp.config.sources({
    { name = 'nvim_lsp', keyword_length = 1 },  -- Reduce keyword length
  }),
})
```

#### 4. Formatting Not Working
**Check format capability:**
```lua
-- In on_attach function
if client.server_capabilities.documentFormattingProvider then
  print("Formatting supported")
else
  print("No formatting support")
end
```

#### 5. Folding Issues
**Enable folding:**
```lua
vim.opt.foldmethod = 'expr'
vim.opt.foldexpr = 'nvim_treesitter#foldexpr()'
-- Or for LSP folding:
vim.wo.foldmethod = 'expr'
vim.wo.foldexpr = 'v:lua.vim.lsp.foldexpr()'
```

### Performance Issues

#### Large Files
```lua
-- Disable certain features for large files
vim.api.nvim_create_autocmd("BufReadPre", {
  pattern = "*.alloy",
  callback = function()
    local file_size = vim.fn.getfsize(vim.fn.expand("%"))
    if file_size > 1024 * 1024 then  -- 1MB
      vim.b.large_file = true
      -- Disable expensive features
      vim.opt_local.foldmethod = 'manual'
      vim.opt_local.syntax = 'off'
    end
  end,
})
```

### Debug LSP Communication

#### Enable verbose logging:
```lua
vim.lsp.set_log_level("trace")  -- Very verbose
-- Or check specific handlers:
local orig_handler = vim.lsp.handlers["textDocument/completion"]
vim.lsp.handlers["textDocument/completion"] = function(...)
  print("Completion request received")
  return orig_handler(...)
end
```

#### Check server output:
```bash
# Run server with debug output
NODE_ENV=development node /path/to/server.js --stdio
```

## Advanced Usage Tips

### 1. Custom Commands
```lua
-- Add custom commands for Alloy-specific operations
vim.api.nvim_create_user_command('AlloyFormat', function()
  vim.lsp.buf.format({ async = true })
end, {})

vim.api.nvim_create_user_command('AlloyReload', function()
  vim.cmd('LspRestart')
end, {})
```

### 2. Auto-formatting on Save
```lua
vim.api.nvim_create_autocmd("BufWritePre", {
  pattern = "*.alloy",
  callback = function()
    vim.lsp.buf.format({ async = false })
  end,
})
```

### 3. Custom Diagnostics Display
```lua
vim.diagnostic.config({
  virtual_text = {
    prefix = '●',
    source = 'always',
  },
  float = {
    source = 'always',
    border = 'rounded',
  },
  signs = true,
  underline = true,
})
```

### 4. Enhanced Folding with Custom Markers
```lua
-- Custom fold text function for better readability
function _G.custom_fold_text()
  local line = vim.fn.getline(vim.v.foldstart)
  local line_count = vim.v.foldend - vim.v.foldstart + 1
  return string.format("  ⏵ %s ... (%d lines)", line:match("^%s*(.-)%s*$"), line_count)
end

vim.opt.foldtext = 'v:lua.custom_fold_text()'
```

### 5. Workspace Symbol Search Integration
```lua
-- Use telescope for better workspace symbol search
local telescope = require('telescope')
vim.keymap.set('n', '<leader>ws', function()
  require('telescope.builtin').lsp_dynamic_workspace_symbols()
end, { desc = 'Search workspace symbols' })

-- Document symbol outline
vim.keymap.set('n', '<leader>ds', function()
  require('telescope.builtin').lsp_document_symbols()
end, { desc = 'Document symbols' })
```

---

## Summary

This enhanced Alloy LSP server provides comprehensive language support for Neovim with all modern IDE features:

- **Core Features**: Completion, hover, definition, references, implementation, rename
- **Enhanced Features**: Signature help, formatting, folding, highlighting, code actions
- **Advanced Features**: Workspace diagnostics, symbol search, performance optimization

The server is designed to work seamlessly with both built-in Neovim LSP and external clients like COC, providing a rich development experience for Grafana Alloy configuration files.

For the latest updates and issues, check the project repository and feel free to contribute improvements or report bugs.