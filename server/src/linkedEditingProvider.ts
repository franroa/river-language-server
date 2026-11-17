import {
  TextDocuments,
  LinkedEditingRanges,
  LinkedEditingRangeParams,
  Range
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { BaseProvider } from "./baseProvider";

/**
 * Provides linked editing functionality for Alloy configurations
 * Enables synchronized editing of related ranges like component labels, 
 * export/import names, and declare block references
 */
export class LinkedEditingProvider extends BaseProvider {
  constructor(documents: TextDocuments<TextDocument>) {
    super(documents);
  }

  /**
   * Provide linked editing ranges for position
   */
  async provideLinkedEditingRanges(
    params: LinkedEditingRangeParams
  ): Promise<LinkedEditingRanges | null> {
    return this.handleProviderError(
      await this.getLinkedEditingRangesImpl(params),
      'provideLinkedEditingRanges',
      null
    );
  }

  private async getLinkedEditingRangesImpl(
    params: LinkedEditingRangeParams
  ): Promise<LinkedEditingRanges | null> {
    const context = this.initializeContext(params);
    if (!context) return null;

    const { document, position, wordInfo } = context;

    if (!wordInfo || !wordInfo.word) return null;

    // Find linked ranges based on context
    const linkedRanges = await this.findLinkedRanges(document, position, wordInfo.word);
    
    if (linkedRanges.length === 0) return null;

    return {
      ranges: linkedRanges,
      wordPattern: this.getWordPattern(wordInfo.word)
    };
  }

  private async findLinkedRanges(
    document: TextDocument,
    position: { line: number; character: number },
    word: string
  ): Promise<Range[]> {
    const text = document.getText();
    const lines = text.split('\n');

    // Check different linking scenarios
    const ranges: Range[] = [];

    // 1. Component label linking (component.type "label" -> references)
    const componentLabelRanges = this.findComponentLabelRanges(lines, position, word);
    ranges.push(...componentLabelRanges);

    // 2. Declare block linking (declare "name" -> usage references)
    const declareRanges = this.findDeclareBlockRanges(lines, position, word);
    ranges.push(...declareRanges);

    // 3. Export/Import linking (export "name" -> import usage)
    const exportImportRanges = this.findExportImportRanges(lines, position, word);
    ranges.push(...exportImportRanges);

    // 4. Variable reference linking (arguments and attributes)
    const variableRanges = this.findVariableRanges(lines, position, word);
    ranges.push(...variableRanges);

    return ranges;
  }

  private findComponentLabelRanges(
    lines: string[],
    position: { line: number; character: number },
    word: string
  ): Range[] {
    const ranges: Range[] = [];
    const currentLine = lines[position.line];

    // Check if we're on a component declaration line
    const componentDeclMatch = currentLine.match(/^(\s*)([a-zA-Z_.][a-zA-Z0-9_.]*)\s+"([^"]*)"(\s*\{|\s*$)/);
    if (componentDeclMatch) {
      const [, , componentType, componentLabel] = componentDeclMatch;

      // If cursor is on the label, find all references to this component
      if (word === componentLabel) {
        const referencePattern = new RegExp(`\\b${componentType}\\.${componentLabel}\\b`, 'g');
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          let match;
          const regex = new RegExp(referencePattern.source, 'g');
          
          while ((match = regex.exec(line)) !== null) {
            // Skip the declaration itself
            if (i === position.line) continue;

            ranges.push({
              start: { line: i, character: match.index + componentType.length + 1 },
              end: { line: i, character: match.index + match[0].length }
            });
          }
        }

        // Also include the declaration label itself
        const labelStart = currentLine.indexOf(`"${componentLabel}"`);
        if (labelStart !== -1) {
          ranges.push({
            start: { line: position.line, character: labelStart + 1 },
            end: { line: position.line, character: labelStart + 1 + componentLabel.length }
          });
        }
      }
    }

    // Check if we're on a component reference
    const referenceMatch = currentLine.match(/([a-zA-Z_.][a-zA-Z0-9_.]*)\\.([a-zA-Z0-9_]+)/);
    if (referenceMatch) {
      const [, componentType, componentLabel] = referenceMatch;
      
      if (word === componentLabel) {
        // Find the declaration
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const declMatch = line.match(new RegExp(`^\\s*${componentType}\\s+"${componentLabel}"`, 'g'));
          
          if (declMatch) {
            const labelStart = line.indexOf(`"${componentLabel}"`);
            if (labelStart !== -1) {
              ranges.push({
                start: { line: i, character: labelStart + 1 },
                end: { line: i, character: labelStart + 1 + componentLabel.length }
              });
            }
          }
        }

        // Find all other references
        const referencePattern = new RegExp(`\\b${componentType}\\.${componentLabel}\\b`, 'g');
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          let match;
          const regex = new RegExp(referencePattern.source, 'g');
          
          while ((match = regex.exec(line)) !== null) {
            ranges.push({
              start: { line: i, character: match.index + componentType.length + 1 },
              end: { line: i, character: match.index + match[0].length }
            });
          }
        }
      }
    }

    return ranges;
  }

  private findDeclareBlockRanges(
    lines: string[],
    position: { line: number; character: number },
    word: string
  ): Range[] {
    const ranges: Range[] = [];
    const currentLine = lines[position.line];

    // Check if we're on a declare block line
    const declareMatch = currentLine.match(/^(\s*)declare\s+"([^"]+)"\s*\{/);
    if (declareMatch) {
      const [, , declareType] = declareMatch;

      if (word === declareType) {
        // Find all usages of this declare block
        const usagePattern = new RegExp(`\\b${declareType}\\.[a-zA-Z0-9_]+`, 'g');
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          let match;
          const regex = new RegExp(usagePattern.source, 'g');
          
          while ((match = regex.exec(line)) !== null) {
            ranges.push({
              start: { line: i, character: match.index },
              end: { line: i, character: match.index + declareType.length }
            });
          }
        }

        // Include the declare block name itself
        const nameStart = currentLine.indexOf(`"${declareType}"`);
        if (nameStart !== -1) {
          ranges.push({
            start: { line: position.line, character: nameStart + 1 },
            end: { line: position.line, character: nameStart + 1 + declareType.length }
          });
        }
      }
    }

    // Check if we're on a declare usage
    const usageMatch = currentLine.match(/([a-zA-Z_.][a-zA-Z0-9_.]*)\\.([a-zA-Z0-9_]+)/);
    if (usageMatch) {
      const [, declareType] = usageMatch;
      
      if (word === declareType) {
        // Find the declare block
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const declMatch = line.match(new RegExp(`^\\s*declare\\s+"${declareType}"\\s*\\{`));
          
          if (declMatch) {
            const nameStart = line.indexOf(`"${declareType}"`);
            if (nameStart !== -1) {
              ranges.push({
                start: { line: i, character: nameStart + 1 },
                end: { line: i, character: nameStart + 1 + declareType.length }
              });
            }
          }
        }

        // Find all other usages
        const usagePattern = new RegExp(`\\b${declareType}\\.[a-zA-Z0-9_]+`, 'g');
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          let match;
          const regex = new RegExp(usagePattern.source, 'g');
          
          while ((match = regex.exec(line)) !== null) {
            ranges.push({
              start: { line: i, character: match.index },
              end: { line: i, character: match.index + declareType.length }
            });
          }
        }
      }
    }

    return ranges;
  }

  private findExportImportRanges(
    lines: string[],
    position: { line: number; character: number },
    word: string
  ): Range[] {
    const ranges: Range[] = [];
    const currentLine = lines[position.line];

    // Check if we're on an export line
    const exportMatch = currentLine.match(/^(\s*)export\s+"([^"]+)"\s*\{/);
    if (exportMatch) {
      const [, , exportName] = exportMatch;

      if (word === exportName) {
        // Find all imports of this export
        const importPattern = new RegExp(`import\\s+"[^"]*"\\s*\\{[^}]*\\b${exportName}\\b[^}]*\\}`, 'g');
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const match = importPattern.exec(line);
          
          if (match) {
            // Find the exact position of the export name within the import
            const importContent = match[0];
            const nameIndex = importContent.indexOf(exportName);
            if (nameIndex !== -1) {
              ranges.push({
                start: { line: i, character: match.index + nameIndex },
                end: { line: i, character: match.index + nameIndex + exportName.length }
              });
            }
          }
        }

        // Include the export name itself
        const nameStart = currentLine.indexOf(`"${exportName}"`);
        if (nameStart !== -1) {
          ranges.push({
            start: { line: position.line, character: nameStart + 1 },
            end: { line: position.line, character: nameStart + 1 + exportName.length }
          });
        }
      }
    }

    // Check if we're on an import line
    const importMatch = currentLine.match(/import\s+"[^"]*"\s*\{([^}]*)\}/);
    if (importMatch) {
      const [, importList] = importMatch;
      const imports = importList.split(',').map(item => item.trim());
      
      for (const importItem of imports) {
        if (importItem === word) {
          // Find the export definition
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const exportMatch = line.match(new RegExp(`^\\s*export\\s+"${word}"\\s*\\{`));
            
            if (exportMatch) {
              const nameStart = line.indexOf(`"${word}"`);
              if (nameStart !== -1) {
                ranges.push({
                  start: { line: i, character: nameStart + 1 },
                  end: { line: i, character: nameStart + 1 + word.length }
                });
              }
            }
          }

          // Add the current import reference
          const importStart = currentLine.indexOf(word);
          if (importStart !== -1) {
            ranges.push({
              start: { line: position.line, character: importStart },
              end: { line: position.line, character: importStart + word.length }
            });
          }
        }
      }
    }

    return ranges;
  }

  private findVariableRanges(
    lines: string[],
    position: { line: number; character: number },
    word: string
  ): Range[] {
    const ranges: Range[] = [];

    // Look for variable references within the same component block
    const blockStart = this.findBlockStart(lines, position.line);
    const blockEnd = this.findBlockEnd(lines, blockStart);

    if (blockStart === -1 || blockEnd === -1) return ranges;

    // Find all occurrences of the word within this block
    for (let i = blockStart; i <= blockEnd; i++) {
      const line = lines[i];
      let startIndex = 0;
      let index;
      
      while ((index = line.indexOf(word, startIndex)) !== -1) {
        // Check if this is a whole word (not part of another identifier)
        const before = index > 0 ? line[index - 1] : ' ';
        const after = index + word.length < line.length ? line[index + word.length] : ' ';
        
        if (!/[a-zA-Z0-9_]/.test(before) && !/[a-zA-Z0-9_]/.test(after)) {
          ranges.push({
            start: { line: i, character: index },
            end: { line: i, character: index + word.length }
          });
        }
        
        startIndex = index + 1;
      }
    }

    return ranges;
  }

  private findBlockStart(lines: string[], startLine: number): number {
    for (let i = startLine; i >= 0; i--) {
      const line = lines[i].trim();
      
      // Look for component, declare, or export blocks
      if (line.match(/^[a-zA-Z_.][a-zA-Z0-9_.]*\s+"[^"]*"\s*\{?/) ||
          line.match(/^declare\s+"[^"]+"\s*\{/) ||
          line.match(/^export\s+"[^"]+"\s*\{/)) {
        return i;
      }
    }
    return -1;
  }

  private findBlockEnd(lines: string[], startLine: number): number {
    if (startLine === -1) return -1;
    
    let braceCount = 0;
    let foundOpenBrace = false;

    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];
      
      for (const char of line) {
        if (char === '{') {
          braceCount++;
          foundOpenBrace = true;
        } else if (char === '}') {
          braceCount--;
          if (foundOpenBrace && braceCount === 0) {
            return i;
          }
        }
      }
    }

    return lines.length - 1;
  }

  private getWordPattern(word: string): string {
    // Create a regex pattern that matches the word as an identifier
    return `\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`;
  }
}

/**
 * Main entry point for linked editing range requests
 */
export async function provideLinkedEditingRanges(
  params: LinkedEditingRangeParams,
  documents: TextDocuments<TextDocument>
): Promise<LinkedEditingRanges | null> {
  const provider = new LinkedEditingProvider(documents);
  return provider.provideLinkedEditingRanges(params);
}