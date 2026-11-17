import {
  SemanticTokens,
  SemanticTokensParams,
  SemanticTokensBuilder,
  SemanticTokensLegend,
  TextDocuments,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";

// Define semantic token types for Alloy
export const tokenTypes = [
  'component',      // Component names like prometheus.exporter.mysql
  'argument',       // Argument names like data_source_name
  'parameter',      // Parameter values and references
  'keyword',        // Keywords like declare, argument, export
  'string',         // String literals
  'number',         // Numeric values
  'type',           // Type annotations
  'comment',        // Comments
  'operator',       // Operators like =, {, }
  'variable',       // Variable references like argument.X.value
  'function',       // Function-like constructs
];

export const tokenModifiers = [
  'declaration',    // Declaration of something
  'definition',     // Definition of something
  'readonly',       // Read-only elements
  'default',        // Default values
  'optional',       // Optional elements
  'required',       // Required elements
];

export type TokenType = typeof tokenTypes[number];
export type TokenModifier = typeof tokenModifiers[number];

// Create the semantic tokens legend
export const semanticTokensLegend: SemanticTokensLegend = {
  tokenTypes,
  tokenModifiers,
};

/**
 * Get semantic tokens for a document
 */
function getSemanticTokens(document: TextDocument): SemanticTokens {
  const builder = new SemanticTokensBuilder();

  // Get the document text
  const text = document.getText();
  const lines = text.split('\n');

  // Process each line
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    processLineTokens(line, lineIndex, builder);
  }

  return builder.build();
}

/**
 * Process semantic tokens for a single line
 */
function processLineTokens(line: string, lineIndex: number, builder: SemanticTokensBuilder): void {
  let charIndex = 0;

  // Skip leading whitespace
  while (charIndex < line.length && /\s/.test(line[charIndex])) {
    charIndex++;
  }

  // Process the line content
  while (charIndex < line.length) {
    const remaining = line.substring(charIndex);

    // Try to match different token types
    const tokenMatch = matchNextToken(remaining);
    if (tokenMatch) {
      const { type, modifier, length, skipLength } = tokenMatch;

      // Add the token
      const modifiers = modifier ? [modifier] : [];
      builder.push(lineIndex, charIndex, length, getTokenTypeIndex(type), getTokenModifierBitmask(modifiers));

      // Move past this token
      charIndex += skipLength || length;
    } else {
      // No more tokens on this line
      break;
    }
  }
}

/**
 * Match the next semantic token in the remaining text
 */
function matchNextToken(remaining: string): { type: TokenType; modifier?: TokenModifier; length: number; skipLength?: number } | null {
  // Match comments first
  const commentMatch = remaining.match(/^\/\/(.*)$/);
  if (commentMatch) {
    return {
      type: 'comment',
      length: commentMatch[0].length
    };
  }

  // Match block comments
  const blockCommentMatch = remaining.match(/^\/\*[\s\S]*?\*\//);
  if (blockCommentMatch) {
    return {
      type: 'comment',
      length: blockCommentMatch[0].length
    };
  }

  // Match keywords
  const keywordMatch = remaining.match(/^(declare|argument|export|optional|required|default|value|type|comment)\b/);
  if (keywordMatch) {
    return {
      type: 'keyword',
      length: keywordMatch[0].length
    };
  }

  // Match component names (dot-separated identifiers)
  const componentMatch = remaining.match(/^([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)+)/);
  if (componentMatch) {
    return {
      type: 'component',
      length: componentMatch[0].length
    };
  }

  // Match argument references (argument.X.value)
  const argRefMatch = remaining.match(/^argument\.([a-zA-Z_][a-zA-Z0-9_]*)\.value\b/);
  if (argRefMatch) {
    return {
      type: 'variable',
      modifier: 'readonly',
      length: argRefMatch[0].length
    };
  }

  // Match simple identifiers (argument names, component labels)
  const identifierMatch = remaining.match(/^([a-zA-Z_][a-zA-Z0-9_]*)/);
  if (identifierMatch) {
    const identifier = identifierMatch[0];

    // Check if it's followed by = (likely an argument name)
    const afterIdentifier = remaining.substring(identifier.length).trim();
    if (afterIdentifier.startsWith('=')) {
      return {
        type: 'argument',
        length: identifier.length
      };
    }

    // Check if it's in quotes (likely a component label)
    if (remaining.match(/^"[^"]*"/)) {
      return {
        type: 'string',
        length: identifier.length
      };
    }

    // Default to parameter/variable
    return {
      type: 'parameter',
      length: identifier.length
    };
  }

  // Match string literals
  const stringMatch = remaining.match(/^"([^"\\]|\\.)*"/);
  if (stringMatch) {
    return {
      type: 'string',
      length: stringMatch[0].length
    };
  }

  // Match numbers
  const numberMatch = remaining.match(/^\d+(\.\d+)?/);
  if (numberMatch) {
    return {
      type: 'number',
      length: numberMatch[0].length
    };
  }

  // Match operators and punctuation
  const operatorMatch = remaining.match(/^[\{\}\[\]\(\)=+\-*/<>!&|%^~?:;,.]/);
  if (operatorMatch) {
    return {
      type: 'operator',
      length: 1
    };
  }

  // Skip whitespace
  const whitespaceMatch = remaining.match(/^\s+/);
  if (whitespaceMatch) {
    return {
      type: 'parameter', // dummy type, will be skipped
      length: 0,
      skipLength: whitespaceMatch[0].length
    };
  }

  // No match found, skip this character
  return {
    type: 'parameter', // dummy type
    length: 0,
    skipLength: 1
  };
}

/**
 * Get the index of a token type in the legend
 */
function getTokenTypeIndex(type: TokenType): number {
  return tokenTypes.indexOf(type);
}

/**
 * Get the bitmask for token modifiers
 */
function getTokenModifierBitmask(modifiers: TokenModifier[]): number {
  let bitmask = 0;
  for (const modifier of modifiers) {
    const index = tokenModifiers.indexOf(modifier);
    if (index >= 0) {
      bitmask |= (1 << index);
    }
  }
  return bitmask;
}

/**
 * Provide semantic tokens for a document
 */
export function provideSemanticTokens(
  params: SemanticTokensParams,
  documents: TextDocuments<TextDocument>
): SemanticTokens {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return { data: [] };
  }

  try {
    return getSemanticTokens(document);
  } catch (error) {
    console.error('Error providing semantic tokens:', error);
    return { data: [] };
  }
}

/**
 * Provide semantic tokens range (for incremental updates)
 */
export function provideSemanticTokensRange(
  params: any, // SemanticTokensRangeParams
  documents: TextDocuments<TextDocument>
): SemanticTokens {
  // For now, just provide full tokens
  // In a full implementation, you'd only provide tokens for the requested range
  return provideSemanticTokens(params, documents);
}