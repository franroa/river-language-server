import {
  InlayHint,
  InlayHintParams,
  InlayHintKind,
  TextDocuments,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as utils from "./utils";
import * as fs from "fs";
import * as path from "path";

/**
 * Provide inlay hints for a document
 */
export function provideInlayHints(
  params: InlayHintParams,
  documents: TextDocuments<TextDocument>
): InlayHint[] {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }

  const hints: InlayHint[] = [];

  try {
    // Get the document text and parse it
    const text = document.getText();
    const lines = text.split('\n');

    // Process each line for inlay hints
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const lineHints = processLineForInlayHints(line, lineIndex, document);
      hints.push(...lineHints);
    }

    // Component-level hints removed to prevent hints after opening brace

  } catch (error) {
    console.error('Error providing inlay hints:', error);
  }

  return hints;
}

/**
 * Process a single line for inlay hints
 */
function processLineForInlayHints(line: string, lineIndex: number, document: TextDocument): InlayHint[] {
  const hints: InlayHint[] = [];

  // Look for argument assignments that could benefit from type hints
  const argAssignmentPattern = /(\w+)\s*=\s*(.+)$/g;
  let match;

  while ((match = argAssignmentPattern.exec(line)) !== null) {
    const argName = match[1];
    const value = match[2].trim();
    const argStart = match.index;

    // Check if this is a component argument assignment
    if (isInsideComponentBlock(document, lineIndex)) {
      // Try to get the expected type from component data first
      const expectedType = getExpectedArgumentType(document, lineIndex, argName);
      
      if (expectedType) {
        // Find the position right before the value starts
        const equalsIndex = line.indexOf('=', argStart);
        if (equalsIndex !== -1) {
          // Find where the value actually starts (skip whitespace after equals)
          let valueStartPos = equalsIndex + 1;
          while (valueStartPos < line.length && line[valueStartPos] === ' ') {
            valueStartPos++;
          }
          
          hints.push({
            position: { line: lineIndex, character: valueStartPos },
            label: `${expectedType}  `,
            kind: InlayHintKind.Type,
            paddingLeft: false,
            paddingRight: false,
          });
        }
      } else {
        // Fallback to inferred type after equals
        const typeHint = inferValueType(value);
        if (typeHint) {
          const equalsIndex = line.indexOf('=', argStart);
          if (equalsIndex !== -1) {
            const afterEqualsPos = equalsIndex + 1;
            hints.push({
              position: { line: lineIndex, character: afterEqualsPos },
              label: `: ${typeHint}`,
              kind: InlayHintKind.Type,
              paddingLeft: true,
            });
          }
        }
      }
    }
  }

  // Look for argument references that could show parameter info
  const argRefPattern = /argument\.(\w+)\.value/g;
  while ((match = argRefPattern.exec(line)) !== null) {
    const argName = match[1];
    const argInfo = getArgumentInfo(document, argName);

    if (argInfo) {
      const hintStart = match.index + match[0].length;
      hints.push({
        position: { line: lineIndex, character: hintStart },
        label: ` (${argInfo.type}${argInfo.optional ? ', optional' : ''})`,
        kind: InlayHintKind.Type,
        paddingLeft: true,
      });
    }
  }

  return hints;
}

/**
 * Get inlay hints for component arguments
 */
function getComponentArgumentHints(document: TextDocument): InlayHint[] {
  const hints: InlayHint[] = [];
  const text = document.getText();

  // Find all component blocks
  const componentPattern = /(\w+(?:\.\w+)*)\s*"[^"]*"\s*{/g;
  let match;

  while ((match = componentPattern.exec(text)) !== null) {
    const componentName = match[1];
    const blockStart = match.index + match[0].length - 1; // Position of opening brace

    // Get component information
    const componentInfo = getComponentInfo(componentName);
    if (componentInfo && componentInfo.parameters) {
      // Find the position after the opening brace
      const position = document.positionAt(blockStart + 1);

      // Add parameter hints for the first few parameters
      const maxHints = 3; // Limit to avoid clutter
      for (let i = 0; i < Math.min(componentInfo.parameters.length, maxHints); i++) {
        const param = componentInfo.parameters[i];
        if (param.name && param.type) {
          hints.push({
            position,
            label: `${param.name}: ${param.type}${param.optional ? ' (optional)' : ''}${param.default !== undefined ? ` = ${param.default}` : ''}`,
            kind: InlayHintKind.Parameter,
            paddingLeft: false,
            paddingRight: true,
          });
        }
      }
    }
  }

  return hints;
}

/**
 * Check if a line is inside a component block
 */
function isInsideComponentBlock(document: TextDocument, lineIndex: number): boolean {
  const text = document.getText();
  const lines = text.split('\n');

  let braceCount = 0;
  for (let i = 0; i <= lineIndex; i++) {
    const line = lines[i];
    for (const char of line) {
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;
    }
  }

  return braceCount > 0;
}

/**
 * Get the expected type for an argument based on component data
 */
function getExpectedArgumentType(document: TextDocument, lineIndex: number, argName: string): string | null {
  // Find the component this argument belongs to
  const componentName = findComponentForLine(document, lineIndex);
  if (!componentName) {
    return null;
  }

  // Get component information
  const componentInfo = getComponentInfo(componentName);
  if (!componentInfo || !componentInfo.parameters) {
    return null;
  }

  // Find the parameter with matching name
  const param = componentInfo.parameters.find(p => p.name === argName);
  if (param && param.type) {
    return param.type;
  }

  return null;
}

/**
 * Find the component name that contains the given line
 */
function findComponentForLine(document: TextDocument, lineIndex: number): string | null {
  const text = document.getText();
  const lines = text.split('\n');

  let braceCount = 0;
  let currentComponent: string | null = null;

  for (let i = 0; i <= lineIndex; i++) {
    const line = lines[i];

    // Look for component declarations
    const componentMatch = line.match(/^(\w+(?:\.\w+)*)\s*"[^"]*"\s*{/);
    if (componentMatch) {
      currentComponent = componentMatch[1];
      braceCount = 1; // We found the opening brace
    } else {
      // Count braces to track nesting
      for (const char of line) {
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
      }
    }

    // If we're back at brace level 0, we're outside any component
    if (braceCount === 0) {
      currentComponent = null;
    }
  }

  return currentComponent;
}

/**
 * Infer the type of a value
 */
function inferValueType(value: string): string | null {
  // Check for arrays/lists first
  if (value.startsWith('[') && value.endsWith(']')) {
    return 'list';
  }

  // Remove quotes for string detection
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return 'string';
  }

  // Check for numbers
  if (/^\d+$/.test(value)) {
    return 'number';
  }

  if (/^\d+\.\d+$/.test(value)) {
    return 'number';
  }

  // Check for booleans
  if (value === 'true' || value === 'false') {
    return 'boolean';
  }

  // Check for duration (common in Alloy)
  if (/^\d+[smhd]$/.test(value)) {
    return 'duration';
  }

  // Check for argument references
  if (value.startsWith('argument.') && value.endsWith('.value')) {
    return 'argument';
  }

  return null;
}

/**
 * Get information about an argument from declare blocks
 */
function getArgumentInfo(document: TextDocument, argName: string): { type?: string; optional?: boolean } | null {
  const declaredComponents = utils.getDeclaredComponents(document);

  for (const componentData of Object.values(declaredComponents)) {
    const declareStructure = utils.extractDeclareStructure(componentData);
    if (declareStructure.arguments && declareStructure.arguments[argName]) {
      const argInfo = declareStructure.arguments[argName] as any;
      return {
        type: argInfo.type || 'unknown',
        optional: argInfo.optional === true,
      };
    }
  }

  return null;
}

/**
 * Get information about a component from JSON files
 */
function getComponentInfo(componentName: string): { parameters?: Array<{ name: string; type?: string; optional?: boolean; default?: any }> } | null {
  try {
    // Convert component name to filename (e.g., "prometheus.scrape" -> "prometheus_scrape.json")
    const fileName = componentName.replace(/\./g, '_') + '.json';
    const filePath = path.join(__dirname, 'components', fileName);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return null;
    }

    // Read and parse the JSON file
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const componentData = JSON.parse(fileContent);

    // Extract parameters from the arguments array
    if (componentData.arguments && Array.isArray(componentData.arguments)) {
      const parameters = componentData.arguments.map((arg: any) => ({
        name: arg.name,
        type: arg.type,
        optional: !arg.required,
        default: arg.default !== "" ? arg.default : undefined,
      }));

      return { parameters };
    }

    return null;
  } catch (error) {
    console.error(`Error reading component info for ${componentName}:`, error);
    return null;
  }
}

/**
 * Provide inlay hints range (for incremental updates)
 */
export function provideInlayHintsRange(
  params: InlayHintParams,
  documents: TextDocuments<TextDocument>
): InlayHint[] {
  // For now, provide full hints
  // In a full implementation, you'd filter to the requested range
  return provideInlayHints(params, documents);
}