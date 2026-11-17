import {
  Definition,
  DefinitionParams,
  TextDocuments,
  Location,
  Range,
  Position,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as utils from "./utils";
import * as fs from "fs";
import * as path from "path";

// Component reference parsing is now handled by unified utils.getComponent function

/**
 * Check if the current position is on a declare block instantiation (function call)
 */
async function checkDeclareInstantiation(
  context: utils.ProviderContext,
  effectiveWorkspaceFolders: string[] = []
): Promise<{ declareName: string } | null> {
  const line = context.document.getText({
    start: { line: context.position.line, character: 0 },
    end: { line: context.position.line, character: 1000 }
  });

  // Look for component instantiation pattern: component_name "label" {
  const componentPattern = /^(\s*)([a-zA-Z_][a-zA-Z0-9_.]*)\s+"([^"]*)"\s*\{/;
  const match = line.match(componentPattern);

  if (match) {
    const componentName = match[2];
    const indentation = match[1];
    const nameStart = indentation.length;
    const nameEnd = nameStart + componentName.length;

    // Check if cursor is within the component name
    if (context.position.character >= nameStart && context.position.character <= nameEnd) {
      // Check if this component is declared (not a builtin component) - use workspace-aware check
      if (await utils.isDeclaredComponentWorkspace(context.documents, componentName, effectiveWorkspaceFolders)) {
        return { declareName: componentName };
      }
    }
  }

  return null;
}

/**
 * Find export definition in declared components
 */
async function findExportDefinition(
  documents: TextDocuments<TextDocument>,
  componentType: string,
  exportName: string,
  workspaceFolders: string[] = []
): Promise<Location | null> {
  // First, search through opened documents
  for (const document of documents.all()) {
    const result = findExportDefinitionInDocument(document, componentType, exportName);
    if (result) {
      return result;
    }
  }

  // If not found in opened documents, search through all workspace files
  // Use the first workspace folder if available, otherwise use current working directory
  const workspaceRoot = workspaceFolders.length > 0 ? workspaceFolders[0] : undefined;
  const workspaceFiles = getWorkspaceAlloyFiles(workspaceRoot);
  
  for (const filePath of workspaceFiles) {
    // Skip files that are already opened
    const fileUri = `file://${filePath}`;
    if (documents.get(fileUri)) {
      continue;
    }

    const document = readFileAsTextDocument(filePath);
    if (document) {
      const result = findExportDefinitionInDocument(document, componentType, exportName);
      if (result) {
        return result;
      }
    }
  }

  return null;
}

/**
 * Find export definition in a specific document
 */
function findExportDefinitionInDocument(
  document: TextDocument,
  componentType: string,
  exportName: string
): Location | null {
  const configBlocks = utils.parseConfigBlocks(document);

  for (const block of configBlocks) {
    if (block.type === 'declare' && block.label === componentType && block.blocks) {
      // Look for export blocks within this declare block
      for (const subBlock of block.blocks) {
        if (subBlock.name === 'export' && subBlock.label === exportName) {
          // Found the export block - return its location
          return {
            uri: document.uri,
            range: Range.create(
              Position.create(subBlock.range.start.line, subBlock.range.start.character),
              Position.create(subBlock.range.end.line, subBlock.range.end.character)
            )
          };
        }
      }
    }
  }

  return null;
}

/**
 * Check if the current position is on an argument name in a component instance
 */
function checkComponentInstanceArgument(
  context: utils.ProviderContext,
  allComponentData: Record<string, any>
): { componentType: string; argumentName: string } | null {
  const line = context.document.getText({
    start: { line: context.position.line, character: 0 },
    end: { line: context.position.line, character: 1000 }
  });

  // Look for argument assignment pattern: argument_name = value
  const argPattern = /^(\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)$/;
  const match = line.match(argPattern);

  if (match) {
    const argumentName = match[2];
    const indentation = match[1];
    const nameStart = indentation.length;
    const nameEnd = nameStart + argumentName.length;

    // Check if cursor is within the argument name
    if (context.position.character >= nameStart && context.position.character <= nameEnd) {
      // Find the component block this argument belongs to
      const componentType = findContainingComponent(context.document, context.position.line);
      if (componentType && allComponentData[componentType]?.isDeclared) {
        return { componentType, argumentName };
      }
    }
  }

  return null;
}

/**
 * Find the component type that contains the given line
 */
function findContainingComponent(document: TextDocument, line: number): string | null {
  const parsedComponents = utils.parseDocument(document);
  
  for (const component of parsedComponents) {
    if (line >= component.range.start.line && line <= component.range.end.line) {
      return component.name;
    }
  }
  
  return null;
}



/**
 * Check if the current position is on an argument reference (argument.name.value)
 */
function checkArgumentReference(context: utils.ProviderContext): { argumentName: string; isValueAccess: boolean } | null {
  const line = context.document.getText({
    start: { line: context.position.line, character: 0 },
    end: { line: context.position.line, character: 1000 }
  });
  
  const beforeCursor = line.substring(0, context.position.character);
  const afterCursor = line.substring(context.position.character);
  
  // Look for argument.name.value pattern around the cursor
  const fullLine = beforeCursor + afterCursor;
  const argumentPattern = /argument\.([a-zA-Z_][a-zA-Z0-9_]*)\.value/g;
  
  let match;
  while ((match = argumentPattern.exec(fullLine)) !== null) {
    const matchStart = match.index;
    const matchEnd = match.index + match[0].length;
    
    // Check if cursor is within this match
    if (context.position.character >= matchStart && context.position.character <= matchEnd) {
      const argumentName = match[1];
      
      // Check which part of the reference the cursor is on
      const argNameStart = matchStart + 9; // "argument.".length
      const argNameEnd = argNameStart + argumentName.length;
      
      if (context.position.character >= argNameStart && context.position.character <= argNameEnd) {
        // Cursor is on the argument name
        return { argumentName, isValueAccess: false };
      } else if (context.position.character >= argNameEnd) {
        // Cursor is on .value part
        return { argumentName, isValueAccess: true };
      }
    }
  }
  
  return null;
}

/**
 * Find the definition of an argument in declared components
 */
function findArgumentDefinition(
  documents: TextDocuments<TextDocument>,
  argumentName: string,
  currentDocument: TextDocument
): Location | null {
  // First, try to find the argument in the current document
  const currentDocArgDef = findArgumentInDocument(currentDocument, argumentName);
  if (currentDocArgDef) {
    return currentDocArgDef;
  }
  
  // If not found in current document, search all documents
  for (const document of documents.all()) {
    if (document.uri === currentDocument.uri) {
      continue; // Already checked
    }
    
    const argDef = findArgumentInDocument(document, argumentName);
    if (argDef) {
      return argDef;
    }
  }
  
  return null;
}

/**
 * Find argument definition within a specific document
 */
function findArgumentInDocument(document: TextDocument, argumentName: string): Location | null {
  const content = document.getText();
  const lines = content.split('\n');
  
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    
    // Look for argument blocks: argument "name" { ... }
    const argPattern = new RegExp(`\\bargument\\s+"${argumentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*\\{`);
    const match = line.match(argPattern);
    
    if (match) {
      const startChar = match.index || 0;
      const nameStart = line.indexOf(`"${argumentName}"`, startChar);
      const nameEnd = nameStart + argumentName.length + 2; // +2 for quotes
      
      return {
        uri: document.uri,
        range: Range.create(
          Position.create(lineIndex, nameStart + 1), // +1 to skip opening quote
          Position.create(lineIndex, nameEnd - 1)     // -1 to skip closing quote
        )
      };
    }
  }
  
  return null;
}

/**
 * Read a file from the filesystem and create a TextDocument
 */
function readFileAsTextDocument(filePath: string): TextDocument | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, "utf8");
    return TextDocument.create(`file://${filePath}`, "alloy", 1, content);
  } catch (error) {
    console.error(`Error reading file ${filePath}: ${error}`);
    return null;
  }
}

/**
 * Get all workspace files with .alloy extension
 */
function getWorkspaceAlloyFiles(workspaceRoot?: string): string[] {
  const files: string[] = [];

  // If no workspace root provided, try to find it from current working directory
  const rootDir = workspaceRoot || process.cwd();

  function scanDirectory(dir: string) {
    try {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
          scanDirectory(fullPath);
        } else if (stat.isFile() && item.endsWith('.alloy')) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      console.error(`Error scanning directory ${dir}: ${error}`);
    }
  }

  scanDirectory(rootDir);
  return files;
}

// NOTE: getWordAtPosition now uses centralized utils.getWordAtPosition

/**
 * Find component declarations across the workspace (including unopened files), with optional scope filtering
 */
async function findComponentDeclaration(
  documents: TextDocuments<TextDocument>, 
  componentName: string, 
  label?: string, 
  targetScope?: string,
  workspaceFolders: string[] = []
): Promise<Location | null> {
  // First, search through opened documents
  for (const document of documents.all()) {
    const result = findComponentDeclarationInDocument(document, componentName, label, targetScope);
    if (result) {
      return result;
    }
  }

  // If not found in opened documents, search through all workspace files
  // Use the first workspace folder if available, otherwise use current working directory
  const workspaceRoot = workspaceFolders.length > 0 ? workspaceFolders[0] : undefined;
  const workspaceFiles = getWorkspaceAlloyFiles(workspaceRoot);
  
  for (const filePath of workspaceFiles) {
    // Skip files that are already opened
    const fileUri = `file://${filePath}`;
    if (documents.get(fileUri)) {
      continue;
    }

    const document = readFileAsTextDocument(filePath);
    if (document) {
      const result = findComponentDeclarationInDocument(document, componentName, label, targetScope);
      if (result) {
        return result;
      }
    }
  }

  return null;
}

/**
 * Find component declarations in a specific document, with optional scope filtering
 */
function findComponentDeclarationInDocument(document: TextDocument, componentName: string, label?: string, targetScope?: string): Location | null {
  // Use the centralized getAllComponentDeclarations which includes scope information
  const declarations = utils.getAllComponentDeclarations(document);

  for (const decl of declarations) {
    // Check if this matches what we're looking for
    if (decl.componentType === componentName) {
      // If we're looking for a specific label, check if it matches
      if (label && decl.label !== label) {
        continue;
      }

      // Apply scope filtering if targetScope is provided
      if (targetScope !== undefined) {
        const declScope = decl.scope || 'root';
        if (declScope !== targetScope) {
          continue; // Skip declarations not in the target scope
        }
      }

      // Found a match
      return Location.create(
        document.uri,
        Range.create(
          Position.create(decl.line, decl.range.type.start),
          Position.create(decl.line, decl.range.type.end)
        )
      );
    }
  }

  return null;
}

/**
 * Find references to component outputs/inputs
 */
function findComponentReference(document: TextDocument, componentName: string, label?: string, property?: string): Location | null {
  const parsedComponents = utils.parseDocument(document);

  // Find the target component instance
  for (const component of parsedComponents) {
    if (component.name === componentName && component.label === label) {
      // Found the component, now look for the specific property if requested
      if (property) {
        // Look for the property within the component (e.g., "input" or "output" blocks)
        const targetBlock = utils.findBlockByPath(component.blocks, [property]);
        if (targetBlock) {
          return Location.create(
            document.uri,
            targetBlock.range
          );
        }
      } else {
        // Return the component declaration itself
        return Location.create(
          document.uri,
          component.range
        );
      }
    }
  }

  return null;
}

/**
 * Find declare block declarations across workspace (including unopened files)
 */
async function findDeclareBlockDeclaration(
  documents: TextDocuments<TextDocument>, 
  blockName: string, 
  workspaceFolders: string[] = []
): Promise<Location | null> {
  // First, search through opened documents
  for (const document of documents.all()) {
    const result = findDeclareBlockDeclarationInDocument(document, blockName);
    if (result) {
      return result;
    }
  }

  // If not found in opened documents, search through all workspace files
  // Use the first workspace folder if available, otherwise use current working directory
  const workspaceRoot = workspaceFolders.length > 0 ? workspaceFolders[0] : undefined;
  const workspaceFiles = getWorkspaceAlloyFiles(workspaceRoot);
  
  for (const filePath of workspaceFiles) {
    // Skip files that are already opened
    const fileUri = `file://${filePath}`;
    if (documents.get(fileUri)) {
      continue;
    }

    const document = readFileAsTextDocument(filePath);
    if (document) {
      const result = findDeclareBlockDeclarationInDocument(document, blockName);
      if (result) {
        return result;
      }
    }
  }

  return null;
}

/**
 * Find declare block declarations in a specific document
 */
function findDeclareBlockDeclarationInDocument(document: TextDocument, blockName: string): Location | null {
  const configBlocks = utils.parseConfigBlocks(document);

  for (const configBlock of configBlocks) {
    if (configBlock.type === 'declare' && configBlock.label === blockName) {
      return Location.create(
        document.uri,
        configBlock.range
      );
    }
  }

  return null;
}

/**
 * Find argument definition in a declare block across workspace (including unopened files)
 */
async function findDeclareArgumentDefinition(
  documents: TextDocuments<TextDocument>, 
  componentName: string, 
  argumentName: string, 
  workspaceFolders: string[] = []
): Promise<Location | null> {
  // First, search through opened documents
  for (const document of documents.all()) {
    const result = findDeclareArgumentDefinitionInDocument(document, componentName, argumentName);
    if (result) {
      return result;
    }
  }

  // If not found in opened documents, search through all workspace files
  // Use the first workspace folder if available, otherwise use current working directory
  const workspaceRoot = workspaceFolders.length > 0 ? workspaceFolders[0] : undefined;
  const workspaceFiles = getWorkspaceAlloyFiles(workspaceRoot);
  
  for (const filePath of workspaceFiles) {
    // Skip files that are already opened
    const fileUri = `file://${filePath}`;
    if (documents.get(fileUri)) {
      continue;
    }

    const document = readFileAsTextDocument(filePath);
    if (document) {
      const result = findDeclareArgumentDefinitionInDocument(document, componentName, argumentName);
      if (result) {
        return result;
      }
    }
  }

  return null;
}

/**
 * Find argument definition in a declare block in a specific document
 */
function findDeclareArgumentDefinitionInDocument(document: TextDocument, componentName: string, argumentName: string): Location | null {
  const configBlocks = utils.parseConfigBlocks(document);

  for (const configBlock of configBlocks) {
    if (configBlock.type === 'declare' && configBlock.label === componentName) {
      // Look for the argument block within the declare block
      if (configBlock.blocks) {
        for (const block of configBlock.blocks) {
          if (block.name === 'argument' && block.label === argumentName) {
            return Location.create(
              document.uri,
              block.range
            );
          }
        }
      }
    }
  }

  return null;
}

export async function provideDefinition(
  params: DefinitionParams,
  documents: TextDocuments<TextDocument>,
  workspaceFolders?: string[]
): Promise<Location | null> {
  // Use unified context manager for common initialization
  const context = utils.ProviderContext.create(params, documents);
  if (!context) {
    return null;
  }

  const wordAtPosition = context.getWordAtPosition();
  if (!wordAtPosition) {
    return null;
  }

  // Use workspace folders if provided, otherwise automatically detect from current document
  let effectiveWorkspaceFolders = workspaceFolders || [];
  
  if (effectiveWorkspaceFolders.length === 0) {
    // Automatically detect workspace from current document
    effectiveWorkspaceFolders = utils.getWorkspaceFromDocuments(documents, context.document);
  }

  // Get all available components including declared ones from workspace with proper workspace scanning
  let allComponentData: Record<string, any>;
  try {
    // Always use workspace scanning if folders are available
    if (effectiveWorkspaceFolders.length > 0) {
      allComponentData = await utils.getAllWorkspaceComponents(documents, effectiveWorkspaceFolders);
    } else {
      // Fallback to cached components for opened documents only
      allComponentData = utils.getCachedWorkspaceComponents(documents);
    }
  } catch (error) {
    console.error('Error getting workspace components:', error);
    // Fallback to cached components from opened documents
    allComponentData = utils.getCachedWorkspaceComponents(documents);
  }

  // Check if we're looking at an argument reference (argument.name.value)
  const argumentReference = checkArgumentReference(context);
  if (argumentReference) {
    const argDefinition = findArgumentDefinition(documents, argumentReference.argumentName, context.document);
    if (argDefinition) {
      return argDefinition;
    }
  }

  // Check if we're looking at an argument name in a component instance
  const instanceArgumentReference = checkComponentInstanceArgument(context, allComponentData);
  if (instanceArgumentReference) {
    const argDefinition = await findDeclareArgumentDefinition(documents, instanceArgumentReference.componentType, instanceArgumentReference.argumentName, effectiveWorkspaceFolders);
    if (argDefinition) {
      return argDefinition;
    }
  }

  // Try to get component at position using unified function
  let componentRef = await utils.getComponent(context.document, context.position, documents, effectiveWorkspaceFolders);

  if (componentRef) {
    // First check if this is an export reference from a declared component
    if (componentRef.property && allComponentData[componentRef.component]?.isDeclared) {
      const exportDefinition = await findExportDefinition(documents, componentRef.component, componentRef.property, effectiveWorkspaceFolders);
      if (exportDefinition) {
        return exportDefinition;
      }
    }

    // Check if this is a declared component reference (without property)
    if (await utils.isDeclaredComponentWorkspace(context.documents, componentRef.component, effectiveWorkspaceFolders) && !componentRef.property) {
      const declareDeclaration = await findDeclareBlockDeclaration(documents, componentRef.component, effectiveWorkspaceFolders);
      if (declareDeclaration) {
        return declareDeclaration;
      }
    }

    // Determine the scope of the current position
    const targetScope = utils.findScopeAtPosition(context.document, context.position);
    // Look for component declaration across the workspace with scope filtering
    const declaration = await findComponentDeclaration(documents, componentRef.component, componentRef.label, targetScope, effectiveWorkspaceFolders);
    if (declaration) {
      return declaration;
    }

    // Look for component reference (for properties like .input, .output)
    if (componentRef.property) {
      // Fallback to regular component property reference
      const reference = findComponentReference(context.document, componentRef.component, componentRef.label, componentRef.property);
      if (reference) {
        return reference;
      }
    }
  }

  // Check if this is a declare block instantiation (function call -> function definition)
  const declareInstantiation = await checkDeclareInstantiation(context, effectiveWorkspaceFolders);
  if (declareInstantiation) {
    const declareDeclaration = await findDeclareBlockDeclaration(documents, declareInstantiation.declareName, effectiveWorkspaceFolders);
    if (declareDeclaration) {
      return declareDeclaration;
    }
  }

  // Check if it's a declare block reference
  if (Object.keys(allComponentData).includes(wordAtPosition)) {
    // This might be a reference to a declare block
    const declareDeclaration = await findDeclareBlockDeclaration(documents, wordAtPosition, effectiveWorkspaceFolders);
    if (declareDeclaration) {
      return declareDeclaration;
    }
  }

  // Check if the word could be an argument in a declared component
  // This handles the case where we're in a component usage and want to jump to argument definition
  const content = context.document.getText();
  const currentComponent = utils.findComponentAtPosition(content, context.position, documents);

  // If we're not inside a component block, check if this word is an argument of any declared component
  if (!currentComponent) {
    for (const [componentName, componentData] of Object.entries(allComponentData)) {
      if (await utils.isDeclaredComponentWorkspace(documents, componentName, effectiveWorkspaceFolders) &&
          componentData.lsp_structure &&
          componentData.lsp_structure.arguments &&
          wordAtPosition in componentData.lsp_structure.arguments) {
        // Found an argument match in a declared component
        const argDefinition = await findDeclareArgumentDefinition(documents, componentName, wordAtPosition, effectiveWorkspaceFolders);
        if (argDefinition) {
          return argDefinition;
        }
      }
    }
  }

  // Check if we're inside a declared component and this might be an argument
  if (currentComponent && await utils.isDeclaredComponentWorkspace(documents, currentComponent, effectiveWorkspaceFolders)) {
    // Check if the word is an argument in the declared component
    const componentData = allComponentData[currentComponent];
    if (componentData && componentData.lsp_structure && componentData.lsp_structure.arguments) {
      if (wordAtPosition in componentData.lsp_structure.arguments) {
        // This is an argument in a declared component, find its definition
        const argDefinition = await findDeclareArgumentDefinition(documents, currentComponent, wordAtPosition, effectiveWorkspaceFolders);
        if (argDefinition) {
          return argDefinition;
        }
      }
    }
  }

  // Check if it's a simple component name (including declared components)
  let componentNameToCheck = wordAtPosition;

  // Special case: if we're on a component declaration (like clicking on the label in "component_type "label""),
  // we should use the current component type instead of the label
  if (currentComponent && wordAtPosition && !wordAtPosition.includes('.') &&
      !allComponentData[wordAtPosition] && allComponentData[currentComponent]) {
    componentNameToCheck = currentComponent;
  }



  // Handle case where word might be a component reference with label
  // Extract just the component name from patterns like "mssql" or "mssql "_local_2""
  if (wordAtPosition && componentNameToCheck === wordAtPosition) {
    // If it contains quotes, extract the component name
    if (wordAtPosition.includes('"')) {
      const match = wordAtPosition.match(/^([a-zA-Z_][a-zA-Z0-9_]*)/);
      if (match) {
        componentNameToCheck = match[1];
      }
    }
    // If it's just a component name, use it as is
    else if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(wordAtPosition)) {
      componentNameToCheck = wordAtPosition;
    }
  }

  if (allComponentData[componentNameToCheck]) {
    // If it's a declared component, go to the declare block
    if (await utils.isDeclaredComponentWorkspace(documents, componentNameToCheck, effectiveWorkspaceFolders)) {
      const declareDeclaration = await findDeclareBlockDeclaration(documents, componentNameToCheck, effectiveWorkspaceFolders);
      if (declareDeclaration) {
        return declareDeclaration;
      }
    } else {
      // Regular component, find its declaration
      const targetScope = utils.findScopeAtPosition(context.document, context.position);
      const componentDeclaration = await findComponentDeclaration(documents, componentNameToCheck, undefined, targetScope, effectiveWorkspaceFolders);
      if (componentDeclaration) {
        return componentDeclaration;
      }
    }
  }

  return null;
}