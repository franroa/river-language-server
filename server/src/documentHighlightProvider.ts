import {
  DocumentHighlight,
  DocumentHighlightParams,
  DocumentHighlightKind,
  TextDocuments,
  Range,
  Position,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as utils from "./utils";

/**
 * Escape regex special characters
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Find all occurrences of a symbol in the document
 */
function findSymbolOccurrences(
  document: TextDocument, 
  symbolName: string
): DocumentHighlight[] {
  const content = document.getText();
  const lines = content.split('\n');
  const highlights: DocumentHighlight[] = [];
  
  // Create regex for the symbol (word boundary to avoid partial matches)
  const symbolRegex = new RegExp(`\\b${escapeRegExp(symbolName)}\\b`, 'g');
  
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    let match;
    
    // Reset regex lastIndex for each line
    symbolRegex.lastIndex = 0;
    
    while ((match = symbolRegex.exec(line)) !== null) {
      const startChar = match.index;
      const endChar = startChar + symbolName.length;
      
      const range = Range.create(
        Position.create(lineIndex, startChar),
        Position.create(lineIndex, endChar)
      );
      
      // Determine highlight kind based on context
      let kind = DocumentHighlightKind.Text;
      
      // Analyze context to determine if it's read or write
      const context = line.substring(Math.max(0, startChar - 10), Math.min(line.length, endChar + 10));
      
      // Look for assignment patterns (write access)
      if (context.includes('=') && line.indexOf('=') > startChar) {
        kind = DocumentHighlightKind.Write as any;
      } else {
        kind = DocumentHighlightKind.Read as any;
      }
      
      highlights.push({
        range,
        kind
      });
    }
  }
  
  return highlights;
}

/**
 * Find highlights for component references
 */
function findComponentHighlights(
  document: TextDocument,
  componentName: string
): DocumentHighlight[] {
  const highlights: DocumentHighlight[] = [];
  const configBlocks = utils.parseConfigBlocks(document);
  
  for (const block of configBlocks) {
    // Check if this block is of the component type
    if (block.type === componentName) {
      const range = Range.create(
        Position.create(block.startLine || 0, 0),
        Position.create(block.startLine || 0, block.type.length)
      );
      
      highlights.push({
        range,
        kind: DocumentHighlightKind.Text
      });
    }
    
    // Check for component references in labels and arguments
    if (block.label && block.label.includes(componentName)) {
      const content = document.getText();
      const lines = content.split('\n');
      
      if (block.startLine !== undefined && block.startLine < lines.length) {
        const line = lines[block.startLine];
        const labelMatch = line.match(/"([^"]+)"/);
        
        if (labelMatch && labelMatch[1].includes(componentName)) {
          const startChar = line.indexOf(labelMatch[0]);
          const range = Range.create(
            Position.create(block.startLine, startChar),
            Position.create(block.startLine, startChar + labelMatch[0].length)
          );
          
          highlights.push({
            range,
            kind: DocumentHighlightKind.Read
          });
        }
      }
    }
  }
  
  return highlights;
}

/**
 * Find highlights for declared arguments and components
 */
function findDeclaredSymbolHighlights(
  document: TextDocument,
  symbolName: string
): DocumentHighlight[] {
  const highlights: DocumentHighlight[] = [];
  
  // For declared symbols, find all occurrences manually
  // This is a simplified approach since getUnifiedReferences doesn't exist
  if (utils.isDeclaredArgument(document, symbolName) || utils.isDeclaredComponent(document, symbolName)) {
    return findSymbolOccurrences(document, symbolName);
  }
  
  return highlights;
}

export function provideDocumentHighlight(
  params: DocumentHighlightParams,
  documents: TextDocuments<TextDocument>
): DocumentHighlight[] | null {
  // Use unified context manager
  const context = utils.ProviderContext.create(params, documents);
  if (!context) {
    return null;
  }
  
  const wordAtPosition = context.getWordAtPosition();
  if (!wordAtPosition) {
    return null;
  }
  
  try {
    let highlights: DocumentHighlight[] = [];
    
    // First, try to find highlights for declared symbols (arguments and components)
    const declaredHighlights = findDeclaredSymbolHighlights(
      context.document, 
      wordAtPosition
    );
    
    if (declaredHighlights.length > 0) {
      highlights = declaredHighlights;
    } else {
      // Check if it's a component name
      const allComponentData = utils.getCachedWorkspaceComponents(documents);
      
      if (allComponentData[wordAtPosition]) {
        // Find component-specific highlights
        highlights = findComponentHighlights(
          context.document,
          wordAtPosition
        );
      } else {
        // General symbol occurrence highlighting
        highlights = findSymbolOccurrences(
          context.document,
          wordAtPosition
        );
      }
    }
    
    // Remove duplicates and sort by position
    const uniqueHighlights = highlights.filter((highlight, index, array) => {
      return !array.slice(0, index).some(other => 
        other.range.start.line === highlight.range.start.line &&
        other.range.start.character === highlight.range.start.character
      );
    });
    
    return uniqueHighlights.sort((a, b) => {
      if (a.range.start.line !== b.range.start.line) {
        return a.range.start.line - b.range.start.line;
      }
      return a.range.start.character - b.range.start.character;
    });
    
  } catch (error) {
    utils.ErrorHandler?.handleProviderError("DocumentHighlight", error);
    return null;
  }
}