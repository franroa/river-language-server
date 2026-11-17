import { Range, Position } from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";

// Shared interfaces for parsing Alloy configuration files
export interface ParsedBlock {
  name: string;
  label?: string;
  range: Range;
  startLine: number;
  endLine: number;
  args: Record<string, { value: string; range: Range }>;
  children: ParsedBlock[];
  parent?: ParsedBlock;
  path: string[];
}

export interface ParsedComponent {
  name: string;
  label?: string;
  range: Range;
  startLine: number;
  endLine: number;
  blocks: ParsedBlock[];
  args: Record<string, { value: string; range: Range }>;
  scope?: string; // The declare block name if component is inside declare, 'root' if at top level
}

export interface ParsedConfigBlock {
  type: 'declare' | 'argument' | 'export' | 'foreach' | 'http' | 'import.file' | 'import.git' | 'import.http' | 'import.string' | 'livedebugging' | 'livelogging' | 'logging' | 'remotecfg' | 'tracing';
  name?: string;
  label?: string;
  range: Range;
  startLine: number;
  endLine: number;
  blocks: ParsedBlock[];
  args: Record<string, { value: string; range: Range }>;
  components?: ParsedComponent[];
}

export interface BlockPosition {
  blockPath: string[];
  range: Range;
}

export interface ComponentStructure {
  component: string;
  arguments: Record<string, unknown>;
  blocks: Record<string, BlockStructure>;
  required_blocks: string[];
  conditional_blocks: Record<string, unknown>;
}

export interface ConfigBlockStructure {
  block_name: string;
  title: string;
  arguments: Record<string, {
    type: string;
    description: string;
    default: string;
    required: boolean;
  }>;
  blocks: Record<string, {
    description: string;
    required: boolean;
    url?: string;
  }>;
  required_blocks: string[];
  examples: string[];
}

export interface BlockStructure {
  description: string;
  required: boolean;
  children: Record<string, BlockStructure>;
  arguments: {
    name: string;
    type: string;
    description: string;
    default: string;
    required: boolean;
  }[];
  nested_blocks: unknown[];
}

/**
 * Shared parser for Alloy configuration files
 * Provides common parsing functionality used across diagnostics, completions, and other features
 */
export class AlloyParser {
  private parseArguments(
    content: string,
    startLine: number,
    endLine: number,
    excludeNestedBlocks: boolean = false
  ): Record<string, { value: string; range: Range }> {
    const lines = content.split('\n');
    const args: Record<string, { value: string; range: Range }> = {};
    let braceDepth = 0;

    for (let i = startLine; i <= endLine; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip comments and empty lines
      if (trimmed.startsWith('//') || trimmed === '') {
        continue;
      }

      // Track brace depth to identify nested blocks
      const openBraces = (line.match(/\{/g) || []).length;
      const closeBraces = (line.match(/\}/g) || []).length;
      const oldBraceDepth = braceDepth;
      braceDepth += openBraces - closeBraces;

      // If we're excluding nested blocks and we're inside nested blocks (depth > 1), skip this line
      // But allow arguments at depth 1 (component level)
      if (excludeNestedBlocks && oldBraceDepth > 1) {
        continue;
      }

       // Skip lines that look like block declarations (to avoid interfering with parseBlocks)
       // But allow parsing of inline content after the opening brace
       const blockDeclarationMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_.]*)\s*(?:"([^"]*)")?\s*\{(.*)$/);
       if (blockDeclarationMatch && !blockDeclarationMatch[3].trim()) {
         // This is a block declaration with no content after {, skip it
         continue;
       }

        // Handle single-line blocks that contain arguments
        // But skip this if it looks like a block declaration (to avoid interfering with parseBlocks)
        if (trimmed.includes('{') && trimmed.includes('}')) {
          // Check if this looks like a block declaration (word followed by optional label and {)
          const singleLineBlockMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_.]*)\s*(?:"([^"]*)")?\s*\{.*\}\s*$/);
          if (singleLineBlockMatch) {
            // This is a block declaration, don't handle it here - let parseBlocks handle it
            // Just skip to the next line
            return args;
          }

          // Check if this is an argument assignment (contains = before the first {)
          const equalsIndex = trimmed.indexOf('=');
          const braceIndex = trimmed.indexOf('{');
          if (equalsIndex !== -1 && equalsIndex < braceIndex) {
            // This is an argument assignment where the value contains braces
            // Don't treat it as a single-line block, let the assignment logic handle it
            // Continue to the assignment parsing logic below
          } else {
            // This is a single-line block with arguments inside, parse them
            const braceStart = trimmed.indexOf('{');
            const braceEnd = trimmed.lastIndexOf('}');
            if (braceStart !== -1 && braceEnd !== -1 && braceStart < braceEnd) {
              const insideBraces = trimmed.substring(braceStart + 1, braceEnd);
              // Split by comma and parse each argument
              const argParts = insideBraces.split(',');
              for (const argPart of argParts) {
                const trimmedArg = argPart.trim();
                if (trimmedArg) { // Skip empty parts
                  const assignmentMatch = trimmedArg.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.*)$/);
                  if (assignmentMatch) {
                    const argName = assignmentMatch[1];
                    const argValue = assignmentMatch[2];
                    const argStartInLine = line.indexOf(argName, braceStart + 1);

                    args[argName] = {
                      value: argValue.trim(),
                      range: Range.create(
                        Position.create(i, argStartInLine),
                        Position.create(i, argStartInLine + argName.length)
                      )
                    };
                  }
                }
           }
         }
       }
        }

       // Handle lines that contain opening braces followed by arguments
       if (trimmed.includes('{') && !trimmed.includes('}')) {
         // Check if this is a block declaration with inline content
         const blockDeclarationMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_.]*)\s*(?:"([^"]*)")?\s*\{/);
         if (blockDeclarationMatch && excludeNestedBlocks) {
           // This is a block declaration with inline content, skip parsing when excluding nested blocks
           continue;
         }

         // Extract arguments from after the opening brace
         const braceIndex = trimmed.indexOf('{');
         const afterBrace = trimmed.substring(braceIndex + 1).trim();
         if (afterBrace) {
           // Parse arguments from the rest of the line
           const assignmentMatch = afterBrace.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.*)$/);
           if (assignmentMatch) {
            const argName = assignmentMatch[1];
            const argValue = assignmentMatch[2];
            const argStartInLine = line.indexOf(argName, braceIndex + 1);

            args[argName] = {
              value: argValue.trim(),
              range: Range.create(
                Position.create(i, argStartInLine),
                Position.create(i, argStartInLine + argName.length)
              )
            };
          }
        }
        continue;
      }

      // Skip lines that are just closing braces (optionally with whitespace and comments)
      if (trimmed.match(/^\s*\}\s*(\/\/.*)?$/)) {
        continue;
      }

      const assignmentMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.*)$/);
      if (assignmentMatch) {
        const argName = assignmentMatch[1];
        let argValue = assignmentMatch[2];
        
        // Strip comments from the value
        const commentIndex = argValue.indexOf('//');
        if (commentIndex !== -1) {
          argValue = argValue.substring(0, commentIndex);
        }
        
        const startChar = line.indexOf(argName);

        args[argName] = {
          value: argValue.trim(),
          range: Range.create(
            Position.create(i, startChar),
            Position.create(i, startChar + argName.length)
          )
        };
      }
    }

    return args;
  }

  private findBlockEnd(lines: string[], startLine: number): number {
    let braceCount = 0;
    let foundOpenBrace = false;

    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];
      const openBraces = (line.match(/\{/g) || []).length;
      const closeBraces = (line.match(/\}/g) || []).length;

      if (openBraces > 0) {foundOpenBrace = true;}
      braceCount += openBraces - closeBraces;

      if (foundOpenBrace && braceCount === 0) {
        return i;
      }
    }

    return lines.length - 1;
  }

  private parseBlocks(
    content: string,
    startLine: number,
    endLine: number,
    parentPath: string[] = []
  ): ParsedBlock[] {
    const lines = content.split('\n');
    const blocks: ParsedBlock[] = [];
    let i = startLine;

    while (i <= endLine) {
      const line = lines[i];
      const trimmed = line.trim();

      // First try the standard block pattern (must end with { to avoid matching same-line blocks)
      const blockMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_.]*)\s*(?:"([^"]*)")?\s*\{$/);
       let blockName: string | undefined;
       let blockLabel: string | undefined;
       let isSameLineBlock = false;
       let hasInlineContent = false;
       let blockStartLine = i;

      if (blockMatch) {
        blockName = blockMatch[1];
        blockLabel = blockMatch[2];
       } else {
         // Try to find single-line blocks with both opening and closing braces
         // Pattern: block_name "label" { } (optionally followed by comment)
         const singleLineBlockMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_.]*)\s*(?:"([^"]*)")?\s*\{\s*\}(?:\s*\/\/.*)?$/);
         if (singleLineBlockMatch) {
           blockName = singleLineBlockMatch[1];
           blockLabel = singleLineBlockMatch[2];
           isSameLineBlock = true;
         } else {
           // Try to find blocks that have content immediately after the opening brace
           // Pattern: block_name "label" { content
           const inlineContentMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_.]*)\s*(?:"([^"]*)")?\s*\{(.*)$/);

           // Special case: if this looks like a component declaration with a block after the brace
           // Pattern: component_name "label" { block_name {
           const componentWithBlockMatch = trimmed.match(/^([a-zA-Z_.][a-zA-Z0-9_.]*)\s*(?:"([^"]*)")?\s*\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*(?:"([^"]*)")?\s*\{/);

           if (componentWithBlockMatch) {
             // This is a component declaration with a block declaration after the opening brace
             blockName = componentWithBlockMatch[3];
             blockLabel = componentWithBlockMatch[4];
             hasInlineContent = true;
           } else if (inlineContentMatch) {
             blockName = inlineContentMatch[1];
             blockLabel = inlineContentMatch[2];
             hasInlineContent = true;
             // This is a multi-line block with content on the same line
           } else {
             // Try to find blocks that start on the same line as other content
             // Look for patterns like: { block_name { or component_name { block_name {
             // We need to find content after the first { to avoid matching component names
             const firstBraceIndex = trimmed.indexOf('{');
             if (firstBraceIndex !== -1) {
               const afterFirstBrace = trimmed.substring(firstBraceIndex + 1);
               // Look for block_name { pattern after the first brace
               const blockMatch = afterFirstBrace.match(/^\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*(?:"([^"]*)")?\s*\{/);
               if (blockMatch) {
                 blockName = blockMatch[1];
                 blockLabel = blockMatch[2];
                 isSameLineBlock = true;
               } else {
                 // Handle the case where we have component_name { block_name {
                 // Look for the pattern after the component's opening brace
                 const componentBraceMatch = trimmed.match(/^([a-zA-Z_.][a-zA-Z0-9_.]*)\s*(?:"([^"]*)")?\s*\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*(?:"([^"]*)")?\s*\{/);
                 if (componentBraceMatch) {
                   blockName = componentBraceMatch[3];
                   blockLabel = componentBraceMatch[4];
                   hasInlineContent = true;
          }
        }
             }
           }
         }
       }



      if (blockName) {
        const blockEndLine = this.findBlockEnd(lines, i);

        const blockPath = [...parentPath, blockName];
        const blockRange = Range.create(
          Position.create(blockStartLine, line.indexOf(blockName)),
          Position.create(blockStartLine, line.indexOf(blockName) + blockName.length)
        );

        // Handle single-line blocks differently
        const isSingleLineBlock = blockStartLine === blockEndLine;
        let blockArgs: Record<string, { value: string; range: Range }>;
        let blockChildren: ParsedBlock[];

        if (isSingleLineBlock) {
          // For single-line blocks, no arguments or children
          blockArgs = {};
          blockChildren = []; // Single-line blocks can't have nested blocks
        } else {
           // For multi-line blocks, parse arguments and children from inner lines
           // Arguments: include the start line if it's a same-line block or has inline content
           const argParseStartLine = (isSameLineBlock || hasInlineContent) ? blockStartLine : blockStartLine + 1;
           blockArgs = this.parseArguments(content, argParseStartLine, blockEndLine - 1);
          // Children: always start from next line to avoid infinite recursion
          blockChildren = this.parseBlocks(content, blockStartLine + 1, blockEndLine - 1, blockPath);
        }

        const parsedBlock: ParsedBlock = {
          name: blockName,
          label: blockLabel,
          range: blockRange,
          startLine: blockStartLine,
          endLine: blockEndLine,
          args: blockArgs,
          children: blockChildren,
          path: blockPath
        };

        blocks.push(parsedBlock);
        i = blockEndLine + 1;
      } else {
        i++;
      }
    }

    return blocks;
  }

  /**
   * Parse a document and return all components found
   */
  parseDocument(document: TextDocument): ParsedComponent[] {
    const content = document.getText();
    const lines = content.split('\n');
    const components: ParsedComponent[] = [];
    
    // First pass: identify all config block ranges to skip components inside them
    const configBlockRanges: { start: number; end: number }[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      // Match all config block types, not just declare
      const configBlockMatch = trimmed.match(/^(declare|argument|export|foreach|http|import\.file|import\.git|import\.http|import\.string|livedebugging|livelogging|logging|remotecfg|tracing)\s*(?:"([^"]*)")?\s*\{/);
      if (configBlockMatch) {
        const blockEndLine = this.findBlockEnd(lines, i);
        configBlockRanges.push({ start: i, end: blockEndLine });
        i = blockEndLine; // Skip to end of config block
      }
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed.startsWith('//') || trimmed === '') {
        continue;
      }
      
      // Skip components that are inside config blocks
      const isInConfigBlock = configBlockRanges.some(range => i > range.start && i < range.end);
      if (isInConfigBlock) {
        continue;
      }

      // Check for component declarations (more flexible - handle same-line and next-line braces)
      // Skip lines that contain '=' as they are argument assignments, not component declarations
      if (trimmed.includes('=')) {
        continue;
      }

      const componentDeclarationMatch = trimmed.match(/^([a-zA-Z_.][a-zA-Z0-9_.]*)\s*(?:"([^"]*)")?/);
      if (componentDeclarationMatch) {
        const componentName = componentDeclarationMatch[1];
        const componentLabel = componentDeclarationMatch[2];
        
        // Skip if this is a config block
        if (componentName === 'declare' || componentName === 'argument' || componentName === 'export' ||
            componentName === 'foreach' || componentName === 'http' || componentName === 'import.file' ||
            componentName === 'import.git' || componentName === 'import.http' || componentName === 'import.string' ||
            componentName === 'livedebugging' || componentName === 'livelogging' || componentName === 'logging' ||
            componentName === 'remotecfg' || componentName === 'tracing') {
          continue;
        }

        // Look for opening brace on same line or next few lines
        let braceLineIndex = -1;
        let braceFound = false;
        
        // Check if brace is on same line
        if (trimmed.includes('{')) {
          braceLineIndex = i;
          braceFound = true;
        } else {
          // Look for brace on next few lines (up to 3 lines ahead)
          for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
            const nextLine = lines[j].trim();
            if (nextLine.startsWith('//') || nextLine === '') {
              continue; // Skip comments and empty lines
            }
            if (nextLine.includes('{')) {
              braceLineIndex = j;
              braceFound = true;
              break;
            }
            // If we encounter another component declaration, stop looking
            if (nextLine.match(/^[a-zA-Z_.][a-zA-Z0-9_.]*\s*(?:"[^"]*")?/)) {
              break;
            }
          }
        }

        if (braceFound) {
          const componentStartLine = i;
          const componentEndLine = this.findBlockEnd(lines, braceLineIndex);

          const componentRange = Range.create(
            Position.create(componentStartLine, 0),
            Position.create(componentEndLine, lines[componentEndLine].length)
          );

           // Determine where to start parsing blocks
           const braceLine = lines[braceLineIndex];
           const braceIndex = braceLine.indexOf('{');
           const contentAfterBrace = braceIndex !== -1 ? braceLine.substring(braceIndex + 1).trim() : '';



            // If there's content after the brace on the same line, we need to handle it specially
            // The content after the brace might contain block declarations
            let blockParseStartLine: number;
            let componentArgs: Record<string, { value: string; range: Range }>;

            if (contentAfterBrace) {
              // There is content after the component's opening brace
              // Check if it looks like a block declaration (word followed by {)
              const blockDeclarationMatch = contentAfterBrace.match(/^([a-zA-Z_][a-zA-Z0-9_.]*)\s*(?:"([^"]*)")?\s*\{/);
               if (blockDeclarationMatch) {
                 // The content after the brace is a block declaration
                 // Start parsing blocks from this line, but skip the component part
                 blockParseStartLine = braceLineIndex;
                 // Parse component arguments from before the block declaration
                 componentArgs = this.parseArguments(content, braceLineIndex, braceLineIndex, true);
               } else {
                 // The content after the brace is component arguments
                 // Start parsing blocks from the next line
                 blockParseStartLine = braceLineIndex + 1;
                 componentArgs = this.parseArguments(content, braceLineIndex + 1, componentEndLine - 1, true);
               }
            } else {
              // No content after the brace, start parsing blocks from the next line
              blockParseStartLine = braceLineIndex + 1;
              componentArgs = this.parseArguments(content, braceLineIndex + 1, componentEndLine - 1, true);
            }

            const parsedComponent: ParsedComponent = {
             name: componentName,
             label: componentLabel,
             range: componentRange,
             startLine: componentStartLine,
             endLine: componentEndLine,
             blocks: this.parseBlocks(content, blockParseStartLine, componentEndLine - 1, []),
             args: componentArgs,
             scope: 'root'
           };

          components.push(parsedComponent);
          i = componentEndLine;
        }
      }
    }

    return components;
  }

  /**
   * Parse a document and return all config blocks found
   */
  parseConfigBlocks(document: TextDocument): ParsedConfigBlock[] {
    const content = document.getText();
    const lines = content.split('\n');
    const configBlocks: ParsedConfigBlock[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed.startsWith('//') || trimmed === '') {
        continue;
      }

       // Check for config block declarations
       const configBlockMatch = trimmed.match(/^(declare|argument|export|foreach|http|import\.file|import\.git|import\.http|import\.string|livedebugging|livelogging|logging|remotecfg|tracing)\s*(?:"([^"]*)")?\s*\{/);
       if (configBlockMatch) {
         const blockType = configBlockMatch[1] as 'declare' | 'argument' | 'export' | 'foreach' | 'http' | 'import.file' | 'import.git' | 'import.http' | 'import.string' | 'livedebugging' | 'livelogging' | 'logging' | 'remotecfg' | 'tracing';
         const blockLabel = configBlockMatch[2];
         const blockStartLine = i;
         const blockEndLine = this.findBlockEnd(lines, i);

         const blockRange = Range.create(
           Position.create(blockStartLine, 0),
           Position.create(blockEndLine, lines[blockEndLine].length)
         );

         // For declare blocks, parse components inside them
         let components: ParsedComponent[] = [];
         if (blockType === 'declare') {
          components = this.parseComponentsInRange(content, blockStartLine + 1, blockEndLine - 1, blockLabel || 'unknown');
        }

        const parsedConfigBlock: ParsedConfigBlock = {
          type: blockType,
          name: blockType,
          label: blockLabel,
          range: blockRange,
          startLine: blockStartLine,
          endLine: blockEndLine,
          blocks: this.parseBlocks(content, blockStartLine + 1, blockEndLine - 1, []),
          args: this.parseArguments(content, blockStartLine + 1, blockEndLine - 1, true),
          components: components
        };

        configBlocks.push(parsedConfigBlock);
        i = blockEndLine;
      }
    }

    return configBlocks;
  }

  /**
   * Parse components within a specific range (used for declare blocks)
   */
  private parseComponentsInRange(content: string, startLine: number, endLine: number, scope: string = 'root'): ParsedComponent[] {
    const lines = content.split('\n');
    const components: ParsedComponent[] = [];

    for (let i = startLine; i <= endLine; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed.startsWith('//') || trimmed === '') {
        continue;
      }

      // Check for component declarations (but not config blocks)
      const componentMatch = trimmed.match(/^([a-zA-Z_.][a-zA-Z0-9_.]*)\s*(?:"([^"]*)")?\s*\{/);
      if (componentMatch) {
        const componentName = componentMatch[1];
        const componentLabel = componentMatch[2];
        
        // Skip config blocks
        if (componentName === 'declare' || componentName === 'argument' || componentName === 'export' ||
            componentName === 'foreach' || componentName === 'http' || componentName === 'import.file' ||
            componentName === 'import.git' || componentName === 'import.http' || componentName === 'import.string' ||
            componentName === 'livedebugging' || componentName === 'livelogging' || componentName === 'logging' ||
            componentName === 'remotecfg' || componentName === 'tracing') {
          continue;
        }

        const componentStartLine = i;
        const componentEndLine = this.findBlockEnd(lines, i);
        
        // Make sure we don't go beyond the specified range
        const actualEndLine = Math.min(componentEndLine, endLine);

        const componentRange = Range.create(
          Position.create(componentStartLine, line.indexOf(componentName)),
          Position.create(componentStartLine, line.indexOf(componentName) + componentName.length)
        );

        const parsedComponent: ParsedComponent = {
          name: componentName,
          label: componentLabel,
          range: componentRange,
          startLine: componentStartLine,
          endLine: actualEndLine,
          blocks: this.parseBlocks(content, componentStartLine + 1, actualEndLine - 1, []),
          args: this.parseArguments(content, componentStartLine + 1, actualEndLine - 1, true),
          scope: scope
        };

        components.push(parsedComponent);
        i = actualEndLine;
      }
    }

    return components;
  }

  /**
   * Parse a document and return both components and config blocks
   */
  parseDocumentComplete(document: TextDocument): { components: ParsedComponent[]; configBlocks: ParsedConfigBlock[] } {
    return {
      components: this.parseDocument(document),
      configBlocks: this.parseConfigBlocks(document)
    };
  }

  /**
   * Check if a position is inside a config block
   */
  findConfigBlockAtPosition(
    content: string,
    position: Position
  ): ParsedConfigBlock | null {
    const lines = content.split('\n');
    let mostSpecificBlock: ParsedConfigBlock | null = null;
    let smallestRange = Infinity;

    for (let i = 0; i <= position.line; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed.startsWith('//') || trimmed === '') {
        continue;
      }

       // Check for config block declarations
       const configBlockMatch = trimmed.match(/^(declare|argument|export|foreach|http|import\.file|import\.git|import\.http|import\.string|livedebugging|livelogging|logging|remotecfg|tracing)\s*(?:"([^"]*)")?\s*\{/);
       if (configBlockMatch) {
         const blockType = configBlockMatch[1] as 'declare' | 'argument' | 'export' | 'foreach' | 'http' | 'import.file' | 'import.git' | 'import.http' | 'import.string' | 'livedebugging' | 'livelogging' | 'logging' | 'remotecfg' | 'tracing';
        const blockLabel = configBlockMatch[2];
        const blockStartLine = i;
        const blockEndLine = this.findBlockEnd(lines, i);

        // Check if position is within this config block
        if (position.line >= blockStartLine && position.line <= blockEndLine) {
          const blockRange = Range.create(
            Position.create(blockStartLine, line.indexOf(blockType)),
            Position.create(blockStartLine, line.indexOf(blockType) + blockType.length)
          );

          // Calculate the range size to find the most specific (innermost) block
          const rangeSize = blockEndLine - blockStartLine;

          // If this block has a smaller range than the current most specific block,
          // or if we haven't found any block yet, update the most specific block
          if (rangeSize < smallestRange || mostSpecificBlock === null) {
            smallestRange = rangeSize;

            // For declare blocks, parse components inside them
            let components: ParsedComponent[] = [];
            if (blockType === 'declare') {
              components = this.parseComponentsInRange(content, blockStartLine + 1, blockEndLine - 1);
            }

            mostSpecificBlock = {
              type: blockType,
              name: blockType,
              label: blockLabel,
              range: blockRange,
              startLine: blockStartLine,
              endLine: blockEndLine,
              blocks: this.parseBlocks(content, blockStartLine + 1, blockEndLine - 1, []),
          args: this.parseArguments(content, blockStartLine, blockEndLine - 1, true),
              components: components
            };
          }
        }
      }
    }

    return mostSpecificBlock;
  }

  /**
   * Find the block at a specific position in the document
   */
  findBlockAtPosition(
    content: string,
    position: Position,
  ): BlockPosition | null {
    const lines = content.split("\n");
    let currentBlockPath: string[] = [];
    let braceCount = 0;

    for (let i = 0; i < lines.length && i <= position.line; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Look for block declarations first (before updating brace count)
      // Skip commented lines
      if (!trimmed.startsWith("//")) {
        const blockMatch = trimmed.match(/^([^\s"]+)(?:\s+"[^"]*")?\s*\{/);
        if (blockMatch) {
          const blockName = blockMatch[1];
          if (braceCount === 0) {
            // Component level
            currentBlockPath = [blockName];
          } else {
            // Nested block
            currentBlockPath.push(blockName);
          }
        }
      }

      // Check if we're at the target position BEFORE updating brace count
      if (i === position.line) {
        // Only return block context if we're actually inside the block
        // and not on the block declaration line itself
        const isOnBlockDeclaration = trimmed.match(/^([^\s"]+)(?:\s+"[^"]*")?\s*\{/);

        // Check if we're inside a block (component level or nested)
        let isInsideBlock = braceCount > 0 && !isOnBlockDeclaration;

        // Special handling for cursor on block declaration line but after opening brace
        if (!isInsideBlock && isOnBlockDeclaration) {
          const openBraceIndex = line.indexOf('{');
          // If cursor is at or after the opening brace on a block declaration line,
          // consider it inside the block
          if (position.character >= openBraceIndex) {
            isInsideBlock = true;
          }
        }

        // Special handling for single-line blocks
        if (!isInsideBlock && trimmed.includes('{') && trimmed.includes('}')) {
          // Find positions of braces in the current line
          const openBraceIndex = line.indexOf('{');
          const closeBraceIndex = line.lastIndexOf('}');

          // Check if cursor is between the braces (including on the braces)
          if (position.character >= openBraceIndex && position.character <= closeBraceIndex) {
            isInsideBlock = true;
          }
        }

        // Check if cursor is after a closing brace on the same line
        if (isInsideBlock && trimmed.includes('}')) {
          const closeBraceIndex = line.lastIndexOf('}');
          if (position.character > closeBraceIndex) {
            // Cursor is after the closing brace, so we're no longer inside this block
            isInsideBlock = false;
            // Remove the current block from path since we're after its closing brace
            currentBlockPath = currentBlockPath.slice(0, -1);
          }
        }

        if (isInsideBlock) {
          return {
            blockPath: [...currentBlockPath],
            range: Range.create(
              Position.create(i, line.indexOf(trimmed)),
              Position.create(i, line.length),
            ),
          };
        } else {
          // We're at component level or on a block declaration line, return empty path
          return {
            blockPath: [],
            range: Range.create(
              Position.create(i, line.indexOf(trimmed)),
              Position.create(i, line.length),
            ),
          };
        }
      }

      // Track braces to understand nesting (after position check)
      const openBraces = (line.match(/\{/g) || []).length;
      const closeBraces = (line.match(/\}/g) || []).length;

      // Update brace count
      const oldBraceCount = braceCount;
      braceCount += openBraces - closeBraces;

      // If we just closed a block, remove it from the path
      // Handle both multi-line blocks and single-line blocks
      if (closeBraces > 0 && currentBlockPath.length > 0) {
        if (oldBraceCount > braceCount) {
          // Multi-line block closed
          currentBlockPath.pop();
        } else if (openBraces > 0 && closeBraces === openBraces) {
          // Single-line block (equal open and close braces on same line)
          currentBlockPath.pop();
        }
      }
    }

    return null;
  }

  /**
   * Find a block by its path within the parsed blocks
   */
  findBlockByPath(blocks: ParsedBlock[], targetPath: string[]): ParsedBlock | null {
    for (const block of blocks) {
      if (block.path.length === targetPath.length &&
          block.path.every((segment, index) => segment === targetPath[index])) {
        return block;
      }

      const found = this.findBlockByPath(block.children, targetPath);
      if (found) return found;
    }
    return null;
  }

  /**
   * Get the current word being typed at the cursor position
   */
  getCurrentWord(textBeforeCursor: string): string {
    // Extract the current word being typed (from the last whitespace or start of line)
    const match = textBeforeCursor.match(/([a-zA-Z_.]+)$/);
    return match ? match[1] : "";
  }

  /**
   * Find the component at a specific position in the document
   * Requires component registry to validate against known components
   */
  findComponentAtPosition(
    content: string, 
    position: Position,
    knownComponents: string[] = []
  ): string | null {
    const lines = content.split("\n");
    let braceCount = 0;
    let foundComponent: string | null = null;

    for (let i = position.line; i >= 0; i--) {
      const line = lines[i];
      const trimmed = line.trim();

      // Count braces to understand nesting (counting backwards)
      const openBraces = (line.match(/\{/g) || []).length;
      const closeBraces = (line.match(/\}/g) || []).length;
      braceCount += closeBraces - openBraces;

      // Check for component declaration on non-comment lines
      if (!trimmed.startsWith("//") && trimmed) {
        // First check if this might be a config block
        const configBlockMatch = trimmed.match(/^(declare|argument|export|foreach|http|import\.file|import\.git|import\.http|import\.string|livedebugging|livelogging|logging|remotecfg|tracing)\s/);
        if (configBlockMatch) {
          continue; // Skip config blocks when looking for components
        }
        
        for (const componentName of knownComponents) {
          if (trimmed.startsWith(componentName)) {
            foundComponent = componentName;
            if (braceCount <= 0) {
              return foundComponent;
            }
          }
        }
      }
    }

    return foundComponent;
  }

  /**
   * Check if position is inside a custom component (defined by declare)
   */
  findCustomComponentAtPosition(
    content: string,
    position: Position
  ): { componentName: string; declareLabel: string } | null {
    const lines = content.split('\n');
    
    // First find if we're inside any component usage
    for (let i = position.line; i >= 0; i--) {
      const line = lines[i];
      const trimmed = line.trim();
      
      if (trimmed.startsWith('//') || trimmed === '') {
        continue;
      }
      
      // Look for component usage pattern that might be a custom component
      const componentMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s+(?:"([^"]*)")?\s*\{/);
      if (componentMatch) {
        const componentName = componentMatch[1];
        
        // Skip known config blocks
        if (componentName === 'declare' || componentName === 'argument' || componentName === 'export' ||
            componentName === 'foreach' || componentName === 'http' || componentName === 'import.file' ||
            componentName === 'import.git' || componentName === 'import.http' || componentName === 'import.string' ||
            componentName === 'livedebugging' || componentName === 'livelogging' || componentName === 'logging' ||
            componentName === 'remotecfg' || componentName === 'tracing') {
          continue;
        }
        
        // Check if this component is defined by a declare block
        const declareBlock = this.findDeclareBlock(content, componentName);
        if (declareBlock) {
          return {
            componentName: componentName,
            declareLabel: declareBlock.label || componentName
          };
        }
      }
    }
    
    return null;
  }

  /**
   * Find declare block that defines a custom component
   */
  private findDeclareBlock(content: string, componentName: string): ParsedConfigBlock | null {
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      if (trimmed.startsWith('//') || trimmed === '') {
        continue;
      }
      
      const declareMatch = trimmed.match(/^declare\s+"([^"]*)"?\s*\{/);
      if (declareMatch) {
        const declaredName = declareMatch[1];
        if (declaredName === componentName) {
          const blockStartLine = i;
          const blockEndLine = this.findBlockEnd(lines, i);
          
          const blockRange = Range.create(
            Position.create(blockStartLine, line.indexOf('declare')),
            Position.create(blockStartLine, line.indexOf('declare') + 'declare'.length)
          );
          
          return {
            type: 'declare',
            name: 'declare',
            label: declaredName,
            range: blockRange,
            startLine: blockStartLine,
            endLine: blockEndLine,
            blocks: this.parseBlocks(content, blockStartLine + 1, blockEndLine - 1, []),
            args: this.parseArguments(content, blockStartLine + 1, blockEndLine - 1, true),
            components: this.parseComponentsInRange(content, blockStartLine + 1, blockEndLine - 1)
          };
        }
      }
    }
    
    return null;
  }

  /**
   * Check if we're inside a component block at the given position
   */
  isInsideComponentBlock(content: string, position: Position, componentName?: string): boolean {
    const lines = content.split("\n");
    let braceCount = 0;
    let inComponentBlock = false;

    for (let i = 0; i <= position.line; i++) {
      const line = lines[i];
      const openBraces = (line.match(/\{/g) || []).length;
      const closeBraces = (line.match(/\}/g) || []).length;

      // Check if we found the component declaration
      if (componentName && line.trim().startsWith(componentName)) {
        inComponentBlock = true;
      }

      // Special handling for single-line blocks
      if (i === position.line && inComponentBlock && openBraces > 0 && closeBraces > 0) {
        // For single-line blocks, check if cursor is between braces
        const openBraceIndex = line.indexOf('{');
        const closeBraceIndex = line.lastIndexOf('}');
        if (position.character >= openBraceIndex && position.character <= closeBraceIndex) {
          return true;
        }
      }

      braceCount += openBraces - closeBraces;
    }

    return inComponentBlock && braceCount > 0;
  }
}

// Singleton instance for shared use
export const alloyParser = new AlloyParser();