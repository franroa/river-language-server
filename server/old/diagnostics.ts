import {
  Diagnostic,
  DiagnosticSeverity,
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

// For now, define recommended attributes manually until scraper is updated
// These are properties that appear in usage examples but are NOT required in docs
// Example: properties that are commonly used in examples but marked as optional in the spec
const recommendedAttributes: Record<string, Record<string, string[]>> = {
  "prometheus.scrape": {
    // Example: if basic_auth fields appear in usage examples but are optional
    "basic_auth": ["username", "password"]
  },
  "loki.write": {
    "basic_auth": ["username", "password"]
  },

};

function getMissingRecommendedProperties(
  content: string,
  parentBlockType: string,
): Array<{ blockType: string; properties: string[] }> {
  const missing: Array<{ blockType: string; properties: string[] }> = [];
  const recommended = recommendedAttributes[parentBlockType] || {};
  
  if (Object.keys(recommended).length === 0) {
    return [];
  }

  for (const [blockType, properties] of Object.entries(recommended)) {
    // Check if the block exists
    const blockRegex = new RegExp(`(^|\\n)\\s*${blockType}\\s*\\{`, "m");
    if (blockRegex.test(content)) {
      // Block exists, check for recommended properties within it
      const missingProps: string[] = [];
      
      for (const prop of properties) {
        const propRegex = new RegExp(`\\b${prop}\\s*(=|\\{)`, "m");
        if (!propRegex.test(content)) {
          missingProps.push(prop);
        }
      }
      
      if (missingProps.length > 0) {
        missing.push({ blockType, properties: missingProps });
      }
    }
  }
  return missing;
}

async function processDeclareBlockContent(
  declareContent: string,
  textDocument: TextDocument,
  declareContentOffset: number,
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  
  // Find component blocks inside the declare block
  const componentBlockRegex = /^\s*([a-zA-Z0-9_.]+)(?:\s+"[^"]*")?\s*\{/gm;
  let match;

  while ((match = componentBlockRegex.exec(declareContent)) !== null) {
    const componentType = match[1];
    const blockHeader = match[0];
    const relativeBlockStartIndex = declareContent.indexOf("{", match.index);
    
    if (relativeBlockStartIndex !== -1) {
      // Calculate absolute positions for diagnostics (needed in both branches)
      const absoluteMatchIndex = declareContentOffset + match.index;
      const absoluteBlockStartIndex = declareContentOffset + relativeBlockStartIndex;
      
      const blockResult = getBlockContent(declareContent, relativeBlockStartIndex + 1);
      if (blockResult) {
        
        const missingAttributes = getMissingAttributes(
          blockResult.content,
          componentType,
        );

        for (const missingAttr of missingAttributes) {
          const leadingWhitespaceLength =
            blockHeader.match(/^\s*/)?.[0].length || 0;

          const codeStartIndex = absoluteMatchIndex + leadingWhitespaceLength;

          const startPos = textDocument.positionAt(codeStartIndex);
          const endPos = textDocument.positionAt(
            absoluteMatchIndex + blockHeader.trimEnd().length,
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

          const codeStartIndex = absoluteMatchIndex + leadingWhitespaceLength;

          const startPos = textDocument.positionAt(codeStartIndex);
          const endPos = textDocument.positionAt(
            absoluteMatchIndex + blockHeader.trimEnd().length,
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
          absoluteBlockStartIndex + 1,
        );
        diagnostics.push(...mapCommaErrors);

        // Check for unknown/invalid blocks
        const unknownBlockErrors = getUnknownBlockErrors(
          blockResult.content,
          componentType,
          textDocument,
          absoluteBlockStartIndex + 1,
        );
        diagnostics.push(...unknownBlockErrors);

        // Check for unknown properties in nested blocks
        const unknownNestedPropertyErrors = getUnknownNestedPropertyErrors(
          blockResult.content,
          componentType,
          textDocument,
          absoluteBlockStartIndex + 1,
        );
        diagnostics.push(...unknownNestedPropertyErrors);

        // Check for missing recommended properties (show as warnings)
        const missingRecommendedProps = getMissingRecommendedProperties(
          blockResult.content,
          componentType,
        );

        for (const missing of missingRecommendedProps) {
          const leadingWhitespaceLength =
            blockHeader.match(/^\s*/)?.[0].length || 0;

          const codeStartIndex = absoluteMatchIndex + leadingWhitespaceLength;

          const startPos = textDocument.positionAt(codeStartIndex);
          const endPos = textDocument.positionAt(
            absoluteMatchIndex + blockHeader.trimEnd().length,
          );

          diagnostics.push({
            severity: DiagnosticSeverity.Warning,  // Warning instead of Error
            range: { start: startPos, end: endPos },
            message: `El bloque "${missing.blockType}" en "${componentType}" tiene propiedades recomendadas faltantes: ${missing.properties.join(', ')}.`,
            source: "Alloy Linter",
            code: "missing-recommended-property",
            data: {
              componentType,
              blockType: missing.blockType,
              missingProperties: missing.properties,
            },
          });
        }
      } else {
        // Handle unclosed block in declare context
        const leadingWhitespaceLength = blockHeader.match(/^\s*/)?.[0].length || 0;
        const codeStartIndex = absoluteMatchIndex + leadingWhitespaceLength;
        const startPos = textDocument.positionAt(codeStartIndex);
        const endPos = textDocument.positionAt(
          absoluteMatchIndex + blockHeader.trimEnd().length,
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

  // Create a map of property name -> type for quick lookup
  const propertyTypes: Record<string, string> = {};
  for (const prop of validProperties) {
    if (prop.detail && prop.label) {
      propertyTypes[prop.label] = prop.detail;
    }
  }

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

    // Check if this might be an explicit block found in code examples
    // For certain common blocks that appear in usage examples, be more lenient
    const commonBlocks = ['wal', 'queue_config', 'metadata_config', 'scrape_config'];
    if (commonBlocks.includes(blockName)) {
      continue;
    }

    // Check if this is a map property assignment (skip validation for map contents)
    const currentLine = content.substring(match.index, content.indexOf('\n', match.index) || content.length);
    const mapAssignmentRegex = /^\s*([a-zA-Z0-9_.]+)\s*=\s*\{/;
    const mapMatch = currentLine.match(mapAssignmentRegex);
    if (mapMatch) {
      const propertyName = mapMatch[1];
      const propertyType = propertyTypes[propertyName];
      if (propertyType && (propertyType.includes('map(') || propertyType.includes('object') || propertyType.startsWith('map('))) {
        continue;
      }
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

    // Check if this might be an explicit block found in code examples
    // For now, we'll be more lenient and not flag these as errors
    // The scraper should have picked up explicit blocks from code examples
    const propertyType = propertyTypes[blockName];
    if (propertyType && (propertyType.includes('map(') || propertyType.includes('object'))) {
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

  // Get component properties to check for map types
  const componentProperties = allBlockProperties[parentBlockType] || [];
  const propertyTypes: Record<string, string> = {};
  for (const prop of componentProperties) {
    if (prop.detail && prop.label) {
      propertyTypes[prop.label] = prop.detail;
    }
  }

  // Find all block declarations
  const blockRegex = /^\s*([a-zA-Z0-9_.]+)\s*\{/gm;
  let blockMatch;

  while ((blockMatch = blockRegex.exec(content)) !== null) {
    const blockType = blockMatch[1];
    const blockStartIndex = blockMatch.index + blockMatch[0].length - 1; // Position of opening brace
    const blockEndIndex = findMapAssignmentEnd(content, blockStartIndex);

    if (blockEndIndex === -1) continue;

    // Check if this is a map property assignment (property = { ... })
    // Look at the current line to see if it contains an assignment
    const currentLine = content.substring(blockMatch.index, content.indexOf('\n', blockMatch.index) || content.length);
    const mapAssignmentRegex = /^\s*([a-zA-Z0-9_.]+)\s*=\s*\{/;
    const mapMatch = currentLine.match(mapAssignmentRegex);

    if (mapMatch) {
      const propertyName = mapMatch[1];
      const propertyType = propertyTypes[propertyName];

      // If this is a map/object property, skip validation since map values are arbitrary
      if (propertyType && (propertyType.includes('map(') || propertyType.includes('object') || propertyType.startsWith('map('))) {
        continue;
      }
    }

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

  // Check for duplicate component blocks within the document only
  // Cross-file duplicates are handled by workspace diagnostics to avoid double-reporting
  const duplicateErrors = getDuplicateBlockErrors(text, textDocument);
  diagnostics.push(...duplicateErrors);

  const componentBlockRegex = /^\s*([a-zA-Z0-9_.]+)(?:\s+"[^"]*")?\s*\{/gm;
  let match;

  while ((match = componentBlockRegex.exec(text)) !== null) {
    const componentType = match[1];
    const blockHeader = match[0];
    const blockStartIndex = text.indexOf("{", match.index);

    // Skip declare blocks - they are wrappers, not components to validate
    if (componentType === "declare") {
      if (blockStartIndex !== -1) {
        const blockResult = getBlockContent(text, blockStartIndex + 1);
        if (blockResult) {
          // Process components inside the declare block
          const declareComponentDiagnostics = await processDeclareBlockContent(
            blockResult.content,
            textDocument,
            blockStartIndex + 1
          );
          diagnostics.push(...declareComponentDiagnostics);
        }
      }
      continue; // Skip the rest of the processing for declare blocks
    }

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

        // Check for missing recommended properties (show as warnings)
        const missingRecommendedProps = getMissingRecommendedProperties(
          blockResult.content,
          componentType,
        );

        for (const missing of missingRecommendedProps) {
          const leadingWhitespaceLength =
            blockHeader.match(/^\s*/)?.[0].length || 0;

          const codeStartIndex = match.index + leadingWhitespaceLength;

          const startPos = textDocument.positionAt(codeStartIndex);
          const endPos = textDocument.positionAt(
            match.index + blockHeader.trimEnd().length,
          );

          diagnostics.push({
            severity: DiagnosticSeverity.Warning,  // Warning instead of Error
            range: { start: startPos, end: endPos },
            message: `El bloque "${missing.blockType}" en "${componentType}" tiene propiedades recomendadas faltantes: ${missing.properties.join(', ')}.`,
            source: "Alloy Linter",
            code: "missing-recommended-property",
            data: {
              componentType,
              blockType: missing.blockType,
              missingProperties: missing.properties,
            },
          });
        }
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
  const seenComponents: Map<string, Array<{ match: RegExpExecArray, index: number }>> = new Map();

  // Find all component block declarations in the document
  const componentBlockRegex = /^\s*([a-zA-Z0-9_.]+)\s+"([^"]*)"\s*\{/gm;
  let match;
  let matchIndex = 0;

  // First pass: collect all occurrences
  while ((match = componentBlockRegex.exec(text)) !== null) {
    const componentType = match[1];
    const componentLabel = match[2];
    const componentKey = `${componentType}:"${componentLabel}"`;  // Unique key: type + label

    matchIndex++;

    if (!seenComponents.has(componentKey)) {
      seenComponents.set(componentKey, []);
    }
    seenComponents.get(componentKey)!.push({ match, index: matchIndex });
  }

  // Second pass: create diagnostics for duplicates (only if there are multiple occurrences)
  for (const [componentKey, occurrences] of seenComponents) {
    if (occurrences.length > 1) {
      const [componentType, componentLabel] = componentKey.split(':"');

      // Create diagnostics for ALL occurrences of this duplicate
      for (const occurrence of occurrences) {
        const blockHeader = occurrence.match[0];
        const leadingWhitespaceLength = blockHeader.match(/^\s*/)?.[0].length || 0;
        const codeStartIndex = occurrence.match.index + leadingWhitespaceLength;

        const startPos = textDocument.positionAt(codeStartIndex);
        const endPos = textDocument.positionAt(occurrence.match.index + blockHeader.trimEnd().length);

        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: { start: startPos, end: endPos },
          message: `Duplicate component block "${componentType}" with label "${componentLabel}". Found ${occurrences.length} occurrences in this file.`,
          source: "Alloy Linter",
          code: "duplicate-component-block",
          data: {
            componentType,
            componentLabel,
            occurrences: occurrences.length,
            occurrenceIndex: occurrence.index
          }
        });
      }
    }
  }

  return diagnostics;
}

export async function getWorkspaceDiagnostics(
  documents: TextDocuments<TextDocument>,
): Promise<{ uri: string; kind: "full"; version: number | null; items: Diagnostic[] }[]> {
  // This function now scans the folder of opened files, not just opened documents
  return await getFolderDiagnostics(documents);
}

async function getFolderDiagnostics(
  documents: TextDocuments<TextDocument>,
): Promise<{ uri: string; kind: "full"; version: number | null; items: Diagnostic[] }[]> {
  const path = require('path');
  const fs = require('fs').promises;
  const { TextDocument } = require('vscode-languageserver-textdocument');
  
  const allComponents: Map<string, Array<{ uri: string; line: number; character: number; match: RegExpExecArray }>> = new Map();
  const workspaceDiagnostics: { uri: string; kind: "full"; version: number | null; items: Diagnostic[] }[] = [];
  const processedUris = new Set<string>();

  // Get all unique folder paths from opened documents
  const folderPaths = new Set<string>();
  for (const document of documents.all()) {
    if (document.uri.startsWith('file://')) {
      const filePath = decodeURIComponent(document.uri.replace('file://', ''));
      const folderPath = path.dirname(filePath);
      folderPaths.add(folderPath);
    }
  }

  // For each folder, scan all .alloy files
  for (const folderPath of folderPaths) {
    try {
      const files = await fs.readdir(folderPath);
        const alloyFiles = files.filter((file: string) => file.endsWith('.alloy'));

      for (const fileName of alloyFiles) {
        const filePath = path.join(folderPath, fileName);
        const uri = `file://${filePath}`;

        // Skip if already processed
        if (processedUris.has(uri)) continue;
        processedUris.add(uri);

        let text: string;
        let document: any;

        // Check if document is already open
        const openDocument = documents.get(uri);
        if (openDocument) {
          text = openDocument.getText();
          document = openDocument;
        } else {
          // Read file from filesystem
          try {
            text = await fs.readFile(filePath, 'utf8');
            // Create a temporary TextDocument for position calculations
            document = TextDocument.create(uri, 'alloy', 1, text);
          } catch (readError) {
            console.error(`Error reading file ${filePath}:`, readError);
            continue;
          }
        }

        // Find all component block declarations in this document
        const componentBlockRegex = /^\s*([a-zA-Z0-9_.]+)\s+"([^"]*)"\s*\{/gm;
        let match;

        while ((match = componentBlockRegex.exec(text)) !== null) {
          const componentType = match[1];
          const componentLabel = match[2];
          const componentKey = `${componentType}:"${componentLabel}"`;

          if (!allComponents.has(componentKey)) {
            allComponents.set(componentKey, []);
          }
          allComponents.get(componentKey)!.push({
            uri,
            line: document.positionAt(match.index).line,
            character: document.positionAt(match.index).character,
            match
          });
        }
      }
    } catch (error) {
      console.error(`Error reading folder ${folderPath}:`, error);
    }
  }

  // Second pass: create diagnostics for all processed files
  for (const uri of processedUris) {
    const fileDiagnostics: Diagnostic[] = [];
    let document: any;
    let text: string;

    // Get document (either open or read from file)
    const openDocument = documents.get(uri);
    if (openDocument) {
      text = openDocument.getText();
      document = openDocument;
    } else {
      try {
        const filePath = decodeURIComponent(uri.replace('file://', ''));
        text = await fs.readFile(filePath, 'utf8');
        document = TextDocument.create(uri, 'alloy', 1, text);
      } catch (error) {
        console.error(`Error reading file for diagnostics ${uri}:`, error);
        continue;
      }
    }

    // Find all component block declarations in this document
    const componentBlockRegex = /^\s*([a-zA-Z0-9_.]+)\s+"([^"]*)"\s*\{/gm;
    let match;

    while ((match = componentBlockRegex.exec(text)) !== null) {
      const componentType = match[1];
      const componentLabel = match[2];
      const componentKey = `${componentType}:"${componentLabel}"`;

      const occurrences = allComponents.get(componentKey);
      if (occurrences && occurrences.length > 1) {
        // This component has duplicates in the folder
        const blockHeader = match[0];
        const leadingWhitespaceLength = blockHeader.match(/^\s*/)?.[0].length || 0;
        const codeStartIndex = match.index + leadingWhitespaceLength;

        const startPos = document.positionAt(codeStartIndex);
        const endPos = document.positionAt(match.index + blockHeader.trimEnd().length);

        // Find other occurrences for the message
        const otherOccurrences = occurrences.filter(occ => occ.uri !== uri);
        const occurrenceMessages = otherOccurrences.map(occ => {
          const otherFilePath = decodeURIComponent(occ.uri.replace('file://', ''));
          const fileName = path.basename(otherFilePath);
          return `${fileName} at line ${occ.line + 1}`;
        }).join(', ');

        fileDiagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: { start: startPos, end: endPos },
          message: `Duplicate component block "${componentType}" with label "${componentLabel}" found in folder. Other occurrences: ${occurrenceMessages}.`,
          source: "Alloy Linter",
          code: "folder-duplicate-component-block",
          data: {
            componentType,
            componentLabel,
            occurrences: occurrences.length,
            otherOccurrences: otherOccurrences
          }
        });
      }
    }

    // Include all files in the results
    workspaceDiagnostics.push({
      uri,
      kind: "full",
      version: null,
      items: fileDiagnostics
    });
  }

  return workspaceDiagnostics;
}