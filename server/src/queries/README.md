# Treesitter Queries for Alloy Language

This directory contains treesitter query files for the Alloy configuration language, specifically for use with Neovim's treesitter integration.

## Features

### Language Injection
- **Regex Highlighting**: Automatically highlights regex patterns in `loki.relabel` component `regex` arguments using treesitter's "regex" language parser
- **Context-aware**: Only injects regex highlighting in appropriate contexts (within loki.relabel rule blocks)

### Syntax Highlighting  
- Component names (e.g., `prometheus.scrape`, `loki.write`)
- Keywords (`declare`, `argument`, `export`, etc.)
- String literals and numbers
- Comments
- Operators and punctuation

## Setup for Neovim

To use these queries with Neovim:

### Option 1: Using existing parser (recommended)
Since Alloy uses a simple configuration syntax, you can use an existing parser like `ini` or `toml`:

1. **Copy query files** to your Neovim runtime directory:
   ```bash
   mkdir -p ~/.config/nvim/queries/alloy/
   cp queries/alloy/* ~/.config/nvim/queries/alloy/
   ```

2. **Configure filetype detection** in your Neovim config:
   ```lua
   vim.filetype.add({
     extension = {
       alloy = 'alloy',
     }
   })
   
   -- Use a simpler parser like ini or toml for basic structure
   vim.treesitter.language.register('ini', 'alloy')
   ```

### Option 2: Custom parser setup
1. **Build a custom treesitter parser** using the provided grammar.js
2. **Install the parser**:
   ```bash
   # In the queries/alloy directory
   tree-sitter generate
   tree-sitter build-wasm
   # Copy the generated files to your treesitter parsers directory
   ```

3. **Configure Neovim**:
   ```lua
   vim.filetype.add({
     extension = {
       alloy = 'alloy',
     }
   })
   
   -- Load the custom parser
   vim.treesitter.language.add('alloy', { path = "/path/to/alloy.so" })
   ```

### Simplified Setup (Easiest)
For basic regex injection without a full parser:

1. **Use the simplified injection query**:
   ```bash
   mkdir -p ~/.config/nvim/queries/alloy/
   cp queries/alloy/injections-simple.scm ~/.config/nvim/queries/alloy/injections.scm
   ```

2. **Configure in init.lua**:
   ```lua
   vim.filetype.add({
     extension = { alloy = 'alloy' }
   })
   
   -- Use ini parser for basic structure
   vim.treesitter.language.register('ini', 'alloy')
   ```

## Query Files

- `highlights.scm` - Defines syntax highlighting rules for Alloy language constructs
- `injections.scm` - Defines language injection rules (e.g., regex patterns in loki.relabel components)

## Regex Injection Example

When you have Alloy code like this:
```alloy
loki.relabel "relabel_rules" {
    rule {
        regex         = "^(.*?)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
        replacement   = "$1/uuid"
        action        = "replace"
        source_labels = ["request_route"]
        target_label  = "request_route_formated"
    }
}
```

The regex pattern `"^(.*?)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"` will be highlighted using the regex treesitter parser, providing proper regex syntax highlighting with escape sequences, character classes, quantifiers, etc.

## Requirements

- Neovim with treesitter support
- `regex` treesitter parser (usually included with nvim-treesitter)
- Alloy treesitter parser (may need to be custom-built for this specific language)