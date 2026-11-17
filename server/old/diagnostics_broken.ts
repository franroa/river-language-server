import {
  Diagnostic,
  DiagnosticSeverity,
  WorkspaceDiagnosticParams,
  TextDocuments,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { requiredAttributes, requiredBlocks, allBlockProperties, allBlockCompletions, allNestedBlockProperties } from "./componentData";
import { getBlockContent } from "./utils";

function getMissingAttributes(
  content: string,
  parentBlockType: string,
): string[] {
  const missing: string[] = [];
  const required = requiredAttributes[parentBlockType] || [];
  if (required.length === 0) {
    return [];
  }

  for (const reqField of required) {
    const fieldRegex = new RegExp(`(^|\\s|\\t)${reqField}\\s*(=|\\{)`);
    if (!fieldRegex.test(content)) {
      missing.push(reqField);
    }
  }
  return missing;
}

function getMissingBlocks(
  content: string,
  parentBlockType: string,
): string[] {
  const missing: string[] = [];
  const required = requiredBlocks[parentBlockType] || [];
  if (required.length === 0) {
    return [];
  }

  for (const reqBlock of required) {
    // Look for block definitions like "endpoint {" or "endpoint   {"
    const blockRegex = new RegExp(`(^|\\n)\\s*${reqBlock}\\s*\\{`, "m");
    if (!blockRegex.test(content)) {
      missing.push(reqBlock);
    }
  }
  return missing;
}

function getMapCommaErrors(
  content: string,
  parentBlockType: string,
  textDocument: TextDocument,
  blockStartOffset: number,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  
  // Get property type information for this component
  const componentProperties = allBlockProperties[parentBlockType] || [];
  
  // Create a map of property name -> type for quick lookup
  const propertyTypes: Record<string, string> = {};
  for (const prop of componentProperties) {
    if (prop.detail && prop.label) {
      propertyTypes[prop.label] = prop.detail;
    }
  }
  
  // Use regex to find all property assignments that start with map values
  const mapAssignmentRegex = /^\s*([a-zA-Z0-9_]+)\s*=\s*\{/gm;
  let match;
  
  while ((match = mapAssignmentRegex.exec(content)) !== null) {
    const propertyName = match[1];
    const propertyType = propertyTypes[propertyName];
    
    // Check if this property has a map type
    if (propertyType && propertyType.includes('map(')) {
      // Find the end of this map assignment by looking for the closing brace
      const mapStart = match.index + match[0].length - 1; // Position of opening brace
      const mapEnd = findMapAssignmentEnd(content, mapStart);
      
      if (mapEnd !== -1) {
        // Extract the content inside the map braces
        const mapContent = content.substring(mapStart + 1, mapEnd);
        
        // Check each line within the map for missing commas
        const mapErrors = validateMapContentCommas(
          mapContent, 
          propertyName, 
          blockStartOffset + mapStart + 1,
          textDocument
        );
        diagnostics.push(...mapErrors);
      }
    }
  }
  
   return diagnostics;
}

export async function getWorkspaceDiagnostics(
  documents: TextDocuments<TextDocument>,
): Promise<{ uri: string; diagnostics: Diagnostic[] }[]> {
  const allComponents: Map<string, { uri: string; line: number; character: number }> = new Map();
  const workspaceDiagnostics: { uri: string; diagnostics: Diagnostic[] }[] = [];

  // Scan all open documents
  for (const document of documents.all()) {
    const uri = document.uri;
    const text = document.getText();
    const fileDiagnostics: Diagnostic[] = [];

    // Find all component block declarations in this document
    const componentBlockRegex = /^\s*([a-zA-Z0-9_.]+)\s+"([^"]*)"\s*\{/gm;
    let match;

    while ((match = componentBlockRegex.exec(text)) !== null) {
      const componentType = match[1];
      const componentLabel = match[2];
      const componentKey = `${componentType}:"${componentLabel}"`;  // Unique key: type + label

      const position = document.positionAt(match.index);
      const existingComponent = allComponents.get(componentKey);

      if (existingComponent) {
        // This is a duplicate across workspace
        const blockHeader = match[0];
        const leadingWhitespaceLength = blockHeader.match(/^\s*/)?.[0].length || 0;
        const codeStartIndex = match.index + leadingWhitespaceLength;

        const startPos = document.positionAt(codeStartIndex);
        const endPos = document.positionAt(match.index + blockHeader.trimEnd().length);

        fileDiagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: { start: startPos, end: endPos },
          message: `Duplicate component block "${componentType}" with label "${componentLabel}" found across workspace. First occurrence in ${existingComponent.uri} at line ${existingComponent.line + 1}.`,
          source: "Alloy Linter",
          code: "workspace-duplicate-component-block",
          data: {
            componentType,
            componentLabel,
            firstOccurrenceUri: existingComponent.uri,
            firstOccurrenceLine: existingComponent.line,
            firstOccurrenceCharacter: existingComponent.character,
            duplicateUri: uri,
            duplicateLine: position.line,
            duplicateCharacter: position.character
          }
        });
      } else {
        // First occurrence of this component+label combination
        allComponents.set(componentKey, {
          uri,
          line: position.line,
          character: position.character
        });
      }
    }

    if (fileDiagnostics.length > 0) {
      workspaceDiagnostics.push({
        uri,
        diagnostics: fileDiagnostics
      });
    }
  }

  return workspaceDiagnostics;
}

export async function getWorkspaceDiagnostics(
  documents: TextDocuments<TextDocument>,
): Promise<{ uri: string; diagnostics: Diagnostic[] }[]> {
  const allComponents: Map<string, { uri: string; line: number; character: number }> = new Map();
  const workspaceDiagnostics: { uri: string; diagnostics: Diagnostic[] }[] = [];

  // Scan all open documents
  for (const document of documents.all()) {
    const uri = document.uri;
    const text = document.getText();
    const fileDiagnostics: Diagnostic[] = [];

    // Find all component block declarations in this document
    const componentBlockRegex = /^\s*([a-zA-Z0-9_.]+)\s+"([^"]*)"\s*\{/gm;
    let match;

    while ((match = componentBlockRegex.exec(text)) !== null) {
      const componentType = match[1];
      const componentLabel = match[2];
      const componentKey = `${componentType}:"${componentLabel}"`;  // Unique key: type + label

      const position = document.positionAt(match.index);
      const existingComponent = allComponents.get(componentKey);

      if (existingComponent) {
        // This is a duplicate across workspace
        const blockHeader = match[0];
        const leadingWhitespaceLength = blockHeader.match(/^\s*/)?.[0].length || 0;
        const codeStartIndex = match.index + leadingWhitespaceLength;

        const startPos = document.positionAt(codeStartIndex);
        const endPos = document.positionAt(match.index + blockHeader.trimEnd().length);

        fileDiagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: { start: startPos, end: endPos },
          message: `Duplicate component block "${componentType}" with label "${componentLabel}" found across workspace. First occurrence in ${existingComponent.uri} at line ${existingComponent.line + 1}.`,
          source: "Alloy Linter",
          code: "workspace-duplicate-component-block",
          data: {
            componentType,
            componentLabel,
            firstOccurrenceUri: existingComponent.uri,
            firstOccurrenceLine: existingComponent.line,
            firstOccurrenceCharacter: existingComponent.character,
            duplicateUri: uri,
            duplicateLine: position.line,
            duplicateCharacter: position.character
          }
        });
      } else {
        // First occurrence of this component+label combination
        allComponents.set(componentKey, {
          uri,
          line: position.line,
          character: position.character
        });
      }
    }

    if (fileDiagnostics.length > 0) {
      workspaceDiagnostics.push({
        uri,
        diagnostics: fileDiagnostics
      });
    }
  }

  return workspaceDiagnostics;
}

    
    // Check if this line contains a property assignment (key = value format)
    const propertyAssignmentMatch = trimmedLine.match(/^\s*([a-zA-Z0-9_]+)\s*=\s*(.+)$/);
    if (propertyAssignmentMatch) {
      const propertyKey = propertyAssignmentMatch[1];
      
      // Check if this line should end with a comma
      // In Alloy maps, property assignments should end with commas (except optionally the last one)
      const shouldHaveComma = !trimmedLine.endsWith(',');
      
      // For now, require all properties to have commas (safer and more consistent)
      if (shouldHaveComma) {
        const lineStart = currentOffset;
        const lineEnd = currentOffset + line.length;
        
        const startPos = textDocument.positionAt(lineStart);
        const endPos = textDocument.positionAt(lineEnd);
        
        // Position where comma should be inserted (end of line)
        const commaInsertPos = textDocument.positionAt(lineEnd);
        
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: { start: startPos, end: endPos },
          message: `Map property "${propertyKey}" in "${mapPropertyName}" must end with a comma.`,
          source: "Alloy Linter",
          code: "missing-map-property-comma",
          data: {
            mapPropertyName,
            propertyKey,
            commaInsertPosition: {
              line: commaInsertPos.line,
              character: commaInsertPos.character
            }
          }
        });
      }
    }
    
    currentOffset += line.length + 1; // +1 for newline
  }
  
  return diagnostics;
}

function validateMapContentCommas(
  mapContent: string,
  mapPropertyName: string,
  mapContentStartOffset: number,
  textDocument: TextDocument
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = mapContent.split('\n');

  let currentOffset = mapContentStartOffset;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Skip empty lines and comments
    if (!trimmedLine || trimmedLine.startsWith('//')) {
      currentOffset += line.length + 1; // +1 for newline
      continue;
    }

    // Check if this line contains a property assignment (key = value format)
    const propertyAssignmentMatch = trimmedLine.match(/^\s*([a-zA-Z0-9_]+)\s*=\s*(.+)$/);
    if (propertyAssignmentMatch) {
      const propertyKey = propertyAssignmentMatch[1];

      // Check if this line should end with a comma
      // In Alloy maps, property assignments should end with commas (except optionally the last one)
      const shouldHaveComma = !trimmedLine.endsWith(',');

      // For now, require all properties to have commas (safer and more consistent)
      if (shouldHaveComma) {
        const lineStart = currentOffset;
        const lineEnd = currentOffset + line.length;

        const startPos = textDocument.positionAt(lineStart);
        const endPos = textDocument.positionAt(lineEnd);

        // Position where comma should be inserted (end of line)
        const commaInsertPos = textDocument.positionAt(lineEnd);

        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: { start: startPos, end: endPos },
          message: `Map property "${propertyKey}" in "${mapPropertyName}" must end with a comma.`,
          source: "Alloy Linter",
          code: "missing-map-property-comma",
          data: {
            mapPropertyName,
            propertyKey,
            commaInsertPosition: {
              line: commaInsertPos.line,
              character: commaInsertPos.character
            }
          }
        });
      }
    }

    currentOffset += line.length + 1; // +1 for newline
  }

  return diagnostics;
}

function findMapAssignmentEnd(content: string, startPos: number): number {
  let braceLevel = 1;
  let inString = false;
  let inComment = false;
  
  for (let i = startPos + 1; i < content.length; i++) {
    const char = content[i];
    const prevChar = content[i - 1];
    
    if (char === '"' && prevChar !== '\\') {
      inString = !inString;
    }
    
    if (!inString) {
      if (char === '/' && content[i + 1] === '/') {
        inComment = true;
      }
      
      if (inComment) {
        if (char === '\n') {
          inComment = false;
        }
        continue;
      }
      
      if (char === '{') {
        braceLevel++;
      } else if (char === '}') {
        braceLevel--;
        if (braceLevel === 0) {
          return i;
        }
      }
    }
  }
  
  return -1; // Not found
}

function getUnknownBlockErrors(
  content: string,
  parentBlockType: string,
  textDocument: TextDocument,
  blockStartOffset: number,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  
  // Get valid block definitions for this component type
  const validBlocks = allBlockCompletions[parentBlockType] || [];
  const validBlockNames = new Set(validBlocks.map(block => block.label));
  
  // Get valid property definitions to avoid false positives
  const validProperties = allBlockProperties[parentBlockType] || [];
  const validPropertyNames = new Set(validProperties.map(prop => prop.label));
  
  // Find traditional block declarations: "blockname {"
  const traditionalBlockRegex = /^\s*([a-zA-Z0-9_.]+)\s*\{/gm;
  let match;
  
  while ((match = traditionalBlockRegex.exec(content)) !== null) {
    const blockName = match[1];
    
    // Skip if this is a valid block for this component type
    if (validBlockNames.has(blockName)) {
      continue;
    }
    
    // Skip if this is a nested component declaration (contains a dot)
    if (blockName.includes('.')) {
      continue;
    }
    
    // This is an unknown/invalid traditional block
    const blockStart = blockStartOffset + match.index;
    const blockEnd = blockStart + match[0].length;
    
    const startPos = textDocument.positionAt(blockStart);
    const endPos = textDocument.positionAt(blockEnd);
    
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: { start: startPos, end: endPos },
      message: `Unknown block "${blockName}" for component type "${parentBlockType}". Valid blocks are: ${Array.from(validBlockNames).join(', ')}.`,
      source: "Alloy Linter",
      code: "unknown-block",
      data: {
        componentType: parentBlockType,
        unknownBlock: blockName,
        validBlocks: Array.from(validBlockNames)
      }
    });
  }
  
  // Find assignment-style declarations: "name = {}"
  // Only validate these if they're NOT known properties
  const assignmentBlockRegex = /^\s*([a-zA-Z0-9_.]+)\s*=\s*\{\s*\}/gm;
  
  while ((match = assignmentBlockRegex.exec(content)) !== null) {
    const blockName = match[1];
    
    // Skip if this is a known property (like external_labels)
    if (validPropertyNames.has(blockName)) {
      continue;
    }
    
    // Skip if this is actually a valid block name
    if (validBlockNames.has(blockName)) {
      continue;
    }
    
    // Skip if this is a nested component declaration (contains a dot)
    if (blockName.includes('.')) {
      continue;
    }
    
    // This is an unknown assignment-style block
    const blockStart = blockStartOffset + match.index;
    const blockEnd = blockStart + match[0].length;
    
    const startPos = textDocument.positionAt(blockStart);
    const endPos = textDocument.positionAt(blockEnd);
    
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: { start: startPos, end: endPos },
      message: `Unknown block "${blockName}" for component type "${parentBlockType}". Valid blocks are: ${Array.from(validBlockNames).join(', ')}.`,
      source: "Alloy Linter",
      code: "unknown-block",
      data: {
        componentType: parentBlockType,
        unknownBlock: blockName,
        validBlocks: Array.from(validBlockNames)
      }
    });
  }
  
  return diagnostics;
}

function getUnknownNestedPropertyErrors(
  content: string,
  parentBlockType: string,
  textDocument: TextDocument,
  blockStartOffset: number,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  
  // Get nested block properties for this component type
  const nestedBlockProperties = allNestedBlockProperties[parentBlockType] || {};
  
  // Find all block declarations
  const blockRegex = /^\s*([a-zA-Z0-9_.]+)\s*\{/gm;
  let blockMatch;
  
  while ((blockMatch = blockRegex.exec(content)) !== null) {
    const blockType = blockMatch[1];
    const blockStartIndex = blockMatch.index + blockMatch[0].length - 1; // Position of opening brace
    const blockEndIndex = findMapAssignmentEnd(content, blockStartIndex);
    
    if (blockEndIndex === -1) continue;
    
    // Get the content inside this nested block
    const nestedBlockContent = content.substring(blockStartIndex + 1, blockEndIndex);
    const validPropertiesForBlock = nestedBlockProperties[blockType] || [];
    const validPropertyNames = new Set(validPropertiesForBlock.map(prop => prop.label));
    
    // Skip validation if no properties are defined for this block type
    if (validPropertiesForBlock.length === 0) continue;
    
    // Find all property assignments within this nested block
    const propertyRegex = /^\s*([a-zA-Z0-9_.]+)\s*=\s*[^{]/gm;
    let propertyMatch;
    
    while ((propertyMatch = propertyRegex.exec(nestedBlockContent)) !== null) {
      const propertyName = propertyMatch[1];
      
      if (!validPropertyNames.has(propertyName)) {
        // This is an unknown property
        const propertyStart = blockStartOffset + blockStartIndex + 1 + propertyMatch.index;
        const propertyEnd = propertyStart + propertyMatch[0].length;
        
        const startPos = textDocument.positionAt(propertyStart);
        const endPos = textDocument.positionAt(propertyEnd);
        
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: { start: startPos, end: endPos },
          message: `Unknown property "${propertyName}" in "${blockType}" block for component "${parentBlockType}". Valid properties are: ${Array.from(validPropertyNames).join(', ')}.`,
          source: "Alloy Linter",
          code: "unknown-nested-property",
          data: {
            componentType: parentBlockType,
            blockType: blockType,
            unknownProperty: propertyName,
            validProperties: Array.from(validPropertyNames)
          }
        });
      }
    }
  }
  
  return diagnostics;
}

export async function getDocumentDiagnostics(
  textDocument: TextDocument,
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  const text = textDocument.getText();
  
  // First, check for duplicate component blocks across the entire document
  const duplicateErrors = getDuplicateBlockErrors(text, textDocument);
  diagnostics.push(...duplicateErrors);

  const componentBlockRegex = /^\s*([a-zA-Z0-9_.]+)(?:\s+"[^"]*")?\s*\{/gm;
  let match;

  while ((match = componentBlockRegex.exec(text)) !== null) {
    const componentType = match[1];
    const blockHeader = match[0];
    const blockStartIndex = text.indexOf("{", match.index);

    if (blockStartIndex !== -1) {
      const blockResult = getBlockContent(text, blockStartIndex + 1);
      if (blockResult) {
        const missingAttributes = getMissingAttributes(
          blockResult.content,
          componentType,
        );

        for (const missingAttr of missingAttributes) {
          const leadingWhitespaceLength =
            blockHeader.match(/^\s*/)?.[0].length || 0;

          const codeStartIndex = match.index + leadingWhitespaceLength;

          const startPos = textDocument.positionAt(codeStartIndex);
          const endPos = textDocument.positionAt(
            match.index + blockHeader.trimEnd().length,
          );

          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: { start: startPos, end: endPos },
            message: `El bloque "${componentType}" no tiene el atributo requerido "${missingAttr}".`,
            source: "Alloy Linter",
            code: "missing-required-attribute",
            data: {
              componentType,
              missingAttribute: missingAttr,
            },
          });
        }

        const missingBlocks = getMissingBlocks(
          blockResult.content,
          componentType,
        );

        for (const missingBlock of missingBlocks) {
          const leadingWhitespaceLength =
            blockHeader.match(/^\s*/)?.[0].length || 0;

          const codeStartIndex = match.index + leadingWhitespaceLength;

          const startPos = textDocument.positionAt(codeStartIndex);
          const endPos = textDocument.positionAt(
            match.index + blockHeader.trimEnd().length,
          );

          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: { start: startPos, end: endPos },
            message: `El bloque "${componentType}" no tiene el bloque requerido "${missingBlock}".`,
            source: "Alloy Linter",
            code: "missing-required-block",
            data: {
              componentType,
              missingBlock: missingBlock,
            },
          });
         }

        // Check for map comma errors
        const mapCommaErrors = getMapCommaErrors(
          blockResult.content,
          componentType,
          textDocument,
          blockStartIndex + 1,
        );
        diagnostics.push(...mapCommaErrors);

        // Check for unknown/invalid blocks
        const unknownBlockErrors = getUnknownBlockErrors(
          blockResult.content,
          componentType,
          textDocument,
          blockStartIndex + 1,
        );
        diagnostics.push(...unknownBlockErrors);

        // Check for unknown properties in nested blocks
        const unknownNestedPropertyErrors = getUnknownNestedPropertyErrors(
          blockResult.content,
          componentType,
          textDocument,
          blockStartIndex + 1,
        );
        diagnostics.push(...unknownNestedPropertyErrors);
      } else {
        const leadingWhitespaceLength =
          blockHeader.match(/^\s*/)?.[0].length || 0;
        const codeStartIndex = match.index + leadingWhitespaceLength;
        const startPos = textDocument.positionAt(codeStartIndex);
        const endPos = textDocument.positionAt(
          match.index + blockHeader.trimEnd().length,
        );

        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: { start: startPos, end: endPos },
          message: `Bloque "${componentType}" no cerrado. Se esperaba '}'.`,
          source: "Alloy Linter",
          code: "unclosed-block",
        });
      }
    }
  }
  return diagnostics;
}
function getDuplicateBlockErrors(
  text: string,
  textDocument: TextDocument,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const seenComponents: Map<string, { match: RegExpExecArray, index: number }> = new Map();
  
  // Find all component block declarations in the document
  const componentBlockRegex = /^\s*([a-zA-Z0-9_.]+)\s+"([^"]*)"\s*\{/gm;
  let match;
  let matchIndex = 0;

  while ((match = componentBlockRegex.exec(text)) !== null) {
    const componentType = match[1];
    const componentLabel = match[2];
    const componentKey = `${componentType}:"${componentLabel}"`;  // Unique key: type + label
    
    matchIndex++;
    
    if (seenComponents.has(componentKey)) {
      // This is a duplicate!
      const firstOccurrence = seenComponents.get(componentKey)!;
      
      // Create diagnostic for the current (duplicate) block
      const blockHeader = match[0];
      const leadingWhitespaceLength = blockHeader.match(/^\s*/)?.[0].length || 0;
      const codeStartIndex = match.index + leadingWhitespaceLength;
      
      const startPos = textDocument.positionAt(codeStartIndex);
      const endPos = textDocument.positionAt(match.index + blockHeader.trimEnd().length);
      
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: { start: startPos, end: endPos },
        message: `Duplicate component block "${componentType}" with label "${componentLabel}". First occurrence was at line ${textDocument.positionAt(firstOccurrence.match.index).line + 1}.`,
        source: "Alloy Linter",
        code: "duplicate-component-block",
        data: {
          componentType,
          componentLabel,
          firstOccurrenceIndex: firstOccurrence.match.index,
          duplicateIndex: match.index
        }
      });
      
    } else {
      // First occurrence of this component+label combination
      seenComponents.set(componentKey, { match, index: matchIndex });
    }
  }
  
  return diagnostics;
}
