import {
  FoldingRange,
  FoldingRangeParams,
  TextDocuments,
  FoldingRangeKind,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as utils from "./utils";

/**
 * Find folding ranges in Alloy configuration
 */
function findFoldingRanges(document: TextDocument): FoldingRange[] {
  const content = document.getText();
  const lines = content.split('\n');
  const ranges: FoldingRange[] = [];
  
  let braceStack: { line: number; character: number; type: 'block' | 'comment' }[] = [];
  let inBlockComment = false;
  let blockCommentStart: number | null = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Handle single-line comments
    if (trimmed.startsWith('//')) {
      // Look for consecutive comment lines
      let commentEnd = i;
      while (commentEnd + 1 < lines.length && lines[commentEnd + 1].trim().startsWith('//')) {
        commentEnd++;
      }
      
      // Only fold if there are multiple comment lines
      if (commentEnd > i) {
        ranges.push({
          startLine: i,
          endLine: commentEnd,
          kind: FoldingRangeKind.Comment
        });
        i = commentEnd; // Skip processed lines
      }
      continue;
    }
    
    // Handle block comments
    let charIndex = 0;
    while (charIndex < line.length) {
      if (!inBlockComment && line.substring(charIndex, charIndex + 2) === '/*') {
        inBlockComment = true;
        blockCommentStart = i;
        charIndex += 2;
      } else if (inBlockComment && line.substring(charIndex, charIndex + 2) === '*/') {
        inBlockComment = false;
        if (blockCommentStart !== null && blockCommentStart < i) {
          ranges.push({
            startLine: blockCommentStart,
            endLine: i,
            kind: FoldingRangeKind.Comment
          });
        }
        blockCommentStart = null;
        charIndex += 2;
      } else {
        charIndex++;
      }
    }
    
    // Skip processing braces if we're in a comment
    if (inBlockComment || trimmed.startsWith('//')) {
      continue;
    }
    
    // Find braces for block folding
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      
      if (char === '{') {
        braceStack.push({ line: i, character: j, type: 'block' });
      } else if (char === '}') {
        const openBrace = braceStack.pop();
        if (openBrace && openBrace.type === 'block' && openBrace.line < i) {
          // Only create folding range if there's more than one line
          ranges.push({
            startLine: openBrace.line,
            endLine: i,
            kind: FoldingRangeKind.Region
          });
        }
      }
    }
  }
  
  // Handle unclosed block comment
  if (inBlockComment && blockCommentStart !== null && blockCommentStart < lines.length - 1) {
    ranges.push({
      startLine: blockCommentStart,
      endLine: lines.length - 1,
      kind: FoldingRangeKind.Comment
    });
  }
  
  return ranges;
}

/**
 * Find component blocks for better folding
 */
function findComponentBlocks(document: TextDocument): FoldingRange[] {
  const ranges: FoldingRange[] = [];
  const configBlocks = utils.parseConfigBlocks(document);
  
  for (const block of configBlocks) {
    if (block.startLine !== undefined && block.endLine !== undefined && 
        block.endLine > block.startLine) {
      ranges.push({
        startLine: block.startLine,
        endLine: block.endLine,
        kind: FoldingRangeKind.Region
      });
    }
    
    // Add folding for nested blocks
    if (block.blocks) {
      for (const nestedBlock of block.blocks) {
        if (nestedBlock.startLine !== undefined && nestedBlock.endLine !== undefined &&
            nestedBlock.endLine > nestedBlock.startLine) {
          ranges.push({
            startLine: nestedBlock.startLine,
            endLine: nestedBlock.endLine,
            kind: FoldingRangeKind.Region
          });
        }
      }
    }
  }
  
  return ranges;
}

export function provideFoldingRanges(
  params: FoldingRangeParams,
  documents: TextDocuments<TextDocument>
): FoldingRange[] | null {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return null;
  }
  
  try {
    // Find basic folding ranges (braces and comments)
    const basicRanges = findFoldingRanges(document);
    
    // Find component-specific folding ranges
    const componentRanges = findComponentBlocks(document);
    
    // Combine and deduplicate ranges
    const allRanges = [...basicRanges, ...componentRanges];
    const uniqueRanges = allRanges.filter((range, index, array) => {
      return !array.slice(0, index).some(other => 
        other.startLine === range.startLine && other.endLine === range.endLine
      );
    });
    
    // Sort ranges by start line
    return uniqueRanges.sort((a, b) => a.startLine - b.startLine);
    
  } catch (error) {
    utils.ErrorHandler?.handleProviderError("FoldingRange", error);
    return null;
  }
}