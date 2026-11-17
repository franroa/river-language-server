import {
  DocumentRangeFormattingParams,
  TextEdit,
  TextDocuments,
  Position,
  Range,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as utils from "./utils";

/**
 * Format a specific range in the Alloy document
 */
function formatRange(document: TextDocument, range: Range, options: any): TextEdit[] {
  const tabSize = options.tabSize || 2;
  const insertSpaces = options.insertSpaces !== false;
  const indent = insertSpaces ? ' '.repeat(tabSize) : '\t';
  
  const fullText = document.getText();
  const lines = fullText.split('\n');
  
  const edits: TextEdit[] = [];
  
  // Calculate initial indent level by looking at context before the range
  let initialIndentLevel = 0;
  for (let i = 0; i < range.start.line; i++) {
    const line = lines[i].trim();
    if (line) {
      const openBraces = (line.match(/\{/g) || []).length;
      const closeBraces = (line.match(/\}/g) || []).length;
      initialIndentLevel += openBraces - closeBraces;
    }
  }
  
  let indentLevel = Math.max(0, initialIndentLevel);
  
  // Format lines within the specified range
  for (let lineNum = range.start.line; lineNum <= range.end.line; lineNum++) {
    if (lineNum >= lines.length) break;
    
    const line = lines[lineNum];
    const trimmed = line.trim();
    
    // Skip empty lines and comments
    if (trimmed === '' || trimmed.startsWith('//')) {
      continue;
    }
    
    // Calculate indentation changes
    const openBraces = (trimmed.match(/\{/g) || []).length;
    const closeBraces = (trimmed.match(/\}/g) || []).length;
    
    // Decrease indent for closing braces at start of line
    if (trimmed.startsWith('}')) {
      indentLevel = Math.max(0, indentLevel - closeBraces);
    }
    
    // Calculate expected indentation
    const expectedIndent = indent.repeat(indentLevel);
    const currentIndent = line.match(/^(\s*)/)?.[1] || '';
    
    // Only modify lines within the range
    const lineStart = lineNum === range.start.line ? range.start.character : 0;
    const lineEnd = lineNum === range.end.line ? range.end.character : line.length;
    
    // Create edit if indentation is wrong and it's within our range
    if (currentIndent !== expectedIndent && lineStart === 0) {
      edits.push({
        range: Range.create(
          Position.create(lineNum, 0),
          Position.create(lineNum, currentIndent.length)
        ),
        newText: expectedIndent
      });
    }
    
    // Format spacing around operators within the range
    if (lineStart < lineEnd) {
      const lineSegment = line.substring(lineStart, lineEnd);
      
      // Format argument assignments (ensure space around =)
      const assignmentMatch = lineSegment.match(/(\w+)\s*=\s*(.+)/);
      if (assignmentMatch) {
        const [, key, value] = assignmentMatch;
        const expectedFormat = `${key} = ${value}`;
        
        if (lineSegment.trim() !== expectedFormat) {
          const segmentStart = line.indexOf(lineSegment.trim());
          if (segmentStart >= lineStart && segmentStart < lineEnd) {
            edits.push({
              range: Range.create(
                Position.create(lineNum, segmentStart),
                Position.create(lineNum, segmentStart + lineSegment.trim().length)
              ),
              newText: expectedFormat
            });
          }
        }
      }
      
      // Format block headers (ensure space before {)
      if (lineSegment.includes('{')) {
        const braceIndex = lineStart + lineSegment.indexOf('{');
        if (braceIndex > lineStart && line[braceIndex - 1] !== ' ') {
          edits.push({
            range: Range.create(
              Position.create(lineNum, braceIndex),
              Position.create(lineNum, braceIndex)
            ),
            newText: ' '
          });
        }
      }
    }
    
    // Increase indent for opening braces
    if (!trimmed.startsWith('}')) {
      indentLevel += openBraces;
    }
    
    // Decrease indent for closing braces at end of line
    if (trimmed.endsWith('}') && !trimmed.startsWith('}')) {
      indentLevel = Math.max(0, indentLevel - closeBraces);
    }
  }
  
  return edits;
}

export function provideDocumentRangeFormatting(
  params: DocumentRangeFormattingParams,
  documents: TextDocuments<TextDocument>
): TextEdit[] | null {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return null;
  }
  
  try {
    const range = params.range;
    const options = params.options;
    
    // Format the specified range
    return formatRange(document, range, options);
    
  } catch (error) {
    // Log error but don't fail completely
    utils.ErrorHandler?.handleProviderError("DocumentRangeFormatting", error);
    return null;
  }
}