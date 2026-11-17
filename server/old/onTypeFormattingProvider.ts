import {
  DocumentOnTypeFormattingParams,
  TextEdit,
  Position,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";

export function provideOnTypeFormatting(
  params: DocumentOnTypeFormattingParams,
  documents: any
): TextEdit[] {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }

  const position = params.position;
  const ch = params.ch;
  const text = document.getText();

  const edits: TextEdit[] = [];

  // Handle different trigger characters
  switch (ch) {
    case "{":
      edits.push(...handleOpenBrace(document, position, text));
      break;
    case "}":
      edits.push(...handleCloseBrace(document, position, text));
      break;
    case "=":
      edits.push(...handleEquals(document, position));
      break;
    case "\n":
      edits.push(...handleNewline(document, position, text));
      break;
  }

  return edits;
}

function handleOpenBrace(
  document: TextDocument,
  position: Position,
  text: string
): TextEdit[] {
  const edits: TextEdit[] = [];
  const line = document.getText({
    start: { line: position.line, character: 0 },
    end: { line: position.line, character: position.character },
  });

  // Check if this is the start of a block (not inside a string or comment)
  if (isValidBlockStart(text, document.offsetAt(position))) {
    // Add indentation for the next line
    const indentLevel = getIndentLevel(line);
    const indentString = getIndentString(indentLevel + 1);

    // Insert newline and indentation after the opening brace
    const insertPosition = {
      line: position.line,
      character: position.character + 1,
    };

    edits.push({
      range: {
        start: insertPosition,
        end: insertPosition,
      },
      newText: "\n" + indentString,
    });
  }

  return edits;
}

function handleCloseBrace(
  document: TextDocument,
  position: Position,
  text: string
): TextEdit[] {
  const edits: TextEdit[] = [];
  const line = document.getText({
    start: { line: position.line, character: 0 },
    end: { line: position.line + 1, character: 0 },
  });

  // Check if the closing brace should be dedented
  const currentIndent = getIndentLevel(line);
  const expectedIndent = getExpectedIndentLevel(text, document.offsetAt(position));

  if (currentIndent > expectedIndent) {
    const indentString = getIndentString(expectedIndent);

    edits.push({
      range: {
        start: { line: position.line, character: 0 },
        end: { line: position.line, character: currentIndent },
      },
      newText: indentString,
    });
  }

  return edits;
}

function handleEquals(
  document: TextDocument,
  position: Position
): TextEdit[] {
  const edits: TextEdit[] = [];
  const line = document.getText({
    start: { line: position.line, character: 0 },
    end: { line: position.line, character: position.character + 1 },
  });

  // Ensure proper spacing around equals
  const equalsMatch = line.match(/(\w+)\s*=\s*(.+)?$/);
  if (equalsMatch) {
    const property = equalsMatch[1];
    const value = equalsMatch[2] || "";

    // Format as: property = value
    const formatted = `${property} = ${value}`;

    if (formatted !== line.trim()) {
      edits.push({
        range: {
          start: { line: position.line, character: 0 },
          end: { line: position.line, character: line.length },
        },
        newText: formatted,
      });
    }
  }

  // Add comma for map properties
  const text = document.getText();
  const offset = document.offsetAt(position);
  if (isInsideMap(text, offset)) {
    const fullLine = document.getText({
      start: { line: position.line, character: 0 },
      end: { line: position.line + 1, character: 0 },
    }).trim();

    // Only add comma if line doesn't already end with comma and isn't the last line of the map
    if (!fullLine.endsWith(',') && !isLastLineOfMap(document, position.line)) {
      edits.push({
        range: {
          start: { line: position.line, character: fullLine.length },
          end: { line: position.line, character: fullLine.length },
        },
        newText: ',',
      });
    }
  }

  return edits;
}

function handleNewline(
  document: TextDocument,
  position: Position,
  text: string
): TextEdit[] {
  const edits: TextEdit[] = [];
  const offset = document.offsetAt(position);
  const indentLevel = getExpectedIndentLevel(text, offset);
  const indentString = getIndentString(indentLevel);

  // Insert proper indentation on new line
  edits.push({
    range: {
      start: position,
      end: position,
    },
    newText: indentString,
  });

  // Add comma to the previous line if we're inside a map
  if (isInsideMap(text, offset)) {
    const prevLineNumber = position.line - 1;
    if (prevLineNumber >= 0) {
      const prevLine = document.getText({
        start: { line: prevLineNumber, character: 0 },
        end: { line: prevLineNumber + 1, character: 0 },
      }).trim();

      // Only add comma if line doesn't already end with comma and isn't the last line of the map
      if (!prevLine.endsWith(',') && !isLastLineOfMap(document, prevLineNumber)) {
        edits.push({
          range: {
            start: { line: prevLineNumber, character: prevLine.length },
            end: { line: prevLineNumber, character: prevLine.length },
          },
          newText: ',',
        });
      }
    }
  }

  return edits;
}

function getIndentLevel(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
}

function getIndentString(level: number): string {
  return "  ".repeat(level); // Use 2 spaces for indentation
}

function getExpectedIndentLevel(text: string, offset: number): number {
  let indentLevel = 0;
  let braceLevel = 0;
  let inString = false;
  let inComment = false;

  for (let i = 0; i < offset; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"' && (i === 0 || text[i - 1] !== "\\")) {
      inString = !inString;
    }

    if (!inString) {
      if (char === "/" && nextChar === "/") {
        inComment = true;
      }

      if (inComment && char === "\n") {
        inComment = false;
      }

      if (!inComment) {
        if (char === "{") {
          braceLevel++;
          indentLevel = braceLevel;
        } else if (char === "}") {
          braceLevel--;
          indentLevel = Math.max(0, braceLevel);
        }
      }
    }
  }

  return indentLevel;
}

function isValidBlockStart(text: string, offset: number): boolean {
  // Check if we're not inside a string or comment
  let inString = false;
  let inComment = false;

  for (let i = 0; i < offset; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"' && (i === 0 || text[i - 1] !== "\\")) {
      inString = !inString;
    }

    if (!inString) {
      if (char === "/" && nextChar === "/") {
        inComment = true;
      }

      if (inComment && char === "\n") {
        inComment = false;
      }
    }
  }

  return !inString && !inComment;
}

function isInsideMap(text: string, offset: number): boolean {
  let braceLevel = 0;
  let inString = false;
  let inComment = false;
  let foundMapStart = false;

  for (let i = 0; i < offset; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"' && (i === 0 || text[i - 1] !== "\\")) {
      inString = !inString;
    }

    if (!inString) {
      if (char === "/" && nextChar === "/") {
        inComment = true;
      }

      if (inComment && char === "\n") {
        inComment = false;
      }

      if (!inComment) {
        if (char === "{") {
          braceLevel++;
          // Check if this looks like a map start (preceded by =)
          const beforeBrace = text.substring(Math.max(0, i - 10), i).trim();
          if (beforeBrace.endsWith('=')) {
            foundMapStart = true;
          }
        } else if (char === "}") {
          braceLevel--;
          if (braceLevel === 0 && foundMapStart) {
            foundMapStart = false;
          }
        }
      }
    }
  }

  return foundMapStart && braceLevel > 0;
}

function isLastLineOfMap(document: TextDocument, lineNumber: number): boolean {

  // Look ahead to see if the next non-empty line contains a closing brace
  for (let i = lineNumber + 1; i < document.lineCount; i++) {
    const nextLine = document.getText({
      start: { line: i, character: 0 },
      end: { line: i + 1, character: 0 },
    }).trim();

    if (nextLine === '') continue; // Skip empty lines

    // If we find a closing brace, this might be the last line of the map
    if (nextLine.includes('}')) {
      return true;
    }

    // If we find another property, this is not the last line
    if (nextLine.includes('=')) {
      return false;
    }

    // If we find something else, assume it's not a map property
    break;
  }

  return false;
}