import {
  Location,
  ReferenceParams,
  TextDocuments,
  Position,
  Range,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as utils from "./utils";
import { getPerformanceManager } from "./performance";
import { Connection } from "vscode-languageserver/node";

// Component reference finding is now handled by unified utils.getReferences function

/**
 * Find all references to an export from a declared component
 */
async function findDeclareComponentExportReferences(
  documents: TextDocuments<TextDocument>,
  componentType: string,
  exportName: string,
  workspaceFolders: string[] = [],
  connection?: Connection
): Promise<Location[]> {
  const references: Location[] = [];

  // Get all documents to search
  const allDocuments = await getAllWorkspaceDocuments(documents, workspaceFolders, connection);
  const allComponentData = await utils.getAllWorkspaceComponents(documents, workspaceFolders);

  for (const document of allDocuments) {
    // Find component references that use this export
    const componentRefs = utils.findAllComponentReferences(document, allComponentData);
    for (const ref of componentRefs) {
      if (ref.component === componentType && ref.property === exportName) {
        // Found a reference to this export
        references.push({
          uri: document.uri,
          range: {
            start: { line: ref.range.start.line, character: ref.range.start.character },
            end: { line: ref.range.end.line, character: ref.range.end.character }
          }
        });
      }
    }
  }
  
  // Also include the export definition itself
  const exportDefinition = findExportDefinitionLocation(allDocuments, componentType, exportName);
  if (exportDefinition) {
    references.push(exportDefinition);
  }
  
  return references;
}

/**
 * Find export definition location
 */
function findExportDefinitionLocation(
  documents: TextDocument[] | TextDocuments<TextDocument>,
  componentType: string,
  exportName: string
): Location | null {
  const docs = Array.isArray(documents) ? documents : documents.all();
  for (const document of docs) {
    const configBlocks = utils.parseConfigBlocks(document);
    
    for (const block of configBlocks) {
      if (block.type === 'declare' && block.label === componentType && block.blocks) {
        for (const subBlock of block.blocks) {
          if (subBlock.name === 'export' && subBlock.label === exportName) {
            return {
              uri: document.uri,
              range: {
                start: { line: subBlock.range.start.line, character: subBlock.range.start.character },
                end: { line: subBlock.range.end.line, character: subBlock.range.end.character }
              }
            };
          }
        }
      }
    }
  }
  
  return null;
}

/**
 * Find all references to a declare argument
 */
async function findDeclareArgumentReferences(
  documents: TextDocuments<TextDocument>,
  componentType: string,
  argumentName: string,
  workspaceFolders: string[] = [],
  connection?: Connection
): Promise<Location[]> {
  const references: Location[] = [];

  // Get all documents to search
  const allDocuments = await getAllWorkspaceDocuments(documents, workspaceFolders, connection);
  const allComponentData = await utils.getAllWorkspaceComponents(documents, workspaceFolders);

  for (const document of allDocuments) {
    // 1. Find component instances of this type and look for argument assignments
    const parsedComponents = utils.parseDocument(document);
    for (const component of parsedComponents) {
      if (component.name === componentType && allComponentData[componentType]?.isDeclared) {
        // Look for argument assignments within this component instance
        const content = document.getText();
        const lines = content.split('\n');
        
        for (let lineIndex = component.range.start.line; lineIndex <= component.range.end.line; lineIndex++) {
          if (lineIndex >= lines.length) break;
          
           const line = lines[lineIndex];
           const argPattern = new RegExp(`^(\\s*)${argumentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=`);
          const match = line.match(argPattern);
          
           if (match) {
             const indentation = match[1] || '';
             const startChar = indentation.length;
             references.push({
               uri: document.uri,
               range: {
                 start: { line: lineIndex, character: startChar },
                 end: { line: lineIndex, character: startChar + argumentName.length }
               }
             });
           }
        }
      }
    }
    
    // 2. Also find argument.name.value references within declare blocks
    const argumentReferences = utils.findArgumentReferencesInDocument(document, argumentName);
    references.push(...argumentReferences);
  }
  
  // Also include the argument definition itself
  const argDefinition = findDeclareArgumentDefinitionLocation(allDocuments, componentType, argumentName);
  if (argDefinition) {
    references.push(argDefinition);
  }
  
  return references;
}

/**
 * Find declare argument definition location
 */
function findDeclareArgumentDefinitionLocation(
  documents: TextDocument[] | TextDocuments<TextDocument>,
  componentType: string,
  argumentName: string
): Location | null {
  const docs = Array.isArray(documents) ? documents : documents.all();
  for (const document of docs) {
    const configBlocks = utils.parseConfigBlocks(document);
    
    for (const block of configBlocks) {
      if (block.type === 'declare' && block.label === componentType && block.blocks) {
        for (const subBlock of block.blocks) {
          if (subBlock.name === 'argument' && subBlock.label === argumentName) {
            return {
              uri: document.uri,
              range: {
                start: { line: subBlock.range.start.line, character: subBlock.range.start.character },
                end: { line: subBlock.range.end.line, character: subBlock.range.end.character }
              }
            };
          }
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
 * Find all instantiations of a declare block
 */
async function findDeclareInstantiationReferences(
  documents: TextDocuments<TextDocument>,
  declareName: string,
  workspaceFolders: string[],
  connection?: Connection
): Promise<Location[]> {
  const references: Location[] = [];

  // Get all documents to search
  const allDocuments = await getAllWorkspaceDocuments(documents, workspaceFolders, connection);

  for (const document of allDocuments) {
    // Find declare block definition
    const definition = utils.findDeclareBlockInDocument(document, declareName);
    if (definition) {
      references.push(definition);
    }

    // Find all instantiations of this declare block
    const instantiations = utils.findDeclareInstantiationsInDocument(document, declareName);
    references.push(...instantiations);
  }

  return references;
}







/**
 * Find all references to an argument
 */
async function findArgumentReferences(
  documents: TextDocuments<TextDocument>,
  argumentName: string,
  workspaceFolders: string[],
  connection?: Connection
): Promise<Location[]> {
  const references: Location[] = [];

  // Get all documents to search
  const allDocuments = await getAllWorkspaceDocuments(documents, workspaceFolders, connection);

  // Find the component type that declares this argument
  let declaringComponentType: string | null = null;
  for (const document of allDocuments) {
    const configBlocks = utils.parseConfigBlocks(document);
    for (const configBlock of configBlocks) {
      if (configBlock.type === 'declare' && configBlock.blocks) {
        for (const block of configBlock.blocks) {
          if (block.name === 'argument' && block.label === argumentName) {
            declaringComponentType = configBlock.label || null;
            break;
          }
        }
        if (declaringComponentType) break;
      }
    }
    if (declaringComponentType) break;
  }

  // If this is a declared argument, use the comprehensive search
  if (declaringComponentType) {
    return await findDeclareArgumentReferences(documents, declaringComponentType, argumentName, workspaceFolders, connection);
  }

  // Otherwise, do the basic search
  for (const document of allDocuments) {
    // Find argument definition
    const definition = utils.findArgumentInDocument(document, argumentName);
    if (definition) {
      references.push(definition);
    }

    // Find all argument.name.value references
    const argumentReferences = utils.findArgumentReferencesInDocument(document, argumentName);
    references.push(...argumentReferences);
  }

  return references;
}







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
 * Find all references to a declare block
 */
async function findDeclareBlockReferences(
  documents: TextDocuments<TextDocument>,
  declareName: string,
  workspaceFolders: string[] = [],
  connection?: Connection
): Promise<Location[]> {
  const references: Location[] = [];

  // Get all workspace documents
  const allDocuments = await getAllWorkspaceDocuments(documents, workspaceFolders, connection);

  for (const document of allDocuments) {
    const content = document.getText();
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip comments and empty lines
      if (trimmed.startsWith('//') || trimmed === '') {
        continue;
      }

      // Match declare blocks: declare "component_name"
      if (trimmed.includes('declare')) {
        const declareMatch = trimmed.match(/declare\s+"([^"]+)"/);
        if (declareMatch) {
          const declaredComponent = declareMatch[1];

          // Check if this is the declare block we're looking for
          if (declaredComponent === declareName) {
            const labelStart = line.indexOf(`"${declaredComponent}"`);
            const labelEnd = labelStart + declaredComponent.length + 2; // +2 for quotes

            references.push(Location.create(
              document.uri,
              Range.create(
                Position.create(i, labelStart),
                Position.create(i, labelEnd)
              )
            ));
          }
        }
      }

      // Match component declarations that reference the declared component
      const componentMatch = trimmed.match(/^([a-zA-Z_.][a-zA-Z0-9_.]*)\s*(?:"([^"]*)")?\s*\{/);
      if (componentMatch) {
        const declaredComponent = componentMatch[1];

        // Check if this component is declared
        if (declaredComponent === declareName) {
          const startChar = line.indexOf(declaredComponent);
          const endChar = startChar + declaredComponent.length;

          references.push(Location.create(
            document.uri,
            Range.create(
              Position.create(i, startChar),
              Position.create(i, endChar)
            )
          ));
        }
      }
    }
  }

  return references;
}

/**
 * Find all references to an argument in component instances
 */


/**
 * Find all references to an export in expressions
 */
function findExportReferences(
  documents: TextDocuments<TextDocument>,
  exportName: string
): Location[] {
  const references: Location[] = [];
  const foundRanges = new Set<string>(); // Track found ranges to avoid duplicates

  for (const document of documents.all()) {
    const content = document.getText();
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip comments and empty lines
      if (trimmed.startsWith('//') || trimmed === '') {
        continue;
      }

      // 1. Find export declarations: export "export_name" {
      const exportDeclarationRegex = new RegExp(`^\\s*export\\s+"${exportName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*\\{`);
      if (exportDeclarationRegex.test(line)) {
        const exportMatch = line.match(new RegExp(`"${exportName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
        if (exportMatch) {
          const startChar = exportMatch.index! + 1; // +1 to skip opening quote
          const endChar = startChar + exportName.length;
          const rangeKey = `${document.uri}:${i}:${startChar}:${endChar}`;
          
          if (!foundRanges.has(rangeKey)) {
            foundRanges.add(rangeKey);
            references.push(Location.create(
              document.uri,
              Range.create(
                Position.create(i, startChar),
                Position.create(i, endChar)
              )
            ));
          }
        }
      }

      // 2. Find export assignments: export_name = value
      const assignmentRegex = new RegExp(`^\\s*(${exportName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\s*=`);
      const assignmentMatch = line.match(assignmentRegex);
      if (assignmentMatch) {
        const startChar = assignmentMatch.index! + assignmentMatch[0].indexOf(exportName);
        const endChar = startChar + exportName.length;
        const rangeKey = `${document.uri}:${i}:${startChar}:${endChar}`;
        
        if (!foundRanges.has(rangeKey)) {
          foundRanges.add(rangeKey);
          references.push(Location.create(
            document.uri,
            Range.create(
              Position.create(i, startChar),
              Position.create(i, endChar)
            )
          ));
        }
      }

      // 3. Find export usage as component.label.export_name
      const exportUsageRegex = new RegExp(`\\b\\w+\\.\\w+\\.${exportName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
      let exportMatch;
      while ((exportMatch = exportUsageRegex.exec(line)) !== null) {
        const fullMatch = exportMatch[0];
        const exportStart = fullMatch.lastIndexOf(exportName);
        const startChar = exportMatch.index + exportStart;
        const endChar = startChar + exportName.length;
        const rangeKey = `${document.uri}:${i}:${startChar}:${endChar}`;
        
        if (!foundRanges.has(rangeKey)) {
          foundRanges.add(rangeKey);
          references.push(Location.create(
            document.uri,
            Range.create(
              Position.create(i, startChar),
              Position.create(i, endChar)
            )
          ));
        }
      }

      // 4. Find standalone export references (but not in assignments we already found)
      if (!assignmentRegex.test(line)) {
        const standaloneRegex = new RegExp(`\\b${exportName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
        let standaloneMatch;
        while ((standaloneMatch = standaloneRegex.exec(line)) !== null) {
          // Skip if this is part of a longer identifier we already handled
          const beforeContext = line.substring(Math.max(0, standaloneMatch.index - 10), standaloneMatch.index);
          const afterContext = line.substring(standaloneMatch.index + exportName.length, Math.min(line.length, standaloneMatch.index + exportName.length + 10));
          
          // Skip if this looks like it's part of a component reference (handled above)
          if (beforeContext.match(/\w+\.\w+\.$/) || afterContext.startsWith('.')) {
            continue;
          }
          
          const startChar = standaloneMatch.index;
          const endChar = startChar + exportName.length;
          const rangeKey = `${document.uri}:${i}:${startChar}:${endChar}`;
          
          if (!foundRanges.has(rangeKey)) {
            foundRanges.add(rangeKey);
            references.push(Location.create(
              document.uri,
              Range.create(
                Position.create(i, startChar),
                Position.create(i, endChar)
              )
            ));
          }
        }
      }
    }
  }

  return references;
}



/**
 * Check if a word is a declared argument in the document
 */
function isDeclaredArgument(document: TextDocument, argumentName: string): boolean {
  const configBlocks = utils.parseConfigBlocks(document);

  for (const configBlock of configBlocks) {
    if (configBlock.type === 'declare' && configBlock.blocks) {
      for (const block of configBlock.blocks) {
        if (block.name === 'argument' && block.label === argumentName) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Check if a word is a declared export in the document
 */
function isDeclaredExport(document: TextDocument, exportName: string): boolean {
  const configBlocks = utils.parseConfigBlocks(document);

  for (const configBlock of configBlocks) {
    if (configBlock.type === 'declare' && configBlock.blocks) {
      for (const block of configBlock.blocks) {
        if (block.name === 'export' && block.label === exportName) {
          return true;
        }
      }
    }
  }

  return false;
}

export async function provideReferences(
  params: ReferenceParams,
  documents: TextDocuments<TextDocument>,
  workspaceFolders: string[] = [],
  connection?: Connection
): Promise<Location[] | null> {
  // Use unified context manager for common initialization
  const context = utils.ProviderContext.create(params, documents, workspaceFolders);
  if (!context) {
    return null;
  }

  const wordAtPosition = context.getWordAtPosition();
  if (!wordAtPosition) {
    return null;
  }

  // Get all available components including declared ones from workspace with proper workspace scanning
  let allComponentData: Record<string, any>;
  try {
    if (workspaceFolders && workspaceFolders.length > 0) {
      allComponentData = await utils.getAllWorkspaceComponents(documents, workspaceFolders);
    } else {
      allComponentData = utils.getCachedWorkspaceComponents(documents);
    }
  } catch (error) {
    console.error('Error getting workspace components in references provider:', error);
    allComponentData = utils.getCachedWorkspaceComponents(documents);
  }

  // Check if we're looking at an export reference from a declared component
  const componentRef = await utils.getComponent(context.document, context.position, documents, workspaceFolders);
  if (componentRef && componentRef.property && allComponentData[componentRef.component]?.isDeclared) {
    const exportReferences = await findDeclareComponentExportReferences(documents, componentRef.component, componentRef.property, workspaceFolders, connection);
    if (exportReferences && exportReferences.length > 0) {
      return exportReferences;
    }
  }

  // Check if we're looking at an argument reference (argument.name.value)
  const argumentReference = utils.checkArgumentReference(context.document, context.position);
  if (argumentReference) {
    const argReferences = await findArgumentReferences(documents, argumentReference.argumentName, workspaceFolders, connection);
    if (argReferences && argReferences.length > 0) {
      return argReferences;
    }
  }

  // Check if we're looking at an argument name in a component instance
  const instanceArgumentReference = checkComponentInstanceArgument(context, allComponentData);
  if (instanceArgumentReference) {
    const argReferences = await findDeclareArgumentReferences(documents, instanceArgumentReference.componentType, instanceArgumentReference.argumentName, workspaceFolders, connection);
    if (argReferences && argReferences.length > 0) {
      return argReferences;
    }
  }

  // Check if we're looking at a declare block instantiation (function call)
  const declareInstantiation = utils.checkDeclareInstantiation(context.document, context.position);
  if (declareInstantiation) {
    const declareReferences = await findDeclareInstantiationReferences(documents, declareInstantiation.declareName, workspaceFolders, connection);
    if (declareReferences && declareReferences.length > 0) {
      return declareReferences;
    }
  }

  // Use unified component analyzer for parsing and validation
  const analyzer = await utils.ComponentAnalyzer.create(documents, workspaceFolders);
  const { componentName, componentLabel } = analyzer.parseComplexReference(wordAtPosition, context.document);

  // Check if this is a declared component
  if (utils.isDeclaredComponent(context.document, componentName)) {
    // Find all usages of this declared component
    return await findDeclareBlockReferences(documents, componentName, workspaceFolders, connection);
  }

  // Check if this is a component name (declared or builtin)
  if (analyzer.hasComponent(componentName)) {
    // Determine the scope of the current position
    const targetScope = utils.findScopeAtPosition(context.document, context.position);
    // Find all references to this component using unified function with scope filtering
    return await utils.getReferences(documents, componentName, componentLabel, workspaceFolders, connection, targetScope);
  }

  // Check if we're on a component declaration with a label
  const line = context.getCurrentLineText();

  // Check if this is the "declare", "argument", or "export" keyword FIRST
  // This needs to come before general component matching to avoid conflicts
  if (wordAtPosition === 'declare') {
    // Find the declare block name and return references to that specific declare block
    const declareMatch = line.match(/declare\s+"([^"]+)"/);
    if (declareMatch) {
      const declareName = declareMatch[1];
      return await findDeclareBlockReferences(documents, declareName, workspaceFolders, connection);
    }
  }

  if (wordAtPosition === 'argument') {
    // Find the argument name and return references to that specific argument
    const argumentMatch = line.match(/argument\s+"([^"]+)"/);
    if (argumentMatch) {
      const argumentName = argumentMatch[1];
      return await findArgumentReferences(documents, argumentName, workspaceFolders, connection);
    }
  }

  if (wordAtPosition === 'export') {
    // Find the export name and return references to that specific export
    const exportMatch = line.match(/export\s+"([^"]+)"/);
    if (exportMatch) {
      const exportName = exportMatch[1];
      return findExportReferences(documents, exportName);
    }
  }

  const trimmed = line.trim();
  // Only match component declarations, not argument assignments
  // Component declarations end with either " {" (with label) or just " {" (without label)
  // Argument assignments contain "=" 
  if (trimmed.match(/^[a-zA-Z_.]/) && !trimmed.includes('=')) {
    const componentMatch = trimmed.match(/^([a-zA-Z_.][a-zA-Z0-9_.]*)\s*(?:"([^"]*)")?\s*\{/);
    if (componentMatch) {
      const componentName = componentMatch[1];
      const label = componentMatch[2];

      // Skip if this is a keyword we already handled above
      if (componentName === 'declare' || componentName === 'argument' || componentName === 'export' ||
          componentName === 'foreach' || componentName === 'http' || componentName === 'import.file' ||
          componentName === 'import.git' || componentName === 'import.http' || componentName === 'import.string' ||
          componentName === 'livedebugging' || componentName === 'livelogging' || componentName === 'logging' ||
          componentName === 'remotecfg' || componentName === 'tracing') {
        // Continue to other checks
      } else {
        // Check if cursor is on the component name
        const componentStart = line.indexOf(componentName);
        const componentEnd = componentStart + componentName.length;

        if (context.position.character >= componentStart && context.position.character <= componentEnd) {
          // Determine the scope of the current position
          const targetScope = utils.findScopeAtPosition(context.document, context.position);
          // Find all references to this specific component instance (with label) using unified function with scope filtering
          return await utils.getReferences(documents, componentName, label, workspaceFolders, connection, targetScope);
        }
      }
    }
  }

  // Check if this is a declared argument
  if (isDeclaredArgument(context.document, wordAtPosition)) {
    // Find all usages of this declared argument
    return await findArgumentReferences(documents, wordAtPosition, workspaceFolders, connection);
  }

  // Check if this is a declared export
  if (isDeclaredExport(context.document, wordAtPosition)) {
    // Find all usages of this declared export
    return findExportReferences(documents, wordAtPosition);
  }

  return null;
}