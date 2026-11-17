import {
  RenameParams,
  TextDocumentPositionParams,
  TextDocuments,
  WorkspaceEdit,
  TextEdit,
  Range,
  Position,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as utils from "./utils";
import { getPerformanceManager } from "./performance";
import { Connection } from "vscode-languageserver/node";

// NOTE: Component identification functions are now centralized in utils.ts



/**
 * Check if a position is renameable (component labels, declare block names, argument names)
 */
function isRenameableSymbol(document: TextDocument, position: Position, documents?: TextDocuments<TextDocument>): { type: 'component-label' | 'declare-name' | 'argument-name'; name: string; range: Range; componentType?: string } | null {
  // Use centralized function from utils.ts with workspace awareness and convert the result to the expected format
  const renameableInfo = utils.getRenameableInfo(document, position, documents);
  if (!renameableInfo) return null;

  // Convert the centralized format to the format expected by this provider
  let mappedType: 'component-label' | 'declare-name' | 'argument-name';
  switch (renameableInfo.type) {
    case 'export-name':
      mappedType = 'argument-name'; // Map export-name to argument-name for compatibility
      break;
    case 'component-type':
      mappedType = 'declare-name'; // Map component-type to declare-name for compatibility  
      break;
    case 'component-label':
    case 'declare-name':
    case 'argument-name':
      mappedType = renameableInfo.type;
      break;
    default:
      // For unsupported types, return null
      return null;
  }

  return {
    type: mappedType,
    name: renameableInfo.name,
    componentType: renameableInfo.componentType,
    range: Range.create(
      Position.create(renameableInfo.range.start.line, renameableInfo.range.start.character),
      Position.create(renameableInfo.range.end.line, renameableInfo.range.end.character)
    )
  };
}



/**
 * Find the scope (declare block name) for a given position in the document
 */
function findScopeAtPosition(document: TextDocument, position: Position): string {
  const configBlocks = utils.parseConfigBlocks(document);
  
  for (const block of configBlocks) {
    if (block.type === 'declare' && block.label) {
      // Check if position is within this declare block
      if (position.line >= block.range.start.line && position.line <= block.range.end.line) {
        return block.label;
      }
    }
  }
  
  return 'root'; // Default to root scope
}

/**
 * Find all references to a component label across the workspace, filtered by scope
 */
function findComponentLabelReferences(documents: TextDocuments<TextDocument>, componentName: string, labelName: string, targetScope?: string): { uri: string; range: Range }[] {
  const references: { uri: string; range: Range }[] = [];
  const allComponentData = utils.getCachedWorkspaceComponents(documents);

  // Get all component declarations from the entire workspace
  const allComponentDeclarations = utils.getAllComponentDeclarationsWorkspace(documents);
  
  // Find component declarations with this label in the same scope
  for (const decl of allComponentDeclarations) {
    if (decl.componentType === componentName && decl.label === labelName) {
      // Only include declarations from the same scope
      const declScope = decl.scope || 'root';
      if (!targetScope || declScope === targetScope) {
        // Find the document URI for this declaration
        const document = documents.all().find(doc => {
          const docDeclarations = utils.getAllComponentDeclarations(doc);
          return docDeclarations.some(d => 
            d.line === decl.line && 
            d.componentType === decl.componentType && 
            d.label === decl.label && 
            (d.scope || 'root') === declScope
          );
        });
        
        if (document) {
          references.push({
            uri: document.uri,
            range: Range.create(
              Position.create(decl.line, decl.range.label.start),
              Position.create(decl.line, decl.range.label.end)
            )
          });
        }
      }
    }
  }

  for (const document of documents.all()) {
    // Find all component references using the centralized function
    const allReferences = utils.findAllComponentReferences(document, allComponentData);
    for (const ref of allReferences) {
      if (ref.component === componentName && ref.label && ref.label === labelName) {
        // Only include references from the same scope
        const refScope = ref.scope || 'root';
        if (!targetScope || refScope === targetScope) {
          // Add the label part of the reference
          const labelStart = ref.range.start.character + ref.component.length + 1; // +1 for the dot
          const labelEnd = labelStart + ref.label.length;
          references.push({
            uri: document.uri,
            range: Range.create(
              Position.create(ref.range.start.line, labelStart),
              Position.create(ref.range.start.line, labelEnd)
            )
          });
        }
      }
    }
  }

  return references;
}

/**
 * Find all references to a declared component name
 */
function findDeclareNameReferences(document: TextDocument, declareName: string): Range[] {
  const content = document.getText();
  const lines = content.split('\n');
  const references: Range[] = [];

  // Safety limit to prevent excessive processing
  const maxLines = Math.min(lines.length, 10000);

  for (let i = 0; i < maxLines; i++) {
    const line = lines[i];
    
    // Find declare declaration
    const declareDeclarationRegex = new RegExp(`^(\\s*)declare\\s+"${declareName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*\\{`);
    const declMatch = line.match(declareDeclarationRegex);
    if (declMatch) {
      const indentation = declMatch[1];
      const declareStart = indentation.length + 'declare '.length + 1; // +1 for opening quote
      references.push(Range.create(
        Position.create(i, declareStart),
        Position.create(i, declareStart + declareName.length)
      ));
    }

    // Find component usage of declared component
    // Use simpler regex to avoid catastrophic backtracking
    const simpleUsagePattern = `^(\\s*)${declareName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s`;
    if (line.match(new RegExp(simpleUsagePattern))) {
      // Verify this is actually a component usage by checking for opening brace
      if (line.includes('{')) {
        const indentMatch = line.match(/^(\s*)/);
        if (indentMatch) {
          const indentation = indentMatch[1];
          const componentStart = indentation.length;
          references.push(Range.create(
            Position.create(i, componentStart),
            Position.create(i, componentStart + declareName.length)
          ));
        }
      }
    }

    // Find references in component outputs/inputs (like my_component.output)
    // Only rename the first occurrence that represents a block/component name, not content
    const declareDeclarationRegex2 = new RegExp(`^(\\s*)declare\\s+"${declareName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*\\{`);
    const isDeclareMatch = line.match(declareDeclarationRegex2);
    const isUsageMatch = line.match(new RegExp(simpleUsagePattern));

    if (!isDeclareMatch && !isUsageMatch) {
      // Only look for component references in specific patterns, not general word matches
      // This prevents renaming occurrences within block content like strings or arguments

      // Look for component.label patterns (e.g., my_component.output)
      const componentRefPattern = `${declareName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.[a-zA-Z_]`;
      if (line.match(new RegExp(componentRefPattern))) {
        const matchIndex = line.indexOf(declareName);
        if (matchIndex !== -1) {
          references.push(Range.create(
            Position.create(i, matchIndex),
            Position.create(i, matchIndex + declareName.length)
          ));
        }
      }
    }
  }

  return references;
}

/**
 * Find all references to an export name within declare blocks
 */
function findExportNameReferences(document: TextDocument, exportName: string): Range[] {
  const content = document.getText();
  const lines = content.split('\n');
  const references: Range[] = [];

  // First, find which declare block contains this export
  const configBlocks = utils.parseConfigBlocks(document);
  let parentDeclareBlock: utils.ParsedConfigBlock | null = null;

  for (const configBlock of configBlocks) {
    if (configBlock.type === 'declare' && configBlock.blocks) {
      for (const block of configBlock.blocks) {
        if (block.name === 'export' && block.label === exportName) {
          parentDeclareBlock = configBlock;
          break;
        }
      }
      if (parentDeclareBlock) break;
    }
  }

  if (!parentDeclareBlock) return references;

  // Safety limit to prevent excessive processing
  const maxLines = Math.min(lines.length, 10000);

  for (let i = 0; i < maxLines; i++) {
    const line = lines[i];
    
    // Find export declaration: export "export_name" {
    const exportDeclarationRegex = new RegExp(`^(\\s*)export\\s+"${exportName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*\\{`);
    const expMatch = line.match(exportDeclarationRegex);
    if (expMatch) {
      const indentation = expMatch[1];
      const expStart = indentation.length + 'export '.length + 1; // +1 for opening quote
      references.push(Range.create(
        Position.create(i, expStart),
        Position.create(i, expStart + exportName.length)
      ));
    }

    // Find export usage as component.label.export_name
    // Only rename specific reference patterns, not general content
    if (!line.match(exportDeclarationRegex)) {
      // Look for component.label.exportName pattern
      const componentExportPattern = `\\.${exportName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`;
      const componentExportIndex = line.search(new RegExp(componentExportPattern));
      if (componentExportIndex !== -1) {
        const expIndex = componentExportIndex + 1; // +1 to skip the dot
        references.push(Range.create(
          Position.create(i, expIndex),
          Position.create(i, expIndex + exportName.length)
        ));
      }

      // For standalone export references, only look for specific patterns
      // like: export_name (in contexts where it's being referenced)
      // This is rare for exports, but if it exists, it should be in a specific pattern
      const standalonePattern = new RegExp(`^(\\s*)${exportName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
      if (line.match(standalonePattern) && !line.includes(`.${exportName}`)) {
        const expIndex = line.indexOf(exportName);
        if (expIndex !== -1) {
          references.push(Range.create(
            Position.create(i, expIndex),
            Position.create(i, expIndex + exportName.length)
          ));
        }
      }
    }
  }

  return references;
}

/**
 * Find all references to an argument name within declare blocks
 */
function findArgumentNameReferences(document: TextDocument, argumentName: string): Range[] {
  const content = document.getText();
  const lines = content.split('\n');
  const references: Range[] = [];

  // First, find which declare block contains this argument
  const configBlocks = utils.parseConfigBlocks(document);
  let parentDeclareBlock: utils.ParsedConfigBlock | null = null;

  for (const configBlock of configBlocks) {
    if (configBlock.type === 'declare' && configBlock.blocks) {
      for (const block of configBlock.blocks) {
        if (block.name === 'argument' && block.label === argumentName) {
          parentDeclareBlock = configBlock;
          break;
        }
      }
      if (parentDeclareBlock) break;
    }
  }

  if (!parentDeclareBlock) return references;

  // Safety limit to prevent excessive processing
  const maxLines = Math.min(lines.length, 10000);

  for (let i = 0; i < maxLines; i++) {
    const line = lines[i];

    // Find argument declaration: argument "argument_name" {
    const argumentDeclarationRegex = new RegExp(`^(\\s*)argument\\s+"${argumentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*\\{`);
    const argMatch = line.match(argumentDeclarationRegex);
    if (argMatch) {
      const indentation = argMatch[1];
      const argStart = indentation.length + 'argument '.length + 1; // +1 for opening quote
      references.push(Range.create(
        Position.create(i, argStart),
        Position.create(i, argStart + argumentName.length)
      ));
    }

    // Find argument usage as var.argument_name
    // Only rename specific reference patterns, not general content
    if (!line.match(argumentDeclarationRegex)) {
      // Look for var.argumentName pattern
      const varPattern = `var.${argumentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`;
      let varIndex = line.indexOf(varPattern);
      if (varIndex !== -1) {
        const argIndex = varIndex + 4; // +4 to skip "var."
        references.push(Range.create(
          Position.create(i, argIndex),
          Position.create(i, argIndex + argumentName.length)
        ));
      }

      // Look for argument.argumentName.value pattern
      const argumentValuePattern = new RegExp(`\\bargument\\.${argumentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.value\\b`, 'g');
      let argumentValueMatch;
      while ((argumentValueMatch = argumentValuePattern.exec(line)) !== null) {
        const matchStart = argumentValueMatch.index;
        const argNameStart = matchStart + 9; // "argument.".length
        const argNameEnd = argNameStart + argumentName.length;
        
        references.push(Range.create(
          Position.create(i, argNameStart),
          Position.create(i, argNameEnd)
        ));
      }

      // For standalone argument references, only look for assignment patterns
      // like: argument_name = value (but not inside strings)
      const assignmentPattern = new RegExp(`^(\\s*)${argumentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=`);
      if (line.match(assignmentPattern)) {
        const argIndex = line.indexOf(argumentName);
        if (argIndex !== -1) {
          references.push(Range.create(
            Position.create(i, argIndex),
            Position.create(i, argIndex + argumentName.length)
          ));
        }
      }
    }
  }

  return references;
}

/**
 * Workspace-aware version of findDeclareNameReferences
 */
async function findDeclareNameReferencesWorkspace(
  documents: TextDocuments<TextDocument>,
  declareName: string,
  workspaceFolders: string[] = [],
  connection?: Connection
): Promise<{ uri: string; range: Range }[]> {
  const references: { uri: string; range: Range }[] = [];

  const allDocuments = await getAllWorkspaceDocuments(documents, workspaceFolders, connection);

  for (const document of allDocuments) {
    const documentReferences = findDeclareNameReferences(document, declareName);
    for (const range of documentReferences) {
      references.push({ uri: document.uri, range });
    }
  }

  return references;
}

/**
 * Workspace-aware version of findExportNameReferences
 */
async function findExportNameReferencesWorkspace(
  documents: TextDocuments<TextDocument>,
  exportName: string,
  workspaceFolders: string[] = [],
  connection?: Connection
): Promise<{ uri: string; range: Range }[]> {
  const references: { uri: string; range: Range }[] = [];

  const allDocuments = await getAllWorkspaceDocuments(documents, workspaceFolders, connection);

  for (const document of allDocuments) {
    const documentReferences = findExportNameReferences(document, exportName);
    for (const range of documentReferences) {
      references.push({ uri: document.uri, range });
    }
  }

  return references;
}

/**
 * Workspace-aware version of findArgumentNameReferences
 */
async function findArgumentNameReferencesWorkspace(
  documents: TextDocuments<TextDocument>,
  argumentName: string,
  workspaceFolders: string[] = [],
  connection?: Connection
): Promise<{ uri: string; range: Range }[]> {
  const references: { uri: string; range: Range }[] = [];

  const allDocuments = await getAllWorkspaceDocuments(documents, workspaceFolders, connection);

  for (const document of allDocuments) {
    const documentReferences = findArgumentNameReferences(document, argumentName);
    for (const range of documentReferences) {
      references.push({ uri: document.uri, range });
    }
  }

  return references;
}

export async function prepareRename(
  params: TextDocumentPositionParams,
  documents: TextDocuments<TextDocument>,
  workspaceFolders: string[] = [],
  connection?: Connection
): Promise<Range | { range: Range; placeholder: string } | null> {
  try {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return null;
    }

    const renameInfo = isRenameableSymbol(document, params.position, documents);

    if (!renameInfo || !renameInfo.type || !renameInfo.name || !renameInfo.range) {
      return null;
    }

    // Validate that the range is valid
    const range = renameInfo.range;
    if (range.start.line < 0 || range.start.character < 0 ||
        range.end.line < 0 || range.end.character < 0) {
      return null;
    }

    // Ensure range ordering is correct
    if (range.end.line < range.start.line ||
        (range.end.line === range.start.line && range.end.character < range.start.character)) {
      return null;
    }

    // Validate range is within document bounds
    const lineCount = document.lineCount;
    if (range.start.line >= lineCount || range.end.line >= lineCount) {
      return null;
    }

    // Basic validation - ensure range is reasonable
    if (range.start.character < 0 || range.end.character < 0 ||
        range.start.character >= range.end.character) {
      return null;
    }

    return {
      range: renameInfo.range,
      placeholder: renameInfo.name
    };
  } catch (error) {
    // Return null to indicate rename not possible
    return null;
  }
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

export async function provideRename(
  params: RenameParams,
  documents: TextDocuments<TextDocument>,
  workspaceFolders: string[] = [],
  connection?: Connection
): Promise<WorkspaceEdit | null> {
  try {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return null;
}

    const renameInfo = isRenameableSymbol(document, params.position, documents);
    if (!renameInfo || !renameInfo.type || !renameInfo.name) {
      return null;
    }

    const changes: { [uri: string]: TextEdit[] } = {};
    let workspaceReferences: { uri: string; range: Range }[] = [];

    switch (renameInfo.type) {
      case 'component-label':
        // Use the component type from the renameInfo if available, otherwise fall back to findComponentAtPosition
        let componentName: string | null = renameInfo.componentType || null;
        if (!componentName) {
          const content = document.getText();
          componentName = utils.findComponentAtPosition(content, params.position, documents);
        }
        if (componentName) {
          // Determine the scope of the component being renamed
          const targetScope = findScopeAtPosition(document, params.position);
          workspaceReferences = findComponentLabelReferences(documents, componentName, renameInfo.name, targetScope);
        }
        break;

      case 'declare-name':
        // For declare names, search across workspace
        workspaceReferences = await findDeclareNameReferencesWorkspace(documents, renameInfo.name, workspaceFolders, connection);
        break;

      case 'argument-name':
        // Check if this is actually an export by checking if it's a declared export
        if (utils.isDeclaredExport(document, renameInfo.name)) {
          workspaceReferences = await findExportNameReferencesWorkspace(documents, renameInfo.name, workspaceFolders, connection);
        } else {
          workspaceReferences = await findArgumentNameReferencesWorkspace(documents, renameInfo.name, workspaceFolders, connection);
        }
        break;

      default:
        return null;
    }

    if (workspaceReferences.length === 0) {
      return null;
    }

    // Group references by URI
    const referencesByUri: { [uri: string]: Range[] } = {};
    for (const ref of workspaceReferences) {
      if (!referencesByUri[ref.uri]) {
        referencesByUri[ref.uri] = [];
      }
      referencesByUri[ref.uri].push(ref.range);
    }

    // Validate all ranges before creating text edits
    for (const [uri, ranges] of Object.entries(referencesByUri)) {
      const validRanges = ranges.filter(range =>
        range.start.line >= 0 && range.start.character >= 0 &&
        range.end.line >= 0 && range.end.character >= 0 &&
        range.end.line >= range.start.line &&
        (range.end.line > range.start.line || range.end.character >= range.start.character)
      );

      if (validRanges.length > 0) {
        // Safety limit to prevent excessive edits per file
        const maxReferences = Math.min(validRanges.length, 1000);
        const limitedRanges = validRanges.slice(0, maxReferences);

        // Create text edits for all valid references
        const textEdits: TextEdit[] = limitedRanges.map(range =>
          TextEdit.replace(range, params.newName.trim())
        );

        changes[uri] = textEdits;
      }
    }

    if (Object.keys(changes).length === 0) {
      return null;
    }

    // Final validation of the WorkspaceEdit
    const workspaceEdit = { changes };

    // Ensure all changes have valid text edits
    for (const edits of Object.values(workspaceEdit.changes)) {
      if (!edits || edits.length === 0) {
        return null;
      }

      // Validate each text edit
      for (const edit of edits) {
        if (!edit.range || !edit.hasOwnProperty('newText')) {
          return null;
        }
        // Ensure newText is a string
        if (typeof edit.newText !== 'string') {
          return null;
        }
        // Ensure range has proper structure
        const r = edit.range;
        if (!r.start || !r.end ||
            typeof r.start.line !== 'number' || typeof r.start.character !== 'number' ||
            typeof r.end.line !== 'number' || typeof r.end.character !== 'number') {
          return null;
        }
      }
    }

    return workspaceEdit;
  } catch (error) {
    // Return null to indicate rename failed
    return null;
  }
}

