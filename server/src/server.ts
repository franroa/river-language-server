import {
  createConnection,
  TextDocuments,
  InitializeParams,
  DidChangeConfigurationNotification,
  CompletionItem,
  TextDocumentPositionParams,
  TextDocumentSyncKind,
  InitializeResult,
  DocumentDiagnosticParams,
  InlayHintParams
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';

import { getDocumentDiagnostics } from './diagnostics';
import { provideDocumentSymbols } from './symbolProvider';
import { provideCompletions } from './completionProvider';
import { provideHover } from './hoverProvider';
import { provideCodeActions } from './codeActionProvider';
import { provideDefinition } from './definitionProvider';
import { provideReferences } from './referencesProvider';
import { provideImplementation } from './implementationProvider';
import { provideRename } from './renameProvider';
import { provideSignatureHelp } from './signatureHelpProvider';
import { provideDocumentFormatting } from './documentFormattingProvider';
import { provideDocumentRangeFormatting } from './documentRangeFormattingProvider';
import { provideFoldingRanges } from './foldingRangeProvider';
import { provideDocumentHighlight } from './documentHighlightProvider';
import { provideDeclaration } from './declarationProvider';
import { semanticTokensLegend } from './semanticTokensProvider';
import { provideSelectionRanges } from './selectionRangeProvider';
import { provideWorkspaceSymbols } from './workspaceSymbolsProvider';
import { provideDocumentLinks } from './documentLinksProvider';
import { provideTypeDefinition } from './typeDefinitionProvider';
import { provideCodeLenses } from './codeLensProvider';
import { provideDocumentColors } from './colorProvider';
import { provideInlayHints } from './inlayHintsProvider';
import { configManager } from './configuration';

const connection = createConnection(process.stdin, process.stdout);
const documents = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;

connection.onInitialize((params: InitializeParams) => {
  const capabilities = params.capabilities;

  hasConfigurationCapability = !!(
    capabilities.workspace && !!capabilities.workspace.configuration
  );
  hasWorkspaceFolderCapability = !!(
    capabilities.workspace && !!capabilities.workspace.workspaceFolders
  );

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: true
      },
      signatureHelpProvider: {
        triggerCharacters: ['"', '{', ' ', '='],
      },
      documentFormattingProvider: true,
      documentRangeFormattingProvider: false, // Disabled by default  
      foldingRangeProvider: true,
      documentHighlightProvider: true,
      semanticTokensProvider: {
        legend: semanticTokensLegend,
        range: true,
        full: true,
      },
      inlayHintProvider: {
        resolveProvider: false
      },
      callHierarchyProvider: true,
      selectionRangeProvider: true,
      typeDefinitionProvider: true,
      codeLensProvider: {
        resolveProvider: false
      },
      colorProvider: true,
      linkedEditingRangeProvider: true,
      typeHierarchyProvider: true,
      definitionProvider: true,
      implementationProvider: true,
      referencesProvider: true,
      declarationProvider: true,
      hoverProvider: true,
      workspaceSymbolProvider: true,
      documentSymbolProvider: true,
      codeActionProvider: true,
      renameProvider: true,
      documentLinkProvider: {
        resolveProvider: false
      },
      diagnosticProvider: {
        identifier: 'alloy',
        interFileDependencies: false,
        workspaceDiagnostics: false
      }
    }
  };
  if (hasWorkspaceFolderCapability) {
    result.capabilities.workspace = {
      workspaceFolders: {
        supported: true
      }
    };
  }
  return result;
});

connection.onInitialized(async () => {
  if (hasConfigurationCapability) {
    connection.client.register(DidChangeConfigurationNotification.type, undefined);
  }
  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders(_event => {
      connection.console.log('Workspace folder change event received.');
    });
  }

  // Initialize configuration manager
  try {
    await configManager.initialize(connection, hasConfigurationCapability);
    connection.console.log("Server initialized successfully");
  } catch (error) {
    connection.console.error(`Failed to initialize server: ${error}`);
  }
});

connection.onDidChangeConfiguration(_change => {
  if (hasConfigurationCapability) {
    // Reset all cached document settings
    documents.all().forEach(validateTextDocument);
  } else {
    // Global settings
    documents.all().forEach(validateTextDocument);
  }
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(change => {
  validateTextDocument(change.document);
});

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  try {
    const diagnostics = await getDocumentDiagnostics(textDocument);
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
  } catch (error) {
    connection.console.error(`Error validating document: ${error}`);
  }
}

connection.onCompletion(
  (textDocumentPosition: TextDocumentPositionParams): CompletionItem[] | null => {
    try {
      return provideCompletions(textDocumentPosition, documents);
    } catch (error) {
      connection.console.error(`Completion error: ${error}`);
      return null;
    }
  }
);

connection.onCompletionResolve(
  (item: CompletionItem): CompletionItem => {
    return item;
  }
);

connection.onHover((params) => {
  try {
    return provideHover(params, documents);
  } catch (error) {
    connection.console.error(`Hover error: ${error}`);
    return null;
  }
});

connection.onCodeAction((params) => {
  try {
    return provideCodeActions(params, documents);
  } catch (error) {
    connection.console.error(`Code action error: ${error}`);
    return null;
  }
});

connection.onDocumentFormatting(async (params) => {
  try {
    return await provideDocumentFormatting(params, documents);
  } catch (error) {
    connection.console.error(`Document formatting error: ${error}`);
    return null;
  }
});

connection.onDocumentRangeFormatting((params) => {
  try {
    return provideDocumentRangeFormatting(params, documents);
  } catch (error) {
    connection.console.error(`Document range formatting error: ${error}`);
    return null;
  }
});

connection.onFoldingRanges((params) => {
  try {
    return provideFoldingRanges(params, documents);
  } catch (error) {
    connection.console.error(`Folding ranges error: ${error}`);
    return null;
  }
});

connection.onDocumentHighlight((params) => {
  try {
    return provideDocumentHighlight(params, documents);
  } catch (error) {
    connection.console.error(`Document highlight error: ${error}`);
    return null;
  }
});

connection.onDeclaration((params) => {
  try {
    return provideDeclaration(params, documents);
  } catch (error) {
    connection.console.error(`Declaration error: ${error}`);
    return null;
  }
});

connection.onDefinition((params) => {
  try {
    return provideDefinition(params, documents);
  } catch (error) {
    connection.console.error(`Definition error: ${error}`);
    return null;
  }
});

connection.onReferences((params) => {
  try {
    return provideReferences(params, documents);
  } catch (error) {
    connection.console.error(`References error: ${error}`);
    return null;
  }
});

connection.onImplementation((params) => {
  try {
    return provideImplementation(params, documents);
  } catch (error) {
    connection.console.error(`Implementation error: ${error}`);
    return null;
  }
});

connection.onRenameRequest((params) => {
  try {
    return provideRename(params, documents);
  } catch (error) {
    connection.console.error(`Rename error: ${error}`);
    return null;
  }
});

connection.onSignatureHelp((params) => {
  try {
    return provideSignatureHelp(params, documents);
  } catch (error) {
    connection.console.error(`Signature help error: ${error}`);
    return null;
  }
});

connection.onDocumentSymbol((params) => {
  try {
    return provideDocumentSymbols(params, documents);
  } catch (error) {
    connection.console.error(`Document symbols error: ${error}`);
    return null;
  }
});

connection.onWorkspaceSymbol((params) => {
  try {
    return provideWorkspaceSymbols(params, documents);
  } catch (error) {
    connection.console.error(`Workspace symbols error: ${error}`);
    return null;
  }
});

connection.onDocumentLinks((params) => {
  try {
    return provideDocumentLinks(params, documents);
  } catch (error) {
    connection.console.error(`Document links error: ${error}`);
    return null;
  }
});

connection.onTypeDefinition((params) => {
  try {
    return provideTypeDefinition(params, documents);
  } catch (error) {
    connection.console.error(`Type definition error: ${error}`);
    return null;
  }
});

connection.onCodeLens((params) => {
  try {
    return provideCodeLenses(params, documents);
  } catch (error) {
    connection.console.error(`Code lens error: ${error}`);
    return null;
  }
});

connection.onDocumentColor((params) => {
  try {
    return provideDocumentColors(params, documents);
  } catch (error) {
    connection.console.error(`Document color error: ${error}`);
    return null;
  }
});

connection.onSelectionRanges((params) => {
  try {
    return provideSelectionRanges(params, documents);
  } catch (error) {
    connection.console.error(`Selection ranges error: ${error}`);
    return null;
  }
});

// Handle pull-based diagnostics request
connection.onRequest('textDocument/diagnostic', async (params: any) => {
  try {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return {
        kind: 'full',
        items: []
      };
    }
    
    const diagnostics = await getDocumentDiagnostics(document);
    return {
      kind: 'full',
      items: diagnostics
    };
  } catch (error) {
    connection.console.error(`Diagnostic request error: ${error}`);
    return {
      kind: 'full', 
      items: []
    };
  }
});

// Handle pull-based diagnostics
connection.languages.diagnostics.on(async (params) => {
  try {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return {
        kind: 'full',
        items: []
      };
    }
    
    const diagnostics = await getDocumentDiagnostics(document);
    return {
      kind: 'full',
      items: diagnostics
    };
  } catch (error) {
    connection.console.error(`Diagnostic error: ${error}`);
    return {
      kind: 'full',
      items: []
    };
  }
});

// Handle inlay hints request
connection.languages.inlayHint.on((params: InlayHintParams) => {
  try {
    return provideInlayHints(params, documents);
  } catch (error) {
    connection.console.error(`Inlay hint error: ${error}`);
    return [];
  }
});

documents.listen(connection);
connection.listen();