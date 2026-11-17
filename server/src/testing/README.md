# Comprehensive LSP Provider Testing Guide

Use the `comprehensive_test.alloy` file to test all available LSP providers in Neovim.

## Available LSP Providers

Your Alloy LSP includes **26 providers** with rich functionality:

### Core Language Features
1. **Completion Provider** - Autocomplete for components and arguments
2. **Hover Provider** - Documentation on hover
3. **Signature Help Provider** - Parameter hints while typing
4. **Diagnostics Provider** - Real-time error checking

### Navigation Features  
5. **Definition Provider** - Go to definition (F12)
6. **Declaration Provider** - Go to declaration
7. **Type Definition Provider** - Go to type definition
8. **References Provider** - Find all references (Shift+F12)
9. **Implementation Provider** - Find implementations

### Editing Features
10. **Rename Provider** - Intelligent renaming (F2)
11. **Code Action Provider** - Quick fixes and refactoring
12. **Document Formatting Provider** - Format entire document
13. **Document Range Formatting Provider** - Format selection
14. **On Type Formatting Provider** - Format as you type

### Visual Features
15. **Semantic Tokens Provider** - Enhanced syntax highlighting  
16. **Document Highlight Provider** - Highlight symbol occurrences
17. **Inlay Hints Provider** - Inline type/parameter hints
18. **CodeLens Provider** - Actionable insights above code
19. **Color Provider** - Color picking for hex values

### Structure Features
20. **Document Symbol Provider** - Document outline (Ctrl+Shift+O)
21. **Workspace Symbol Provider** - Global symbol search (Ctrl+T)
22. **Folding Range Provider** - Code folding
23. **Selection Range Provider** - Smart selection expansion
24. **Document Links Provider** - Clickable links

### Advanced Features  
25. **Call Hierarchy Provider** - Function call trees
26. **Type Hierarchy Provider** - Type inheritance trees

---

## Testing Instructions

### 1. **Completion Provider**
```vim
" Position cursor after opening quote and press Ctrl+Space
prometheus.scrape "test" {
    targets = [{"__address__" = "
                                ^ Ctrl+Space here for completions
    
" Try completing component names
prom<Ctrl+Space>  " Should show prometheus.* options
otel<Ctrl+Space>  " Should show otelcol.* options
```

**Expected**: Autocomplete suggestions for components, arguments, and values

### 2. **Hover Provider** 
```vim
" Hover over any component name, argument, or value
" Position cursor on 'prometheus.scrape' and hover
```
**Command**: `:lua vim.lsp.buf.hover()`
**Expected**: Documentation popup with component description

### 3. **Signature Help Provider**
```vim  
" Position cursor inside function calls or blocks
prometheus.scrape "test" {
    targets = concat(
                    ^ Ctrl+Shift+Space here
```
**Command**: `:lua vim.lsp.buf.signature_help()`
**Expected**: Parameter hints showing function signature

### 4. **Diagnostics Provider** 
```vim
" Open the test file - should see red squiggles under errors
" Look for errors on 'missing_args' and 'invalid_ref' components
```
**Command**: `:lua vim.diagnostic.open_float()`
**Expected**: Error messages for missing arguments, invalid references, duplicates

### 5. **Definition Provider (Go To Definition)**
```vim
" Position cursor on component reference and press F12
http_config "api_server" {
^^^^^^^^^^ cursor here, press F12
```
**Command**: `gd` or `:lua vim.lsp.buf.definition()`  
**Expected**: Jump to `declare "http_config"` definition

### 6. **References Provider (Find All References)**
```vim
" Position cursor on 'http_config' declare block and find references
declare "http_config" {
        ^^^^^^^^^^^ cursor here
```
**Command**: `gr` or `:lua vim.lsp.buf.references()`
**Expected**: List showing all usages of http_config

### 7. **Rename Provider**
```vim
" Position cursor on component label and press F2
prometheus.scrape "node_exporter" {
                  ^^^^^^^^^^^^^^ cursor here, press F2
```
**Command**: `:lua vim.lsp.buf.rename()`
**Expected**: Rename all occurrences across workspace

### 8. **Code Action Provider**  
```vim
" Position cursor on diagnostic error and request code actions
prometheus.scrape "missing_args" {
" Should show quick fix suggestions
```
**Command**: `<leader>ca` or `:lua vim.lsp.buf.code_action()`
**Expected**: Quick fix options for errors

### 9. **Document Formatting Provider**
```vim
" Format the entire document
```
**Command**: `:lua vim.lsp.buf.format()`
**Expected**: Proper indentation and formatting applied

### 10. **CodeLens Provider** 
```vim
" Should see actionable text above declare blocks and components
🔧 Declare Block     <- CodeLens above declare statements
declare "http_config" {

🔬 OpenTelemetry     <- CodeLens above otelcol components  
otelcol.receiver.otlp "grpc_receiver" {
```
**Command**: `<leader>cl` or `:lua vim.lsp.codelens.run()` (on line with CodeLens)
**Expected**: Information popup when clicked

### 11. **Document Symbol Provider (Outline)**
```vim
" Open document outline to see all symbols
```
**Command**: `<leader>o` or `:Telescope lsp_document_symbols`
**Expected**: Tree view of all components and declare blocks

### 12. **Workspace Symbol Provider**
```vim  
" Search for symbols across entire workspace
```
**Command**: `<leader>s` or `:Telescope lsp_workspace_symbols`
**Expected**: Find components across all files

### 13. **Hover on Different Elements**
Test hover on these specific elements:
- Component names: `prometheus.scrape`
- Arguments: `scrape_interval`  
- Values: `"15s"`
- References: `prometheus.remote_write.default.receiver`
- Functions: `concat()`, `format()`

### 14. **Folding Range Provider**
```vim
" Fold/unfold code blocks
```  
**Command**: `zc` (close fold), `zo` (open fold)
**Expected**: Nested blocks should fold properly

### 15. **Document Highlight Provider** 
```vim
" Position cursor on a symbol - should highlight all occurrences
```
**Expected**: All instances of the symbol highlighted in document

### 16. **Semantic Tokens Provider**
**Expected**: Enhanced syntax highlighting with:
- Different colors for component types vs arguments
- Proper highlighting of comments, strings, numbers
- Distinct colors for references vs definitions

### 17. **Inlay Hints Provider**
**Expected**: Inline hints showing:
- Parameter names in function calls
- Type information
- Implicit values

---

## Neovim Setup for Testing

Add to your Neovim config:

```lua
-- LSP Keybindings
vim.keymap.set('n', 'gd', vim.lsp.buf.definition, { desc = 'Go to definition' })
vim.keymap.set('n', 'gr', vim.lsp.buf.references, { desc = 'Go to references' })  
vim.keymap.set('n', 'K', vim.lsp.buf.hover, { desc = 'Hover documentation' })
vim.keymap.set('n', '<F2>', vim.lsp.buf.rename, { desc = 'Rename symbol' })
vim.keymap.set('n', '<leader>ca', vim.lsp.buf.code_action, { desc = 'Code actions' })
vim.keymap.set('n', '<leader>f', vim.lsp.buf.format, { desc = 'Format document' })
vim.keymap.set('n', '<leader>cl', vim.lsp.codelens.run, { desc = 'Run CodeLens' })

-- Diagnostic keybindings  
vim.keymap.set('n', '[d', vim.diagnostic.goto_prev, { desc = 'Previous diagnostic' })
vim.keymap.set('n', ']d', vim.diagnostic.goto_next, { desc = 'Next diagnostic' })
vim.keymap.set('n', '<leader>e', vim.diagnostic.open_float, { desc = 'Show diagnostic' })

-- Enable CodeLens
vim.api.nvim_create_autocmd({"BufEnter", "CursorHold", "InsertLeave"}, {
  callback = function()
    vim.lsp.codelens.refresh()
  end
})
```

## Testing Checklist

- [ ] **Completion** - Autocomplete works with Ctrl+Space
- [ ] **Hover** - Documentation appears on hover
- [ ] **Go to Definition** - F12 jumps to definitions  
- [ ] **Find References** - Shift+F12 shows all usages
- [ ] **Rename** - F2 renames across workspace
- [ ] **Diagnostics** - Errors shown with red squiggles
- [ ] **Code Actions** - Quick fixes available
- [ ] **Formatting** - Document formats correctly
- [ ] **CodeLens** - Actionable text appears above components
- [ ] **Document Outline** - Symbol tree shows structure
- [ ] **Folding** - Code blocks fold/unfold properly
- [ ] **Syntax Highlighting** - Enhanced colors applied
- [ ] **Inlay Hints** - Parameter hints visible

Your LSP implementation is comprehensive! Test each feature to see the full power of the Alloy Language Server.