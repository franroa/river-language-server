import { TextDocument } from "vscode-languageserver-textdocument";
import * as fs from "fs";
import * as path from "path";
import { inferArgumentTypeFromUsageEnhanced } from "./argumentTypeInference";

/**
 * Type information for arguments and exports
 */
export interface TypeInfo {
  type: string;
  description?: string;
  required?: boolean;
}

/**
 * Context for type inference within declare blocks
 */
export interface DeclareBlockContext {
  name: string;
  arguments: Map<string, TypeInfo>;
  exports: Map<string, TypeInfo>;
  components: Array<{ name: string; label: string; range: any }>;
}

/**
 * Component parameter information from JSON files
 */
export interface ComponentParameter {
  name: string;
  type: string;
  description?: string;
  required?: boolean;
  default?: string;
}

/**
 * Component information loaded from JSON files
 */
export interface ComponentInfo {
  name: string;
  parameters: ComponentParameter[];
  exportedFields: Array<{ name: string; type: string; description?: string }>;
}

// Component cache to avoid repeated file reads
const componentCache = new Map<string, ComponentInfo | null>();

/**
 * Clear the component cache (useful for testing or when files change)
 */
export function clearComponentCache(): void {
  componentCache.clear();
}

/**
 * Load component information from JSON file
 */
export function loadComponentInfo(componentName: string): ComponentInfo | null {
  // Check cache first
  if (componentCache.has(componentName)) {
    return componentCache.get(componentName)!;
  }

  try {
    // Skip special keywords that aren't actual components
    if (componentName === 'declare' || componentName === 'argument' || componentName === 'export') {
      componentCache.set(componentName, null);
      return null;
    }

    // Convert component name to filename (e.g., "prometheus.scrape" -> "prometheus_scrape.json")
    const fileName = componentName.replace(/\./g, '_') + '.json';
    
    // Try to find the components directory - handle both source and compiled contexts
    let srcComponentsPath = path.resolve(__dirname, 'components');
    if (!fs.existsSync(srcComponentsPath)) {
      srcComponentsPath = path.resolve(__dirname, '..', 'src', 'components');
    }
    if (!fs.existsSync(srcComponentsPath)) {
      srcComponentsPath = path.resolve(__dirname, '..', '..', 'src', 'components');
    }
    
    const filePath = path.join(srcComponentsPath, fileName);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      componentCache.set(componentName, null);
      return null;
    }

    // Read and parse the JSON file
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const componentData = JSON.parse(fileContent);

    // Extract parameters
    const parameters: ComponentParameter[] = [];

    // Extract parameters from the arguments array (legacy format)
    if (componentData.arguments && Array.isArray(componentData.arguments)) {
      for (const arg of componentData.arguments) {
        parameters.push({
          name: arg.name,
          type: arg.type,
          description: arg.description,
          required: arg.required === true,
          default: arg.default !== "" ? arg.default : undefined,
        });
      }
    }

    // Extract parameters from arguments object (lsp_structure format)
    if (componentData.arguments && typeof componentData.arguments === 'object' && !Array.isArray(componentData.arguments)) {
      for (const argName in componentData.arguments) {
        const arg = componentData.arguments[argName];
        parameters.push({
          name: argName,
          type: arg.type,
          description: arg.description,
          required: arg.required === true,
          default: arg.default !== "" ? arg.default : undefined,
        });
      }
    }

    // Extract parameters from blocks (lsp_structure format)
    if (componentData.blocks) {
      extractNestedBlockParameters(componentData.blocks, parameters);
    }

    // Extract parameters from nested blocks in lsp_structure (legacy)
    if (componentData.lsp_structure?.blocks) {
      extractNestedBlockParameters(componentData.lsp_structure.blocks, parameters);
    }

    // Extract exported fields
    const exportedFields: Array<{ name: string; type: string; description?: string }> = [];
    if (componentData.exported_fields && Array.isArray(componentData.exported_fields)) {
      for (const field of componentData.exported_fields) {
        exportedFields.push({
          name: field.name,
          type: field.type,
          description: field.description,
        });
      }
    }

    const componentInfo: ComponentInfo = {
      name: componentName,
      parameters,
      exportedFields,
    };

    // Cache the result
    componentCache.set(componentName, componentInfo);
    return componentInfo;

  } catch (error) {
    // Silently handle errors to avoid breaking LSP protocol
    componentCache.set(componentName, null);
    return null;
  }
}

/**
 * Extract parameters from nested blocks recursively
 */
function extractNestedBlockParameters(blocks: any, parameters: ComponentParameter[], prefix = ''): void {
  for (const blockName in blocks) {
    const block = blocks[blockName];
    const blockPrefix = prefix ? `${prefix}.${blockName}` : blockName;
    
    // Add arguments from this block
    if (block.arguments && Array.isArray(block.arguments)) {
      for (const arg of block.arguments) {
        parameters.push({
          name: `${blockPrefix}.${arg.name}`,
          type: arg.type,
          description: arg.description,
          required: arg.required === true,
          default: arg.default !== "" ? arg.default : undefined,
        });
      }
    }
    
    // Recursively process nested blocks
    if (block.children) {
      extractNestedBlockParameters(block.children, parameters, blockPrefix);
    }
  }
}

/**
 * Find the current block context (e.g., "stage.labels") for a given line
 */
function findCurrentBlockContext(document: TextDocument, lineIndex: number): string | null {
  const text = document.getText();
  const lines = text.split('\n');

  let blockStack: Array<{name: string, braceLevel: number}> = [];
  let braceCount = 0;

  for (let i = 0; i <= lineIndex; i++) {
    const line = lines[i];
    
    // Skip comment lines
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith('//') || trimmedLine.startsWith('#')) {
      continue;
    }
    
    // Look for block openings (e.g., "stage.labels {", "prometheus.scrape \"name\" {")
    const blockMatch = line.match(/^\s*(\w+(?:\.\w+)*)\s*(?:"[^"]*")?\s*\{/);
    if (blockMatch) {
      const blockName = blockMatch[1];
      braceCount++; // Count the opening brace from the block declaration
      blockStack.push({name: blockName, braceLevel: braceCount});
      continue;
    }
    
    // Count braces to track when blocks end
    let inString = false;
    let stringChar = '';
    
    for (const char of line) {
      if (!inString && (char === '"' || char === "'")) {
        inString = true;
        stringChar = char;
      } else if (inString && char === stringChar) {
        inString = false;
        stringChar = '';
      } else if (!inString) {
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          // Only pop from blockStack if we've returned to the level where a block was opened
          while (blockStack.length > 0 && blockStack[blockStack.length - 1].braceLevel > braceCount) {
            blockStack.pop();
          }
        }
      }
    }
  }

  // Return the current block path excluding the component itself
  // For example, in "loki.process { stage.labels { values = ... } }"
  // we want to return "stage.labels" when inside the stage.labels block
  const blockNames = blockStack.map(block => block.name);
  return blockNames.length > 1 ? blockNames.slice(1).join('.') : null;
}

/**
 * Find the component that contains the given line
 */
export function findComponentForLine(document: TextDocument, lineIndex: number): string | null {
  const text = document.getText();
  const lines = text.split('\n');

  let braceCount = 0;
  let currentComponent: string | null = null;
  let componentBraceLevel = 0;

  for (let i = 0; i <= lineIndex; i++) {
    const line = lines[i];

    // Look for component declarations, including indented ones in declare blocks
    const componentMatch = line.match(/^\s*(\w+(?:\.\w+)*)\s*"[^"]*"\s*{/);
    if (componentMatch) {
      currentComponent = componentMatch[1];
      componentBraceLevel = braceCount + 1;
    }

    // Count braces to track nesting
    for (const char of line) {
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;
    }

    // If we've closed back to the level before this component, we're outside it
    if (currentComponent && braceCount < componentBraceLevel) {
      currentComponent = null;
      componentBraceLevel = 0;
    }
  }

  return currentComponent;
}

/**
 * Get the expected parameter type based on component definition and declare block context
 */
export function getExpectedParameterType(document: TextDocument, lineIndex: number, parameterName: string): string | null {
  // PRIORITY 1: Component JSON-defined types (normal components)
  const componentName = findComponentForLine(document, lineIndex);
  if (componentName) {
    const componentInfo = loadComponentInfo(componentName);
    if (componentInfo) {
      // First, try to determine the current block context
      const blockContext = findCurrentBlockContext(document, lineIndex);
      if (blockContext) {
        // Look for parameter with full block path (e.g., "stage.labels.values")
        const fullParameterName = `${blockContext}.${parameterName}`;
        const parameter = componentInfo.parameters.find(p => p.name === fullParameterName);
        if (parameter) {
          return parameter.type;
        }
      }
      
       // Check direct parameters
       const parameter = componentInfo.parameters.find(p => p.name === parameterName);
       if (parameter) {
         return parameter.type;
       }

       // Check nested block parameters in the current context
       if (blockContext) {
         const contextParameter = componentInfo.parameters.find(p => p.name.startsWith(`${blockContext}.`) && p.name.endsWith(`.${parameterName}`));
         if (contextParameter) {
           return contextParameter.type;
         }
       }
    }
  }

  // PRIORITY 2: Declare block context (custom components and declare blocks)
  const declareContext = findDeclareBlockContext(document, lineIndex);
  if (declareContext) {
    // Check if this is an argument in a declare block
    if (declareContext.arguments.has(parameterName)) {
      const argType = declareContext.arguments.get(parameterName)?.type;
      return argType && argType !== 'unknown' ? argType : null;
    }
    
    // Check if this is an export in a declare block
    if (declareContext.exports.has(parameterName)) {
      return declareContext.exports.get(parameterName)?.type || null;
    }
  }

  // PRIORITY 3: Custom component instance context
  const customComponentContext = findCustomComponentContext(document, lineIndex);
  if (customComponentContext) {
    const declareBlock = findDeclareBlockByName(document, customComponentContext.declareBlockName);
    if (declareBlock && declareBlock.arguments.has(parameterName)) {
      const argType = declareBlock.arguments.get(parameterName)?.type;
      return argType && argType !== 'unknown' ? argType : null;
    }
  }

  return null;
}

/**
 * Get the type of an argument.value expression
 * This should return the same type as the argument itself
 */
export function getArgumentValueType(document: TextDocument, argumentValueExpr: string): string | null {
  const argName = argumentValueExpr.match(/argument\.([^.]+)\.value/)?.[1];
  if (!argName) {
    return null;
  }

  // Find the argument type from declare blocks
  const declareBlocks = getAllDeclareBlocks(document);
  for (const declareBlock of declareBlocks) {
    if (declareBlock.arguments.has(argName)) {
      const argInfo = declareBlock.arguments.get(argName);
      if (argInfo && argInfo.type !== 'unknown') {
        return argInfo.type; // argument.name.value has the same type as the argument
      }
    }
  }

  return null;
}

/**
 * Find the declare block context for a given line
 */
function findDeclareBlockContext(document: TextDocument, lineIndex: number): DeclareBlockContext | null {
  const text = document.getText();
  const lines = text.split('\n');

  let braceCount = 0;
  let inDeclareBlock = false;
  let currentDeclareBlock: string | null = null;

  for (let i = 0; i <= lineIndex; i++) {
    const line = lines[i];

    // Check for declare block start
    const declareMatch = line.match(/^\s*declare\s*"([^"]+)"\s*{/);
    if (declareMatch) {
      inDeclareBlock = true;
      currentDeclareBlock = declareMatch[1];
      braceCount = 1;
      continue;
    }

    if (!inDeclareBlock) continue;

    // Count braces
    for (const char of line) {
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;
    }

    // Exit declare block
    if (braceCount === 0) {
      inDeclareBlock = false;
      currentDeclareBlock = null;
    }
  }

  if (inDeclareBlock && currentDeclareBlock) {
    return parseDeclareBlock(document, currentDeclareBlock);
  }

  return null;
}

/**
 * Find custom component context (instantiation of declare block)
 */
function findCustomComponentContext(document: TextDocument, lineIndex: number): { declareBlockName: string; instanceName: string } | null {
  const text = document.getText();
  const lines = text.split('\n');

  let braceCount = 0;
  let inCustomComponent = false;
  let currentDeclareBlockName: string | null = null;
  let currentInstanceName: string | null = null;

  for (let i = 0; i <= lineIndex; i++) {
    const line = lines[i];

    // Check for custom component instantiation (single word followed by string)
    const customMatch = line.match(/^\s*(\w+)\s*"([^"]+)"\s*{/);
    if (customMatch) {
      const potentialDeclareBlockName = customMatch[1];
      const instanceName = customMatch[2];
      
      // Check if this matches a declare block (not a normal component like prometheus.scrape)
      if (!potentialDeclareBlockName.includes('.') && isDeclareBlockDefined(document, potentialDeclareBlockName)) {
        inCustomComponent = true;
        currentDeclareBlockName = potentialDeclareBlockName;
        currentInstanceName = instanceName;
        braceCount = 1;
        continue;
      }
    }

    if (!inCustomComponent) continue;

    // Count braces
    for (const char of line) {
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;
    }

    // Exit custom component
    if (braceCount === 0) {
      inCustomComponent = false;
      currentDeclareBlockName = null;
      currentInstanceName = null;
    }
  }

  if (inCustomComponent && currentDeclareBlockName) {
    return { declareBlockName: currentDeclareBlockName, instanceName: currentInstanceName || '' };
  }

  return null;
}

/**
 * Check if a declare block is defined in the document
 */
function isDeclareBlockDefined(document: TextDocument, declareBlockName: string): boolean {
  const text = document.getText();
  const lines = text.split('\n');

  for (const line of lines) {
    const declareMatch = line.match(/^\s*declare\s*"([^"]+)"\s*{/);
    if (declareMatch && declareMatch[1] === declareBlockName) {
      return true;
    }
  }

  return false;
}

/**
 * Parse a declare block to extract argument and export types
 */
export function parseDeclareBlock(document: TextDocument, declareBlockName: string): DeclareBlockContext | null {
  const text = document.getText();
  const lines = text.split('\n');

  const context: DeclareBlockContext = {
    name: declareBlockName,
    arguments: new Map(),
    exports: new Map(),
    components: [],
  };

  let inDeclareBlock = false;
  let braceCount = 0;
  let declareStartLine = -1;

  // Find the declare block
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!inDeclareBlock) {
      const declareMatch = line.match(/^\s*declare\s*"([^"]+)"\s*{/);
      if (declareMatch && declareMatch[1] === declareBlockName) {
        inDeclareBlock = true;
        braceCount = 1;
        declareStartLine = i;
        continue;
      }
    } else {
      // Count braces
      for (const char of line) {
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
      }

      // Exit declare block
      if (braceCount === 0) {
        break;
      }

      // Parse argument declarations - defer type inference until after parsing the full block
      const argMatch = line.match(/^\s*argument\s*"([^"]+)"\s*{/);
      if (argMatch) {
        const argName = argMatch[1];
        // Initially set as unknown, will be inferred after parsing the full declare block
        context.arguments.set(argName, { type: 'unknown', description: `Argument ${argName}` });
      }

      // Parse export declarations
      const exportMatch = line.match(/^\s*export\s*"([^"]+)"\s*{/);
      if (exportMatch) {
        const exportName = exportMatch[1];
        // Look for value assignment in the next few lines
        const exportType = findExportType(lines, i, exportName);
        context.exports.set(exportName, { type: exportType || 'any', description: `Export ${exportName}` });
      }

      // Parse component declarations within declare block
      const componentMatch = line.match(/^\s*(\w+(?:\.\w+)*)\s*"([^"]*)"\s*{/);
      if (componentMatch) {
        context.components.push({
          name: componentMatch[1],
          label: componentMatch[2],
          range: { start: { line: i }, end: { line: i } }, // Simplified range
        });
      }
    }
  }

  // Now infer argument types from their usage in the declare block using enhanced logic
  for (const [argName, argInfo] of context.arguments.entries()) {
    const inferredType = inferArgumentTypeFromUsageEnhanced(text, argName, declareStartLine, lines.length);
    if (inferredType) {
      context.arguments.set(argName, { ...argInfo, type: inferredType });
    } else {
      // Default to string if we can't infer the type
      context.arguments.set(argName, { ...argInfo, type: 'string' });
    }
  }

  return context;
}

/**
 * Find declare block by name
 */
function findDeclareBlockByName(document: TextDocument, declareBlockName: string): DeclareBlockContext | null {
  return parseDeclareBlock(document, declareBlockName);
}

/**
 * Infer argument type from its usage within a declare block
 */
function inferArgumentTypeFromUsage(text: string, argName: string, startLine: number, endLine: number): string | null {
  const lines = text.split('\n');
  const searchLines = lines.slice(startLine, Math.min(endLine, lines.length));

  for (let i = 0; i < searchLines.length; i++) {
    const line = searchLines[i];
    const argumentUsagePattern = new RegExp(`argument\\.${argName}\\.value`);
    
    if (argumentUsagePattern.test(line)) {
      // Pattern 1: Direct assignment to component parameter
      const directAssignmentMatch = line.match(/^\s*(\w+)\s*=\s*.*argument\.\w+\.value/);
      if (directAssignmentMatch) {
        const parameterName = directAssignmentMatch[1];
        
        // Get the component context to determine parameter type
        const componentMatch = findComponentInPreviousLines(searchLines, i);
        if (componentMatch) {
          const componentInfo = loadComponentInfo(componentMatch);
          if (componentInfo) {
            const param = componentInfo.parameters.find(p => p.name === parameterName || p.name.endsWith(`.${parameterName}`));
            if (param) {
              return param.type;
            }
          }
        }
      }

      // Pattern 2: Used in forward_to (list context) - infer receiver type
      if (line.includes('forward_to') && line.includes('[')) {
        // Determine receiver type based on context
        const componentMatch = findComponentInPreviousLines(searchLines, i);
        if (componentMatch) {
          if (componentMatch.includes('loki')) {
            return 'LogsReceiver';
          } else if (componentMatch.includes('prometheus') || componentMatch.includes('mimir')) {
            return 'MetricsReceiver';
          }
        }
        return 'MetricsReceiver'; // Default assumption
      }

      // Pattern 3: String concatenation
      if (line.includes(' + ') || (line.includes('+') && line.includes('"'))) {
        return 'string';
      }

      // Pattern 4: Map value assignment
      if (line.match(/^\s*"[^"]+"\s*=\s*.*argument\.\w+\.value/)) {
        return 'string';
      }

      // Pattern 5: URL assignment or other string contexts
      if (line.includes('url =') || line.includes('host =') || line.includes('path =') || line.includes('instance =')) {
        return 'string';
      }

      // Pattern 6: Port or numeric contexts
      if (line.includes('port =') || line.includes('timeout =') || line.includes('interval =')) {
        return 'string'; // Ports are often strings in Alloy (e.g., "8080")
      }

      // Pattern 7: Used in external_labels map context
      if (line.includes('external_labels') || line.match(/^\s*"[^"]+"\s*=\s*.*argument\.\w+\.value/)) {
        return 'string';
      }
    }
  }

  // Default to string if we can't determine the type
  return 'string';
}

/**
 * Find component name from previous lines
 */
function findComponentInPreviousLines(lines: string[], currentIndex: number): string | null {
  // Look backwards for component declaration
  for (let i = currentIndex; i >= Math.max(0, currentIndex - 10); i--) {
    const line = lines[i];
    const componentMatch = line.match(/^\s*(\w+(?:\.\w+)*)\s*"[^"]*"\s*{/);
    if (componentMatch) {
      return componentMatch[1];
    }
  }
  return null;
}

/**
 * Find export type by analyzing its value assignment
 */
function findExportType(lines: string[], exportStartLine: number, _exportName: string): string | null {
  // Look for value assignment in the next few lines
  for (let i = exportStartLine + 1; i < Math.min(exportStartLine + 5, lines.length); i++) {
    const line = lines[i];
    const valueMatch = line.match(/^\s*value\s*=\s*(.+)$/);
    if (valueMatch) {
      const value = valueMatch[1].trim().replace(/,$/, ''); // Remove trailing comma
      return inferTypeFromValue(value);
    }
    
    // Stop if we hit a closing brace
    if (line.trim() === '}') break;
  }
  return null;
}

/**
 * Infer type from value assignment
 */
export function inferTypeFromValue(value: string, document?: TextDocument): string | null {
  value = value.trim();

  // Remove trailing comma if present
  if (value.endsWith(',')) {
    value = value.slice(0, -1).trim();
  }

  // String literals
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return 'string';
  }

  // Numbers
  if (/^\d+$/.test(value)) {
    return 'number';
  }

  if (/^\d+\.\d+$/.test(value)) {
    return 'number';
  }

  // Booleans
  if (value === 'true' || value === 'false') {
    return 'bool';
  }

  // Duration (common in Alloy)
  if (/^\d+[smhd]$/.test(value)) {
    return 'duration';
  }

  // Arrays/lists - try to infer element type
  if (value.startsWith('[') && value.endsWith(']')) {
    const innerContent = value.slice(1, -1).trim();
    if (innerContent === '') {
      return 'list'; // Empty list
    }
    
    // Try to infer element type from first element
    const elementType = inferElementTypeFromListContent(innerContent, document);
    return elementType ? `list(${elementType})` : 'list';
  }

  // Objects/maps
  if (value.startsWith('{') && value.endsWith('}')) {
    return 'map';
  }

  // Component references (e.g., prometheus.remote_write.default.receiver)
  if (/^\w+\.\w+\.\w+/.test(value)) {
    return inferTypeFromComponentReference(value, document);
  }

  // Argument references (e.g., argument.loki_url.value)
  if (value.startsWith('argument.') && value.endsWith('.value')) {
    if (document) {
      // Use the dedicated function to get argument value type
      const argumentType = getArgumentValueType(document, value);
      if (argumentType) {
        return argumentType; // Return the same type as the argument
      }
    }
    return 'string'; // Default assumption for argument references
  }

  // If we can't determine the type, return unknown instead of null
  return 'unknown';
}

/**
 * Infer type from component reference
 */
function inferTypeFromComponentReference(reference: string, document?: TextDocument): string | null {
  const parts = reference.split('.');

  // Handle declared component instance references (e.g., main.basicservice_local_local.mimir_write_default_receiver)
  if (parts.length === 3) {
    const [declareBlockName, instanceName, exportName] = parts;
    return inferTypeFromDeclaredComponentExport(exportName, document, declareBlockName);
  }

  // Handle direct component references (e.g., prometheus.remote_write.default.receiver)
  if (parts.length >= 4) {
    const componentType = `${parts[0]}.${parts[1]}`;
    const fieldName = parts[parts.length - 1];

    const componentInfo = loadComponentInfo(componentType);
    if (componentInfo) {
      const exportedField = componentInfo.exportedFields.find(f => f.name === fieldName);
      if (exportedField) {
        return exportedField.type;
      }
    }
  }

  return null;
}

/**
 * Infer type from declared component export
 */
function inferTypeFromDeclaredComponentExport(exportName: string, document?: TextDocument, declareBlockName?: string): string | null {
  // If we have a document and declare block name, try to parse the actual declare block
  if (document && declareBlockName) {
    const declareBlock = parseDeclareBlock(document, declareBlockName);
    if (declareBlock && declareBlock.exports.has(exportName)) {
      return declareBlock.exports.get(exportName)?.type || null;
    }
  }

  // Fallback to common patterns
  const exportTypePatterns: Record<string, string> = {
    'loki_write_default_receiver': 'LogsReceiver',
    'mimir_write_default_receiver': 'MetricsReceiver',
    'prometheus_remote_write_default_receiver': 'MetricsReceiver',
    'loki_write_receiver': 'LogsReceiver',
    'prometheus_write_receiver': 'MetricsReceiver',
    'mimir_receiver': 'MetricsReceiver',
  };

  if (exportName in exportTypePatterns) {
    return exportTypePatterns[exportName];
  }

  // Infer from name patterns
  if (exportName.includes('loki') && exportName.includes('receiver')) {
    return 'LogsReceiver';
  }

  if ((exportName.includes('prometheus') || exportName.includes('mimir')) && exportName.includes('receiver')) {
    return 'MetricsReceiver';
  }

  return null;
}

/**
 * Get all declare blocks in a document
 */
export function getAllDeclareBlocks(document: TextDocument): DeclareBlockContext[] {
  const text = document.getText();
  const lines = text.split('\n');
  const declareBlocks: DeclareBlockContext[] = [];

  for (const line of lines) {
    const declareMatch = line.match(/^\s*declare\s*"([^"]+)"\s*{/);
    if (declareMatch) {
      const declareBlock = parseDeclareBlock(document, declareMatch[1]);
      if (declareBlock) {
        declareBlocks.push(declareBlock);
      }
    }
  }

  return declareBlocks;
}

/**
 * Get all custom component instances in a document
 */
export function getAllCustomComponents(document: TextDocument): Array<{ declareBlockName: string; instanceName: string; line: number }> {
  const text = document.getText();
  const lines = text.split('\n');
  const customComponents: Array<{ declareBlockName: string; instanceName: string; line: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const customMatch = line.match(/^\s*(\w+)\s*"([^"]+)"\s*{/);
    if (customMatch) {
      const potentialDeclareBlockName = customMatch[1];
      const instanceName = customMatch[2];
      
      // Check if this matches a declare block (not a normal component like prometheus.scrape)
      if (!potentialDeclareBlockName.includes('.') && isDeclareBlockDefined(document, potentialDeclareBlockName)) {
        customComponents.push({
          declareBlockName: potentialDeclareBlockName,
          instanceName,
          line: i,
        });
      }
    }
  }

  return customComponents;
}

/**
 * Infer element type from list content
 */
function inferElementTypeFromListContent(content: string, document?: TextDocument): string | null {
  if (!content.trim()) {
    return null;
  }

  // Parse the first element to determine type
  const elements = parseListElements(content);
  if (elements.length === 0) {
    return null;
  }

  const firstElement = elements[0].trim();
  
  // If it's an argument reference, try to resolve its type
  if (firstElement.startsWith('argument.') && firstElement.endsWith('.value')) {
    if (document) {
      const argName = firstElement.match(/argument\.([^.]+)\.value/)?.[1];
      if (argName) {
        const declareBlocks = getAllDeclareBlocks(document);
        for (const declareBlock of declareBlocks) {
          if (declareBlock.arguments.has(argName)) {
            return declareBlock.arguments.get(argName)?.type || 'string';
          }
        }
      }
    }
    return 'string'; // Default for argument references
  }

  // If it's a component reference, infer its type
  if (/^\w+\.\w+\.\w+/.test(firstElement)) {
    return inferTypeFromComponentReference(firstElement, document);
  }

  // Otherwise use basic value type inference
  return inferTypeFromValue(firstElement, document);
}

/**
 * Parse list elements handling nested structures
 */
function parseListElements(content: string): string[] {
  const elements: string[] = [];
  let current = '';
  let depth = 0;
  let inString = false;
  let stringChar = '';

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
        elements.push(current.trim());
        current = '';
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

  if (current.trim()) {
    elements.push(current.trim());
  }

  return elements;
}

/**
 * Find the type of an argument in the document by looking through all declare blocks
 */
function findArgumentTypeInDocument(document: TextDocument, argName: string): string | null {
  const declareBlocks = getAllDeclareBlocks(document);
  
  for (const declareBlock of declareBlocks) {
    if (declareBlock.arguments.has(argName)) {
      const argInfo = declareBlock.arguments.get(argName);
      if (argInfo && argInfo.type !== 'unknown') {
        return argInfo.type;
      }
    }
  }
  
  return null;
}