import {
  Declaration,
  DeclarationParams,
  TextDocuments,
  Location,
  Range,
  Position,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as utils from "./utils";
import { Connection } from "vscode-languageserver/node";
import { getPerformanceManager } from "./performance";

/**
 * Get all workspace documents (opened + workspace files)
 */
async function getAllWorkspaceDocuments(
  documents: TextDocuments<TextDocument>,
  workspaceFolders: string[],
  connection?: Connection
): Promise<TextDocument[]> {
  const performanceManager = getPerformanceManager(connection);

  // Get opened documents
  const openedDocs = documents.all();

  try {
    // Get all alloy files in workspace
    const alloyFiles = await performanceManager.lazyLoadWorkspaceFiles(
      workspaceFolders,
      [] // No priority files
    );

    // Create TextDocument objects for workspace files not already opened
    const workspaceDocuments: TextDocument[] = [];

    for (const filePath of alloyFiles) {
      const uri = `file://${filePath}`;

      // Skip if already opened
      if (documents.get(uri)) {
        continue;
      }

      try {
        const { content } = await performanceManager.getCachedFileContent(filePath);
        const document = TextDocument.create(uri, 'alloy', 1, content);
        workspaceDocuments.push(document);
      } catch (error) {
        console.warn(`Error reading workspace file ${filePath}: ${error}`);
      }
    }

    return [...openedDocs, ...workspaceDocuments];
  } catch (error) {
    console.warn(`Error getting workspace documents: ${error}`);
    return openedDocs; // Fallback to opened documents only
  }
}

/**
 * Check if the current position is on a declared component usage (function call)
 */
async function checkDeclaredComponentUsage(
  context: utils.ProviderContext,
  workspaceFolders: string[] = []
): Promise<{ componentName: string; isUsage: boolean } | null> {
  const wordAtPosition = context.getWordAtPosition();
  if (!wordAtPosition) {
    return null;
  }

  // Check if this word is a declared component using workspace-aware check
  if (await utils.isDeclaredComponentWorkspace(context.documents, wordAtPosition, workspaceFolders)) {
    // Check if we're at a component usage (not the declare block itself)
    const line = context.getCurrentLineText();
    
    // If the line contains 'declare "componentName"', we're at the declaration, not usage
    if (line.includes(`declare "${wordAtPosition}"`)) {
      return null; // This is the declaration itself, not a usage
    }
    
    // Check if this looks like a component usage: componentName "label" {
    const usagePattern = new RegExp(`\\b${wordAtPosition.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+"[^"]*"\\s*\\{`);
    if (line.match(usagePattern)) {
      return { componentName: wordAtPosition, isUsage: true };
    }
  }
  
  return null;
}

/**
 * Find the declare block for a given component name
 */
async function findDeclareBlock(
  documents: TextDocuments<TextDocument>,
  componentName: string,
  workspaceFolders: string[] = [],
  connection?: Connection
): Promise<Location | null> {
  // Get all workspace documents (opened + workspace files)
  const allDocuments = await getAllWorkspaceDocuments(documents, workspaceFolders, connection);

  // Search all documents for the declare block
  for (const document of allDocuments) {
    const content = document.getText();
    const lines = content.split('\n');

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];

      // Look for declare "componentName" { pattern
      const declarePattern = new RegExp(`^\\s*declare\\s+"${componentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*\\{`);
      const match = line.match(declarePattern);

      if (match) {
        const nameStart = line.indexOf(`"${componentName}"`);
        if (nameStart !== -1) {
          return {
            uri: document.uri,
            range: Range.create(
              Position.create(lineIndex, nameStart + 1), // +1 to skip opening quote
              Position.create(lineIndex, nameStart + 1 + componentName.length) // -1 to skip closing quote
            )
          };
        }
      }
    }
  }

  return null;
}

/**
 * Find the declare block using parsed config blocks (more robust)
 */
async function findDeclareBlockRobust(
  documents: TextDocuments<TextDocument>,
  componentName: string,
  workspaceFolders: string[] = [],
  connection?: Connection
): Promise<Location | null> {
  // Get all workspace documents (opened + workspace files)
  const allDocuments = await getAllWorkspaceDocuments(documents, workspaceFolders, connection);

  // Search all documents for the declare block
  for (const document of allDocuments) {
    const configBlocks = utils.parseConfigBlocks(document);

    for (const configBlock of configBlocks) {
      if (configBlock.type === 'declare' && configBlock.label === componentName) {
        // Found the declare block, return the location of the component name
        return {
          uri: document.uri,
          range: Range.create(
            Position.create(configBlock.range.start.line, configBlock.range.start.character),
            Position.create(configBlock.range.start.line, configBlock.range.end.character)
          )
        };
      }
    }
  }

  return null;
}

/**
 * Provide declaration for declared component usage
 * This treats component usage like function calls and declare blocks like function declarations
 */
export async function provideDeclaration(
  params: DeclarationParams,
  documents: TextDocuments<TextDocument>,
  workspaceFolders: string[] = [],
  connection?: Connection
): Promise<Declaration | null> {
  // Use unified context manager
  const context = utils.ProviderContext.create(params, documents);
  if (!context) {
    return null;
  }

  // Use workspace folders if provided, otherwise automatically detect from current document
  let effectiveWorkspaceFolders = workspaceFolders || [];
  
  if (effectiveWorkspaceFolders.length === 0) {
    // Automatically detect workspace from current document
    effectiveWorkspaceFolders = utils.getWorkspaceFromDocuments(documents, context.document);
  }

  // Check if we're looking at a declared component usage (function call)
  const componentUsage = await checkDeclaredComponentUsage(context, effectiveWorkspaceFolders);
  if (!componentUsage) {
    return null;
  }

  // Find the declare block (function declaration)
  const declaration = await findDeclareBlockRobust(documents, componentUsage.componentName, effectiveWorkspaceFolders, connection);
  if (declaration) {
    return declaration;
  }

  // Fallback to simple text search
  return await findDeclareBlock(documents, componentUsage.componentName, effectiveWorkspaceFolders, connection);
}