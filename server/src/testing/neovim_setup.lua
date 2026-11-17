-- Neovim LSP Setup for Alloy Testing
-- Add this to your Neovim configuration

-- LSP Keybindings for comprehensive testing
local function setup_lsp_keymaps()
  -- Core navigation
  vim.keymap.set('n', 'gd', vim.lsp.buf.definition, { desc = 'Go to definition' })
  vim.keymap.set('n', 'gD', vim.lsp.buf.declaration, { desc = 'Go to declaration' })
  vim.keymap.set('n', 'gt', vim.lsp.buf.type_definition, { desc = 'Go to type definition' })
  vim.keymap.set('n', 'gi', vim.lsp.buf.implementation, { desc = 'Go to implementation' })
  vim.keymap.set('n', 'gr', vim.lsp.buf.references, { desc = 'Find references' })
  
  -- Documentation and help
  vim.keymap.set('n', 'K', vim.lsp.buf.hover, { desc = 'Hover documentation' })
  vim.keymap.set('n', '<C-k>', vim.lsp.buf.signature_help, { desc = 'Signature help' })
  
  -- Editing actions
  vim.keymap.set('n', '<F2>', vim.lsp.buf.rename, { desc = 'Rename symbol' })
  vim.keymap.set('n', '<leader>ca', vim.lsp.buf.code_action, { desc = 'Code actions' })
  vim.keymap.set('v', '<leader>ca', vim.lsp.buf.code_action, { desc = 'Code actions' })
  
  -- Formatting
  vim.keymap.set('n', '<leader>f', function()
    vim.lsp.buf.format({ async = true })
  end, { desc = 'Format document' })
  vim.keymap.set('v', '<leader>f', function()
    vim.lsp.buf.format({ async = true })
  end, { desc = 'Format selection' })
  
  -- CodeLens
  vim.keymap.set('n', '<leader>cl', vim.lsp.codelens.run, { desc = 'Run CodeLens' })
  vim.keymap.set('n', '<leader>cr', vim.lsp.codelens.refresh, { desc = 'Refresh CodeLens' })
  
  -- Document symbols and workspace symbols
  vim.keymap.set('n', '<leader>ds', vim.lsp.buf.document_symbol, { desc = 'Document symbols' })
  vim.keymap.set('n', '<leader>ws', vim.lsp.buf.workspace_symbol, { desc = 'Workspace symbols' })
  
  -- Call hierarchy (advanced feature)
  vim.keymap.set('n', '<leader>ic', vim.lsp.buf.incoming_calls, { desc = 'Incoming calls' })
  vim.keymap.set('n', '<leader>oc', vim.lsp.buf.outgoing_calls, { desc = 'Outgoing calls' })
  
  -- Inlay hints toggle
  vim.keymap.set('n', '<leader>ih', function()
    vim.lsp.inlay_hint.enable(not vim.lsp.inlay_hint.is_enabled())
  end, { desc = 'Toggle inlay hints' })
end

-- Diagnostic configuration and keymaps
local function setup_diagnostics()
  -- Configure diagnostic display
  vim.diagnostic.config({
    virtual_text = {
      source = "always",
      prefix = "●",
    },
    float = {
      source = "always",
      border = "rounded",
    },
    signs = true,
    underline = true,
    update_in_insert = false,
    severity_sort = true,
  })
  
  -- Diagnostic keybindings
  vim.keymap.set('n', '<leader>e', vim.diagnostic.open_float, { desc = 'Show diagnostic' })
  vim.keymap.set('n', '[d', vim.diagnostic.goto_prev, { desc = 'Previous diagnostic' })
  vim.keymap.set('n', ']d', vim.diagnostic.goto_next, { desc = 'Next diagnostic' })
  vim.keymap.set('n', '<leader>q', vim.diagnostic.setloclist, { desc = 'Diagnostic list' })
end

-- CodeLens auto-refresh
local function setup_codelens_autorefresh()
  vim.api.nvim_create_augroup("AlloyCodeLens", { clear = true })
  vim.api.nvim_create_autocmd({"BufEnter", "CursorHold", "InsertLeave"}, {
    group = "AlloyCodeLens",
    pattern = "*.alloy",
    callback = function()
      local ok, _ = pcall(vim.lsp.codelens.refresh)
      if not ok then
        -- Silently ignore errors to prevent spam
      end
    end,
  })
end

-- Document highlighting
local function setup_document_highlight()
  vim.api.nvim_create_augroup("AlloyDocumentHighlight", { clear = true })
  vim.api.nvim_create_autocmd({"CursorHold", "CursorHoldI"}, {
    group = "AlloyDocumentHighlight",
    pattern = "*.alloy",
    callback = function()
      vim.lsp.buf.document_highlight()
    end,
  })
  vim.api.nvim_create_autocmd("CursorMoved", {
    group = "AlloyDocumentHighlight", 
    pattern = "*.alloy",
    callback = function()
      vim.lsp.buf.clear_references()
    end,
  })
end

-- Folding configuration for better structure navigation
local function setup_folding()
  vim.opt.foldmethod = "expr"
  vim.opt.foldexpr = "nvim_treesitter#foldexpr()"
  vim.opt.foldlevel = 99  -- Start with all folds open
  vim.opt.foldlevelstart = 99
  
  -- Folding keymaps
  vim.keymap.set('n', 'za', 'za', { desc = 'Toggle fold' })
  vim.keymap.set('n', 'zA', 'zA', { desc = 'Toggle fold recursively' })
  vim.keymap.set('n', 'zc', 'zc', { desc = 'Close fold' })
  vim.keymap.set('n', 'zC', 'zC', { desc = 'Close fold recursively' })
  vim.keymap.set('n', 'zo', 'zo', { desc = 'Open fold' })
  vim.keymap.set('n', 'zO', 'zO', { desc = 'Open fold recursively' })
  vim.keymap.set('n', 'zr', 'zr', { desc = 'Reduce fold level' })
  vim.keymap.set('n', 'zR', 'zR', { desc = 'Open all folds' })
  vim.keymap.set('n', 'zm', 'zm', { desc = 'More folds' })
  vim.keymap.set('n', 'zM', 'zM', { desc = 'Close all folds' })
end

-- Testing helper commands
local function setup_testing_commands()
  -- Command to test all LSP features quickly
  vim.api.nvim_create_user_command('AlloyTestLSP', function()
    print("🧪 Testing Alloy LSP Features:")
    
    -- Test basic capabilities
    local clients = vim.lsp.get_active_clients({ name = "alloy-lsp" })
    if #clients == 0 then
      print("❌ No Alloy LSP client active")
      return
    end
    
    local client = clients[1]
    local caps = client.server_capabilities
    
    print("✅ LSP Client active")
    print("📝 Completion:", caps.completionProvider and "✅" or "❌")
    print("🔍 Hover:", caps.hoverProvider and "✅" or "❌")
    print("🎯 Definition:", caps.definitionProvider and "✅" or "❌")
    print("📚 References:", caps.referencesProvider and "✅" or "❌")
    print("✏️  Rename:", caps.renameProvider and "✅" or "❌")
    print("🔧 Code Actions:", caps.codeActionProvider and "✅" or "❌")
    print("📊 Diagnostics:", caps.diagnosticProvider and "✅" or "❌")
    print("🔎 CodeLens:", caps.codeLensProvider and "✅" or "❌")
    print("🎨 Semantic Tokens:", caps.semanticTokensProvider and "✅" or "❌")
    print("📋 Document Symbols:", caps.documentSymbolProvider and "✅" or "❌")
    print("🔍 Workspace Symbols:", caps.workspaceSymbolProvider and "✅" or "❌")
    print("📐 Folding:", caps.foldingRangeProvider and "✅" or "❌")
    print("🎯 Signature Help:", caps.signatureHelpProvider and "✅" or "❌")
    
  end, { desc = 'Test Alloy LSP capabilities' })
  
  -- Command to refresh all LSP features
  vim.api.nvim_create_user_command('AlloyRefreshLSP', function()
    vim.lsp.codelens.refresh()
    vim.diagnostic.reset()
    vim.cmd('LspRestart')
    print("🔄 Alloy LSP refreshed")
  end, { desc = 'Refresh Alloy LSP' })
end

-- Telescope integration (if available)
local function setup_telescope_integration()
  local ok, telescope = pcall(require, 'telescope')
  if not ok then
    return
  end
  
  -- Additional Telescope keymaps for LSP
  vim.keymap.set('n', '<leader>td', '<cmd>Telescope lsp_definitions<cr>', { desc = 'Telescope definitions' })
  vim.keymap.set('n', '<leader>tr', '<cmd>Telescope lsp_references<cr>', { desc = 'Telescope references' })
  vim.keymap.set('n', '<leader>ts', '<cmd>Telescope lsp_document_symbols<cr>', { desc = 'Telescope document symbols' })
  vim.keymap.set('n', '<leader>tS', '<cmd>Telescope lsp_workspace_symbols<cr>', { desc = 'Telescope workspace symbols' })
  vim.keymap.set('n', '<leader>ti', '<cmd>Telescope lsp_implementations<cr>', { desc = 'Telescope implementations' })
  vim.keymap.set('n', '<leader>tt', '<cmd>Telescope lsp_type_definitions<cr>', { desc = 'Telescope type definitions' })
  vim.keymap.set('n', '<leader>tca', '<cmd>Telescope lsp_code_actions<cr>', { desc = 'Telescope code actions' })
end

-- Main setup function
local function setup_alloy_lsp_testing()
  setup_lsp_keymaps()
  setup_diagnostics()
  setup_codelens_autorefresh()
  setup_document_highlight()
  setup_folding()
  setup_testing_commands()
  setup_telescope_integration()
  
  print("🚀 Alloy LSP testing setup complete!")
  print("📖 Use :AlloyTestLSP to check capabilities")
  print("🔄 Use :AlloyRefreshLSP to restart LSP")
end

-- Auto-setup when Alloy files are opened
vim.api.nvim_create_augroup("AlloyLSPSetup", { clear = true })
vim.api.nvim_create_autocmd("FileType", {
  group = "AlloyLSPSetup",
  pattern = "alloy",
  callback = function()
    setup_alloy_lsp_testing()
  end,
})

-- Return the setup function for manual calling
return {
  setup = setup_alloy_lsp_testing
}