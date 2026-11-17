import {
  SelectionRange,
  SelectionRangeParams,
  TextDocuments,
  Range,
  Position,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as utils from "./utils";

/**
 * Provide selection ranges for smart text expansion
 * This allows users to expand selections to logical boundaries in Alloy configs
 */
export function provideSelectionRanges(
  params: SelectionRangeParams,
  documents: TextDocuments<TextDocument>
): SelectionRange[] {
  try {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return [];
    }

    const selectionRanges: SelectionRange[] = [];

    for (const position of params.positions) {
      try {
        const ranges = buildSelectionRangeHierarchy(document, position);
        if (ranges) {
          selectionRanges.push(ranges);
        }
      } catch (error) {
        console.error(`Error building selection range for position ${position.line}:${position.character}:`, error);
        // Continue with next position
      }
    }

    return selectionRanges;
  } catch (error) {
    console.error('Error in provideSelectionRanges:', error);
    return [];
  }
}

/**
 * Build a hierarchy of selection ranges from the cursor position outward
 */
function buildSelectionRangeHierarchy(
  document: TextDocument,
  position: Position
): SelectionRange | null {
  const content = document.getText();
  const lines = content.split('\n');
  
  if (position.line >= lines.length) {
    return null;
  }

  const line = lines[position.line];
  const ranges: Range[] = [];

  // Level 1: Current word/identifier
  const wordRange = getWordRange(line, position);
  if (wordRange) {
    ranges.push({
      start: { line: position.line, character: wordRange.start },
      end: { line: position.line, character: wordRange.end }
    });
  }

  // Level 2: String literal (if inside quotes)
  const stringRange = getStringLiteralRange(line, position);
  if (stringRange && (!wordRange || !simpleRangesEqual(wordRange, stringRange))) {
    ranges.push({
      start: { line: position.line, character: stringRange.start },
      end: { line: position.line, character: stringRange.end }
    });
  }

  // Level 3: Property assignment (key = value)
  const propertyRange = getPropertyAssignmentRange(line, position);
  if (propertyRange) {
    ranges.push({
      start: { line: position.line, character: propertyRange.start },
      end: { line: position.line, character: propertyRange.end }
    });
  }

  // Level 4: Array/List element (for elements inside [])
  const arrayElementRange = getArrayElementRange(document, position);
  if (arrayElementRange) {
    ranges.push(arrayElementRange);
  }

  // Level 5: Array/List (entire [...])
  const arrayRange = getArrayRange(document, position);
  if (arrayRange) {
    ranges.push(arrayRange);
  }

  // Level 6: Object/Map element (for elements inside {})
  const objectElementRange = getObjectElementRange(document, position);
  if (objectElementRange) {
    ranges.push(objectElementRange);
  }

  // Level 7: Object/Map (entire {...})
  const objectRange = getObjectRange(document, position);
  if (objectRange) {
    ranges.push(objectRange);
  }

  // Level 8: Component parameter block (e.g., endpoint { ... })
  const parameterBlockRange = getParameterBlockRange(document, position);
  if (parameterBlockRange) {
    ranges.push(parameterBlockRange);
  }

  // Level 9: Component block (e.g., prometheus.scrape "name" { ... })
  const componentRange = getComponentRange(document, position);
  if (componentRange) {
    ranges.push(componentRange);
  }

  // Level 10: Declare block (e.g., declare "name" { ... })
  const declareBlockRange = getDeclareBlockRange(document, position);
  if (declareBlockRange) {
    ranges.push(declareBlockRange);
  }

  // Level 11: Entire document
  const documentRange = getDocumentRange(document);
  ranges.push(documentRange);

  // Build nested SelectionRange structure
  if (ranges.length === 0) {
    return null;
  }

  // Remove duplicates and sort by size (smaller first)
  const uniqueRanges = removeDuplicateRanges(ranges);
  uniqueRanges.sort((a, b) => getRangeSize(a) - getRangeSize(b));

  // Build nested structure
  let selectionRange: SelectionRange | undefined;
  for (let i = uniqueRanges.length - 1; i >= 0; i--) {
    selectionRange = {
      range: uniqueRanges[i],
      parent: selectionRange
    };
  }

  return selectionRange || null;
}

/**
 * Get the range of the word at the cursor position
 */
function getWordRange(line: string, position: Position): { start: number; end: number } | null {
  const char = position.character;
  
  if (char >= line.length) {
    return null;
  }

  // Find word boundaries
  let start = char;
  let end = char;

  // Expand backwards
  while (start > 0 && /[\w\-_\.]/.test(line[start - 1])) {
    start--;
  }

  // Expand forwards
  while (end < line.length && /[\w\-_\.]/.test(line[end])) {
    end++;
  }

  if (start === end) {
    return null;
  }

  return { start, end };
}

/**
 * Get the range of a string literal (including quotes)
 */
function getStringLiteralRange(line: string, position: Position): { start: number; end: number } | null {
  const char = position.character;
  
  // Find if we're inside quotes
  let inString = false;
  let stringStart = -1;
  let stringChar = '';

  for (let i = 0; i <= Math.min(char, line.length - 1); i++) {
    const currentChar = line[i];
    
    if (!inString && (currentChar === '"' || currentChar === "'")) {
      inString = true;
      stringStart = i;
      stringChar = currentChar;
    } else if (inString && currentChar === stringChar && line[i - 1] !== '\\') {
      // Found closing quote
      if (i >= char) {
        return { start: stringStart, end: i + 1 };
      }
      inString = false;
    }
  }

  // If we're still in a string, find the closing quote
  if (inString && stringStart !== -1) {
    for (let i = char + 1; i < line.length; i++) {
      if (line[i] === stringChar && line[i - 1] !== '\\') {
        return { start: stringStart, end: i + 1 };
      }
    }
  }

  return null;
}

/**
 * Get the range of a property assignment (key = value)
 */
function getPropertyAssignmentRange(line: string, position: Position): { start: number; end: number } | null {
  const assignmentMatch = line.match(/^\s*([^=]+)=(.*)$/);
  if (!assignmentMatch) {
    return null;
  }

  const trimmedLine = line.trim();
  const startOffset = line.length - line.trimStart().length;
  
  return {
    start: startOffset,
    end: startOffset + trimmedLine.length
  };
}

/**
 * Get the range of an array element
 */
function getArrayElementRange(document: TextDocument, position: Position): Range | null {
  const content = document.getText();
  const offset = document.offsetAt(position);
  
  // Find the array boundaries
  const arrayBounds = findEnclosingBrackets(content, offset, '[', ']');
  if (!arrayBounds) {
    return null;
  }

  // Parse array content to find element boundaries
  const arrayContent = content.substring(arrayBounds.start + 1, arrayBounds.end);
  const arrayStartPos = document.positionAt(arrayBounds.start + 1);
  
  const elements = parseArrayElements(arrayContent);
  const relativeOffset = offset - arrayBounds.start - 1;

  for (const element of elements) {
    if (relativeOffset >= element.start && relativeOffset <= element.end) {
      // Calculate the actual position accounting for multi-line arrays
      const elementStartOffset = arrayBounds.start + 1 + element.start;
      const elementEndOffset = arrayBounds.start + 1 + element.end;
      
      return {
        start: document.positionAt(elementStartOffset),
        end: document.positionAt(elementEndOffset)
      };
    }
  }

  return null;
}

/**
 * Get the range of an entire array
 */
function getArrayRange(document: TextDocument, position: Position): Range | null {
  const content = document.getText();
  const offset = document.offsetAt(position);
  
  const arrayBounds = findEnclosingBrackets(content, offset, '[', ']');
  if (!arrayBounds) {
    return null;
  }

  return {
    start: document.positionAt(arrayBounds.start),
    end: document.positionAt(arrayBounds.end + 1)
  };
}

/**
 * Get the range of an object element (key-value pair inside {})
 */
function getObjectElementRange(document: TextDocument, position: Position): Range | null {
  const content = document.getText();
  const offset = document.offsetAt(position);
  
  const objectBounds = findEnclosingBrackets(content, offset, '{', '}');
  if (!objectBounds) {
    return null;
  }

  // Find the line containing the cursor within the object
  const lines = content.split('\n');
  const line = lines[position.line];
  
  // Check if this line contains a key-value assignment
  if (line.includes('=')) {
    const trimmedLine = line.trim();
    if (trimmedLine.length > 0) {
      const startChar = line.length - line.trimStart().length;
      return {
        start: { line: position.line, character: startChar },
        end: { line: position.line, character: startChar + trimmedLine.length }
      };
    }
  }

  return null;
}

/**
 * Get the range of an entire object
 */
function getObjectRange(document: TextDocument, position: Position): Range | null {
  const content = document.getText();
  const offset = document.offsetAt(position);
  
  const objectBounds = findEnclosingBrackets(content, offset, '{', '}');
  if (!objectBounds) {
    return null;
  }

  return {
    start: document.positionAt(objectBounds.start),
    end: document.positionAt(objectBounds.end + 1)
  };
}

/**
 * Get the range of a component parameter block (e.g., endpoint { ... })
 */
function getParameterBlockRange(document: TextDocument, position: Position): Range | null {
  const content = document.getText();
  const lines = content.split('\n');
  
  // Look backwards to find a parameter block start
  for (let i = position.line; i >= Math.max(0, position.line - 10); i--) {
    const line = lines[i];
    const paramMatch = line.match(/^\s*(\w+)\s*{/);
    
    if (paramMatch) {
      // Find the matching closing brace
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
      
      // Check if cursor is within this block
      if (position.line >= i && position.line <= endLine) {
        return {
          start: { line: i, character: 0 },
          end: { line: endLine, character: lines[endLine].length }
        };
      }
    }
  }

  return null;
}

/**
 * Get the range of a component block
 */
function getComponentRange(document: TextDocument, position: Position): Range | null {
  const components = utils.parseAllComponents(document);
  const targetComponent = utils.findParsedComponentAtPosition(components, position);
  
  if (targetComponent) {
    return targetComponent.range;
  }

  return null;
}

/**
 * Get the range of a declare block
 */
function getDeclareBlockRange(document: TextDocument, position: Position): Range | null {
  const configBlocks = utils.parseConfigBlocks(document);
  
  for (const configBlock of configBlocks) {
    if (configBlock.type === 'declare' && 
        position.line >= configBlock.range.start.line && 
        position.line <= configBlock.range.end.line) {
      return configBlock.range;
    }
  }

  return null;
}

/**
 * Get the range of the entire document
 */
function getDocumentRange(document: TextDocument): Range {
  const content = document.getText();
  const lines = content.split('\n');
  
  return {
    start: { line: 0, character: 0 },
    end: { line: lines.length - 1, character: lines[lines.length - 1].length }
  };
}

/**
 * Find enclosing brackets around a position
 */
function findEnclosingBrackets(
  content: string,
  offset: number,
  openChar: string,
  closeChar: string
): { start: number; end: number } | null {
  let start = -1;
  let depth = 0;

  // Find opening bracket by going backwards
  for (let i = offset; i >= 0; i--) {
    const char = content[i];
    if (char === closeChar) {
      depth++;
    } else if (char === openChar) {
      if (depth === 0) {
        start = i;
        break;
      }
      depth--;
    }
  }

  if (start === -1) {
    return null;
  }

  // Find closing bracket by going forwards
  depth = 1;
  for (let i = start + 1; i < content.length; i++) {
    const char = content[i];
    if (char === openChar) {
      depth++;
    } else if (char === closeChar) {
      depth--;
      if (depth === 0) {
        return { start, end: i };
      }
    }
  }

  return null;
}

/**
 * Parse array elements with proper handling of nested structures
 */
function parseArrayElements(content: string): Array<{ start: number; end: number }> {
  const elements: Array<{ start: number; end: number }> = [];
  let current = '';
  let depth = 0;
  let inString = false;
  let stringChar = '';
  let elementStart = 0;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];

    if (!inString) {
      if (char === '"' || char === "'") {
        inString = true;
        stringChar = char;
      } else if (char === '[' || char === '{') {
        depth++;
      } else if (char === ']' || char === '}') {
        depth--;
      } else if (char === ',' && depth === 0) {
        const trimmed = current.trim();
        if (trimmed) {
          elements.push({ start: elementStart, end: i });
        }
        current = '';
        elementStart = i + 1;
        continue;
      }
    } else {
      if (char === stringChar && content[i - 1] !== '\\') {
        inString = false;
        stringChar = '';
      }
    }

    current += char;
  }

  // Add the last element
  const trimmed = current.trim();
  if (trimmed) {
    elements.push({ start: elementStart, end: content.length });
  }

  return elements;
}

/**
 * Remove duplicate ranges
 */
function removeDuplicateRanges(ranges: Range[]): Range[] {
  const unique: Range[] = [];
  
  for (const range of ranges) {
    if (!unique.some(existing => rangesEqual(existing, range))) {
      unique.push(range);
    }
  }
  
  return unique;
}

/**
 * Check if two ranges are equal
 */
function rangesEqual(a: Range, b: Range): boolean {
  return a.start.line === b.start.line &&
         a.start.character === b.start.character &&
         a.end.line === b.end.line &&
         a.end.character === b.end.character;
}

/**
 * Check if two simple ranges are equal
 */
function simpleRangesEqual(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start === b.start && a.end === b.end;
}

/**
 * Get the size of a range (number of characters)
 */
function getRangeSize(range: Range): number {
  if (range.start.line === range.end.line) {
    return range.end.character - range.start.character;
  }
  
  // Multi-line range - approximate size
  return (range.end.line - range.start.line) * 100 + range.end.character - range.start.character;
}