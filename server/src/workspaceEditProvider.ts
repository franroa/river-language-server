import {
  WorkspaceEdit,
  TextEdit,
  TextDocuments,
  Range,
  Position,
  CreateFile,
  RenameFile,
  DeleteFile,
  TextDocumentEdit,
  VersionedTextDocumentIdentifier,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as utils from "./utils";

/**
 * Enhanced workspace edit operations for multi-file refactoring
 */

/**
 * Rename a component across all files in the workspace
 */
export async function renameComponentAcrossWorkspace(
  componentType: string,
  oldLabel: string,
  newLabel: string,
  documents: TextDocuments<TextDocument>
): Promise<WorkspaceEdit> {
  const workspaceEdit: WorkspaceEdit = {
    changes: {},
  };

  try {
    for (const document of documents.all()) {
      try {
        const edits = renameComponentInDocument(document, componentType, oldLabel, newLabel);
        if (edits.length > 0) {
          workspaceEdit.changes![document.uri] = edits;
        }
      } catch (error) {
        console.error(`Error renaming component in document ${document.uri}:`, error);
        // Continue with next document
      }
    }
  } catch (error) {
    console.error('Error in renameComponentAcrossWorkspace:', error);
  }

  return workspaceEdit;
}

/**
 * Rename a declare block and all its instantiations across the workspace
 */
export async function renameDeclareBlockAcrossWorkspace(
  oldName: string,
  newName: string,
  documents: TextDocuments<TextDocument>
): Promise<WorkspaceEdit> {
  const workspaceEdit: WorkspaceEdit = {
    changes: {},
  };

  for (const document of documents.all()) {
    const edits: TextEdit[] = [];
    
    // Rename the declare block definition
    const declareEdits = renameDeclareBlockDefinition(document, oldName, newName);
    edits.push(...declareEdits);
    
    // Rename all instantiations of this declare block
    const instantiationEdits = renameDeclareBlockInstantiations(document, oldName, newName);
    edits.push(...instantiationEdits);

    if (edits.length > 0) {
      workspaceEdit.changes![document.uri] = edits;
    }
  }

  return workspaceEdit;
}

/**
 * Extract a component into a declare block with refactoring
 */
export async function extractToDeclareBlock(
  sourceDocument: TextDocument,
  componentRange: Range,
  declareBlockName: string,
  documents: TextDocuments<TextDocument>
): Promise<WorkspaceEdit> {
  const workspaceEdit: WorkspaceEdit = {
    documentChanges: [],
  };

  // Get the component content
  const componentContent = sourceDocument.getText(componentRange);
  const component = parseComponentFromContent(componentContent);
  
  if (!component) {
    return workspaceEdit;
  }

  // Generate declare block content
  const declareBlockContent = generateDeclareBlock(component, declareBlockName);
  
  // Generate instantiation content
  const instantiationContent = generateComponentInstantiation(component, declareBlockName);

  // Edit 1: Replace original component with instantiation
  const sourceEdit: TextDocumentEdit = {
    textDocument: { uri: sourceDocument.uri, version: null },
    edits: [
      {
        range: componentRange,
        newText: instantiationContent,
      },
    ],
  };

  // Edit 2: Add declare block at the top of the document
  const insertPosition: Position = { line: 0, character: 0 };
  const declareEdit: TextDocumentEdit = {
    textDocument: { uri: sourceDocument.uri, version: null },
    edits: [
      {
        range: { start: insertPosition, end: insertPosition },
        newText: declareBlockContent + '\n\n',
      },
    ],
  };

  workspaceEdit.documentChanges!.push(declareEdit, sourceEdit);

  return workspaceEdit;
}

/**
 * Inline a declare block (replace all instantiations with the actual component content)
 */
export async function inlineDeclareBlock(
  declareBlockName: string,
  documents: TextDocuments<TextDocument>
): Promise<WorkspaceEdit> {
  const workspaceEdit: WorkspaceEdit = {
    changes: {},
  };

  // Find the declare block definition
  let declareBlockContent: string | null = null;
  let declareBlockDocument: TextDocument | null = null;
  let declareBlockRange: Range | null = null;

  for (const document of documents.all()) {
    const configBlocks = utils.parseConfigBlocks(document);
    for (const configBlock of configBlocks) {
      if (configBlock.type === 'declare' && configBlock.label === declareBlockName) {
        declareBlockContent = document.getText(configBlock.range);
        declareBlockDocument = document;
        declareBlockRange = configBlock.range;
        break;
      }
    }
    if (declareBlockContent) break;
  }

  if (!declareBlockContent || !declareBlockDocument || !declareBlockRange) {
    return workspaceEdit;
  }

  // Parse the declare block to extract the component template
  const componentTemplate = extractComponentFromDeclareBlock(declareBlockContent);
  
  // Find all instantiations and replace them
  for (const document of documents.all()) {
    const edits: TextEdit[] = [];
    
    // Remove declare block definition
    if (document.uri === declareBlockDocument.uri) {
      edits.push({
        range: declareBlockRange,
        newText: '',
      });
    }

    // Replace instantiations with expanded content
    const instantiationEdits = replaceInstantiationsWithTemplate(
      document,
      declareBlockName,
      componentTemplate
    );
    edits.push(...instantiationEdits);

    if (edits.length > 0) {
      workspaceEdit.changes![document.uri] = edits;
    }
  }

  return workspaceEdit;
}

/**
 * Move a component to a different file
 */
export async function moveComponentToFile(
  sourceDocument: TextDocument,
  componentRange: Range,
  targetFilePath: string,
  documents: TextDocuments<TextDocument>
): Promise<WorkspaceEdit> {
  const workspaceEdit: WorkspaceEdit = {
    documentChanges: [],
  };

  const componentContent = sourceDocument.getText(componentRange);
  const targetUri = `file://${targetFilePath}`;

  // Edit 1: Remove from source
  const removeEdit: TextDocumentEdit = {
    textDocument: { uri: sourceDocument.uri, version: null },
    edits: [
      {
        range: componentRange,
        newText: '',
      },
    ],
  };

  // Edit 2: Add to target (or create file if it doesn't exist)
  let targetDocument = documents.get(targetUri);
  
  if (!targetDocument) {
    // Create new file
    const createFileOp: CreateFile = {
      kind: 'create',
      uri: targetUri,
    };
    
    const addContentEdit: TextDocumentEdit = {
      textDocument: { uri: targetUri, version: null },
      edits: [
        {
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
          newText: componentContent + '\n',
        },
      ],
    };

    workspaceEdit.documentChanges!.push(createFileOp, addContentEdit, removeEdit);
  } else {
    // Append to existing file
    const targetContent = targetDocument.getText();
    const targetLines = targetContent.split('\n');
    const insertPosition: Position = { 
      line: targetLines.length - 1, 
      character: targetLines[targetLines.length - 1].length 
    };

    const addContentEdit: TextDocumentEdit = {
      textDocument: { uri: targetUri, version: null },
      edits: [
        {
          range: { start: insertPosition, end: insertPosition },
          newText: '\n' + componentContent + '\n',
        },
      ],
    };

    workspaceEdit.documentChanges!.push(addContentEdit, removeEdit);
  }

  return workspaceEdit;
}

/**
 * Reorganize imports/references after file restructuring
 */
export async function reorganizeReferences(
  documents: TextDocuments<TextDocument>
): Promise<WorkspaceEdit> {
  const workspaceEdit: WorkspaceEdit = {
    changes: {},
  };

  // This would implement logic to:
  // 1. Find broken references after component moves
  // 2. Update import paths if Alloy supports imports
  // 3. Fix component references across files
  // For now, return empty edit
  
  return workspaceEdit;
}

// Helper functions

/**
 * Rename component in a single document
 */
function renameComponentInDocument(
  document: TextDocument,
  componentType: string,
  oldLabel: string,
  newLabel: string
): TextEdit[] {
  const edits: TextEdit[] = [];
  const content = document.getText();
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Pattern 1: Component definition (componentType "oldLabel" {)
    const definitionPattern = new RegExp(`(\\s*${componentType.replace(/\./g, '\\.')}\\s+)"${oldLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"(\\s*{)`);
    if (definitionPattern.test(line)) {
      const newLine = line.replace(definitionPattern, `$1"${newLabel}"$2`);
      edits.push({
        range: {
          start: { line: i, character: 0 },
          end: { line: i, character: line.length }
        },
        newText: newLine
      });
    }
    
    // Pattern 2: Component references (componentType.oldLabel.field)
    const referencePattern = new RegExp(`(\\b${componentType.replace(/\./g, '\\.')}\\.)"${oldLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"(\\.\\w+)`, 'g');
    if (referencePattern.test(line)) {
      const newLine = line.replace(referencePattern, `$1${newLabel}$2`);
      edits.push({
        range: {
          start: { line: i, character: 0 },
          end: { line: i, character: line.length }
        },
        newText: newLine
      });
    }
  }

  return edits;
}

/**
 * Rename declare block definition
 */
function renameDeclareBlockDefinition(
  document: TextDocument,
  oldName: string,
  newName: string
): TextEdit[] {
  const edits: TextEdit[] = [];
  const content = document.getText();
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const pattern = new RegExp(`(\\s*declare\\s+)"${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"(\\s*{)`);
    
    if (pattern.test(line)) {
      const newLine = line.replace(pattern, `$1"${newName}"$2`);
      edits.push({
        range: {
          start: { line: i, character: 0 },
          end: { line: i, character: line.length }
        },
        newText: newLine
      });
    }
  }

  return edits;
}

/**
 * Rename declare block instantiations
 */
function renameDeclareBlockInstantiations(
  document: TextDocument,
  oldName: string,
  newName: string
): TextEdit[] {
  const edits: TextEdit[] = [];
  const content = document.getText();
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Look for instantiation pattern: oldName "instance" {
    const pattern = new RegExp(`(\\s*)${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s+"[^"]*"\\s*{)`);
    
    if (pattern.test(line)) {
      const newLine = line.replace(pattern, `$1${newName}$2`);
      edits.push({
        range: {
          start: { line: i, character: 0 },
          end: { line: i, character: line.length }
        },
        newText: newLine
      });
    }
  }

  return edits;
}

/**
 * Parse component from content
 */
function parseComponentFromContent(content: string): utils.ParsedComponent | null {
  // Simple parsing - in reality this would use the full parser
  const lines = content.split('\n');
  const firstLine = lines[0];
  
  const match = firstLine.match(/^\s*(\w+(?:\.\w+)*)\s*"([^"]*)"\s*{/);
  if (match) {
    return {
      name: match[1],
      label: match[2],
      range: {
        start: { line: 0, character: 0 },
        end: { line: lines.length - 1, character: lines[lines.length - 1].length }
      },
      startLine: 0,
      endLine: lines.length - 1,
      blocks: [],
      args: {},
    };
  }
  
  return null;
}

/**
 * Generate declare block from component
 */
function generateDeclareBlock(component: utils.ParsedComponent, declareBlockName: string): string {
  // This would analyze the component and create a parameterized declare block
  // For now, return a simple template
  return `declare "${declareBlockName}" {
  argument "label" {
    comment = "Component label"
  }

  ${component.name} "\${argument.label.value}" {
    // Component configuration would be parameterized here
  }
}`;
}

/**
 * Generate component instantiation
 */
function generateComponentInstantiation(component: utils.ParsedComponent, declareBlockName: string): string {
  return `${declareBlockName} "${component.label}" {
  label = "${component.label}"
}`;
}

/**
 * Extract component template from declare block
 */
function extractComponentFromDeclareBlock(declareBlockContent: string): string {
  // This would parse the declare block and extract the component template
  // For now, return simplified content
  return declareBlockContent.replace(/declare\s+"[^"]+"\s*{/, '').replace(/}$/, '').trim();
}

/**
 * Replace instantiations with template
 */
function replaceInstantiationsWithTemplate(
  document: TextDocument,
  declareBlockName: string,
  componentTemplate: string
): TextEdit[] {
  const edits: TextEdit[] = [];
  const content = document.getText();
  const lines = content.split('\n');

  // Find instantiations and replace with expanded template
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const pattern = new RegExp(`^\\s*${declareBlockName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+"([^"]+)"\\s*{`);
    
    if (pattern.test(line)) {
      // Find the end of this instantiation block
      let braceCount = 1;
      let endLine = i;
      
      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j];
        for (const char of nextLine) {
          if (char === '{') braceCount++;
          if (char === '}') braceCount--;
        }
        
        if (braceCount === 0) {
          endLine = j;
          break;
        }
      }
      
      // Replace the instantiation with the expanded template
      edits.push({
        range: {
          start: { line: i, character: 0 },
          end: { line: endLine, character: lines[endLine].length }
        },
        newText: componentTemplate
      });
    }
  }

  return edits;
}