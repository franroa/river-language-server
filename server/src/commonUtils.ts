import { Position, Range, Location, TextDocumentPositionParams } from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as fs from "fs";
import * as path from "path";

/**
 * Common utilities for Position and Range creation
 * Centralizes the 190+ instances of Position.create() and Range.create() calls
 */
export class PositionUtils {
  /**
   * Create a Position with validation
   */
  static create(line: number, character: number): Position {
    return Position.create(Math.max(0, line), Math.max(0, character));
  }

  /**
   * Create a Position from a line and column offset
   */
  static fromOffset(line: number, character: number, offset: number = 0): Position {
    return this.create(line, character + offset);
  }

  /**
   * Create a Position at the start of a line
   */
  static lineStart(line: number): Position {
    return this.create(line, 0);
  }

  /**
   * Create a Position at the end of a line in a document
   */
  static lineEnd(document: TextDocument, line: number): Position {
    const lineText = document.getText(Range.create(line, 0, line, Number.MAX_SAFE_INTEGER));
    return this.create(line, lineText.length);
  }
}

/**
 * Common utilities for Range creation
 * Centralizes range creation patterns used throughout providers
 */
export class RangeUtils {
  /**
   * Create a Range with validation
   */
  static create(startLine: number, startChar: number, endLine: number, endChar: number): Range {
    return Range.create(
      PositionUtils.create(startLine, startChar),
      PositionUtils.create(endLine, endChar)
    );
  }

  /**
   * Create a Range from positions
   */
  static fromPositions(start: Position, end: Position): Range {
    return Range.create(start, end);
  }

  /**
   * Create a Range for a single line from start to end character
   */
  static singleLine(line: number, startChar: number, endChar: number): Range {
    return this.create(line, startChar, line, endChar);
  }

  /**
   * Create a Range for an entire line
   */
  static entireLine(line: number): Range {
    return this.create(line, 0, line, Number.MAX_SAFE_INTEGER);
  }

  /**
   * Create a Range for a word at a specific position
   */
  static forWord(line: number, startChar: number, wordLength: number): Range {
    return this.singleLine(line, startChar, startChar + wordLength);
  }

  /**
   * Create a Range from a regex match
   */
  static fromMatch(lineIndex: number, match: RegExpExecArray): Range {
    return this.singleLine(lineIndex, match.index, match.index + match[0].length);
  }
}

/**
 * Common utilities for Location creation
 */
export class LocationUtils {
  /**
   * Create a Location with URI and Range
   */
  static create(uri: string, range: Range): Location {
    return Location.create(uri, range);
  }

  /**
   * Create a Location from URI and position coordinates
   */
  static fromCoordinates(uri: string, startLine: number, startChar: number, endLine: number, endChar: number): Location {
    return this.create(uri, RangeUtils.create(startLine, startChar, endLine, endChar));
  }

  /**
   * Create a Location for a word match
   */
  static forMatch(uri: string, lineIndex: number, match: RegExpExecArray): Location {
    return this.create(uri, RangeUtils.fromMatch(lineIndex, match));
  }
}

/**
 * Common error handling patterns used across providers
 */
export class ErrorHandler {
  /**
   * Standard error logging with context
   */
  static logError(context: string, error: any, fallbackValue: any = null): any {
    console.error(`Error in ${context}:`, error);
    return fallbackValue;
  }

  /**
   * Safe execution with error handling
   */
  static safeExecute<T>(fn: () => T, context: string, fallbackValue: T): T {
    try {
      return fn();
    } catch (error) {
      return this.logError(context, error, fallbackValue);
    }
  }

  /**
   * Async safe execution
   */
  static async safeExecuteAsync<T>(fn: () => Promise<T>, context: string, fallbackValue: T): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      return this.logError(context, error, fallbackValue);
    }
  }
}

/**
 * Common document and context validation
 */
export class DocumentUtils {
  /**
   * Validate document and position parameters
   */
  static validateContext(document: TextDocument | undefined, position: Position | undefined): boolean {
    return !!(document && position);
  }

  /**
   * Get word at position with range information
   */
  static getWordAtPosition(document: TextDocument, position: Position): { word: string; range: Range } | null {
    const line = document.getText(RangeUtils.singleLine(position.line, 0, Number.MAX_SAFE_INTEGER));
    const wordPattern = /\b[a-zA-Z_][a-zA-Z0-9_.]*\b/g;
    let match;

    while ((match = wordPattern.exec(line)) !== null) {
      const start = match.index;
      const end = match.index + match[0].length;
      
      if (position.character >= start && position.character <= end) {
        return {
          word: match[0],
          range: RangeUtils.singleLine(position.line, start, end)
        };
      }
    }
    return null;
  }

  /**
   * Check if position is valid for document
   */
  static isValidPosition(document: TextDocument, position: Position): boolean {
    const lineCount = document.lineCount;
    if (position.line < 0 || position.line >= lineCount) {
      return false;
    }

    const lineText = document.getText(RangeUtils.singleLine(position.line, 0, Number.MAX_SAFE_INTEGER));
    return position.character >= 0 && position.character <= lineText.length;
  }
}

/**
 * File system utilities used across providers
 */
export class FileSystemUtils {
  /**
   * Read file as TextDocument with error handling
   */
  static readFileAsTextDocument(filePath: string): TextDocument | null {
    return ErrorHandler.safeExecute(() => {
      if (!fs.existsSync(filePath)) {
        return null;
      }
      
      const content = fs.readFileSync(filePath, 'utf-8');
      const uri = `file://${filePath}`;
      return TextDocument.create(uri, 'alloy', 1, content);
    }, `readFileAsTextDocument(${filePath})`, null);
  }

  /**
   * Get all files matching pattern in directory
   */
  static getFilesInDirectory(dirPath: string, pattern: RegExp = /\.alloy$/): string[] {
    return ErrorHandler.safeExecute(() => {
      if (!fs.existsSync(dirPath)) {
        return [];
      }

      const files: string[] = [];
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isFile() && pattern.test(entry.name)) {
          files.push(fullPath);
        } else if (entry.isDirectory()) {
          files.push(...this.getFilesInDirectory(fullPath, pattern));
        }
      }

      return files;
    }, `getFilesInDirectory(${dirPath})`, []);
  }

  /**
   * Check if file exists and is readable
   */
  static isReadableFile(filePath: string): boolean {
    return ErrorHandler.safeExecute(() => {
      return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
    }, `isReadableFile(${filePath})`, false);
  }
}

/**
 * Common parameter validation
 */
export class ValidationUtils {
  /**
   * Validate TextDocumentPositionParams
   */
  static validatePositionParams(params: TextDocumentPositionParams): boolean {
    return !!(
      params &&
      params.textDocument &&
      params.textDocument.uri &&
      params.position &&
      typeof params.position.line === 'number' &&
      typeof params.position.character === 'number'
    );
  }

  /**
   * Validate string is not empty
   */
  static isNonEmptyString(value: any): value is string {
    return typeof value === 'string' && value.trim().length > 0;
  }

  /**
   * Validate array has elements
   */
  static hasElements<T>(array: T[]): array is [T, ...T[]] {
    return Array.isArray(array) && array.length > 0;
  }
}