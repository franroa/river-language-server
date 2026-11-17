import {
  InlayHint,
  InlayHintParams,
  InlayHintKind,
  TextDocuments,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as fs from "fs";
import * as path from "path";
import * as TypeInference from "./typeInference";
import { inferArgumentTypeFromUsageEnhanced } from "./argumentTypeInference";

interface ComponentParameter {
  name: string;
  type: string;
  required: boolean;
  default?: string;
  description?: string;
}

interface ComponentInfo {
  name: string;
  parameters: ComponentParameter[];
}

const componentCache = new Map<string, ComponentInfo | null>();

/**
 * Create a non-navigable inlay hint (extmark-like behavior)
 * 
 * This function creates inlay hints that are purely visual decorations,
 * similar to extmarks in Neovim. They should not be navigable with hjkl motions.
 * 
 * The key is to avoid any properties that would make the hint interactive:
 * - No textEdits property (would make hint clickable/editable)
 * - No tooltip property (would make hint hoverable)
 * - No data property (would enable hint resolution)
 * - resolveProvider: false in server capabilities
 */
function createDisplayOnlyHint(
  line: number,
  character: number,
  label: string,
  kind: InlayHintKind = InlayHintKind.Type
): InlayHint {
  return {
    position: { line, character },
    label,
    kind,
    paddingLeft: false,
    paddingRight: false,
    // Explicitly omit interactive properties to ensure display-only behavior
  };
}

/**
 * Load component information from JSON file
 */
function loadComponentInfo(componentName: string): ComponentInfo | null {
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
    // Use path.resolve to get absolute path from src directory, not compiled out directory
    const srcComponentsPath = path.resolve(__dirname, '..', 'src', 'components');
    const filePath = path.join(srcComponentsPath, fileName);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      // Don't log missing files as it's normal for many component names
      componentCache.set(componentName, null);
      return null;
    }

    // Read and parse the JSON file
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const componentData = JSON.parse(fileContent);

    // Extract parameters from the arguments array
    const parameters: ComponentParameter[] = [];
    
    if (componentData.arguments && Array.isArray(componentData.arguments)) {
      for (const arg of componentData.arguments) {
        parameters.push({
          name: arg.name,
          type: arg.type,
          required: arg.required === true,
          default: arg.default !== "" ? arg.default : undefined,
          description: arg.description
        });
      }
    }

    const componentInfo: ComponentInfo = {
      name: componentName,
      parameters
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

// Removed unused function - using TypeInference.findComponentForLine instead

/**
 * Check if a line contains a parameter assignment
 */
function parseParameterAssignment(line: string): { name: string; valueStart: number } | null {
  // Match parameter assignments like: parameter_name = value
  const match = line.match(/^\s*(\w+)\s*=/);
  if (!match) {
    return null;
  }

  const parameterName = match[1];
  const equalsIndex = line.indexOf('=');
  
  // Find where the value starts (skip whitespace after equals)
  let valueStart = equalsIndex + 1;
  while (valueStart < line.length && line[valueStart] === ' ') {
    valueStart++;
  }

  return {
    name: parameterName,
    valueStart: valueStart
  };
}

/**
 * Process a single line for inlay hints
 */
function processLineForInlayHints(
  line: string, 
  lineIndex: number, 
  document: TextDocument
): InlayHint[] {
  const hints: InlayHint[] = [];

  // Check for argument declarations first
  const argumentMatch = line.match(/^\s*argument\s*"([^"]+)"\s*{/);
  if (argumentMatch) {
    const argumentName = argumentMatch[1];
    console.error(`[DEBUG] Line ${lineIndex}: Found argument declaration "${argumentName}"`);
    
    // Get the argument type from the declare block context
    const declareContext = findDeclareBlockAtLine(document, lineIndex);
    if (declareContext && declareContext.arguments.has(argumentName)) {
      const argType = declareContext.arguments.get(argumentName)?.type;
      if (argType && argType !== 'unknown') {
        // Position the hint after "argument" and before the quoted name
        const argumentPos = line.indexOf('argument') + 'argument'.length;
        hints.push(createDisplayOnlyHint(
          lineIndex,
          argumentPos,
          `: ${argType}`,
          InlayHintKind.Type
        ));
      }
    }
    return hints;
  }

  // Parse parameter assignment
  const assignment = parseParameterAssignment(line);
  if (!assignment) {
    console.error(`[DEBUG] Line ${lineIndex}: No assignment found in "${line.trim()}"`);
    return hints;
  }
  
  console.error(`[DEBUG] Line ${lineIndex}: Found assignment "${assignment.name}" = ...`);

  // Use the centralized type inference logic
  let parameterType: string | null = TypeInference.getExpectedParameterType(document, lineIndex, assignment.name);
  
  console.error(`[DEBUG] Type inference result for "${assignment.name}": ${parameterType || 'null'}`);
  
  // Fallback to value-based inference if no type found
  if (!parameterType) {
    const assignmentMatch = line.match(/(\w+)\s*=\s*(.+)$/);
    if (assignmentMatch) {
      const value = assignmentMatch[2].trim();
      parameterType = TypeInference.inferTypeFromValue(value, document);
      console.error(`[DEBUG] Using fallback value-based type: ${parameterType}`);
      // Don't show 'unknown' types from fallback
      if (parameterType === 'unknown') {
        parameterType = null;
      }
    }
  }

  // Fallback for common cases if no type was found
  if (!parameterType) {
    // Simple fallback based on parameter name patterns
    if (assignment.name.toLowerCase().includes('url')) {
      parameterType = 'string';
      console.error(`[DEBUG] Using fallback type for URL parameter: ${parameterType}`);
    } else if (assignment.name.toLowerCase().includes('path')) {
      parameterType = 'string';
      console.error(`[DEBUG] Using fallback type for path parameter: ${parameterType}`);
    } else if (assignment.name.toLowerCase().includes('name') || assignment.name.toLowerCase().includes('instance')) {
      parameterType = 'string';
      console.error(`[DEBUG] Using fallback type for name parameter: ${parameterType}`);
    }
  }

  // Create hint if we found a type
  if (parameterType) {
    console.error(`[DEBUG] Creating hint for "${assignment.name}": ${parameterType}`);
    // Position the hint after the parameter name and before the equals sign
    const parameterNameStart = line.indexOf(assignment.name);
    const parameterNameEnd = parameterNameStart + assignment.name.length;
    hints.push(createDisplayOnlyHint(
      lineIndex,
      parameterNameEnd,
      `: ${parameterType}`,
      InlayHintKind.Type
    ));
  } else {
    console.error(`[DEBUG] No type found for "${assignment.name}"`);
  }

  return hints;
}

/**
 * Main function to provide inlay hints for a document
 * 
 * These hints are designed to be display-only (like extmarks) and should not be navigable.
 * We explicitly avoid adding interactive properties like textEdits, tooltip, or resolve data.
 */
export function provideInlayHints(
  params: InlayHintParams,
  documents: TextDocuments<TextDocument>
): InlayHint[] {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    console.error("[DEBUG] Document not found for URI:", params.textDocument.uri);
    return [];
  }

  const hints: InlayHint[] = [];

  try {
    const text = document.getText();
    const lines = text.split('\n');
    
    console.error(`[DEBUG] Processing ${lines.length} lines for inlay hints`);

    // Process each line for inlay hints
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      if (line.trim().length > 0) {
        console.error(`[DEBUG] Line ${lineIndex}: "${line.trim()}"`);
      }
      const lineHints = processLineForInlayHints(line, lineIndex, document);
      if (lineHints.length > 0) {
        console.error(`[DEBUG] Line ${lineIndex} generated ${lineHints.length} hints`);
      }
      hints.push(...lineHints);
    }

    console.error(`[DEBUG] Total hints generated: ${hints.length}`);

  } catch (error) {
    console.error(`[DEBUG] Error in provideInlayHints: ${error}`);
  }

  return hints;
}

/**
 * Provide inlay hints range (for incremental updates)
 */
export function provideInlayHintsRange(
  params: InlayHintParams,
  documents: TextDocuments<TextDocument>
): InlayHint[] {
  // For now, provide full hints
  return provideInlayHints(params, documents);
}

/**
 * Infer type from value assignment
 */
function inferTypeFromValue(value: string): string | null {
  // Remove leading/trailing whitespace
  value = value.trim();
  
  console.error(`[DEBUG] inferTypeFromValue: analyzing "${value}"`);
  
  // String literals
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    console.error(`[DEBUG] inferTypeFromValue: detected string literal`);
    return 'string';
  }
  
  // Numbers
  if (/^\d+$/.test(value)) {
    console.error(`[DEBUG] inferTypeFromValue: detected integer`);
    return 'number';
  }
  
  if (/^\d+\.\d+$/.test(value)) {
    console.error(`[DEBUG] inferTypeFromValue: detected decimal`);
    return 'number';
  }
  
  // Booleans
  if (value === 'true' || value === 'false') {
    console.error(`[DEBUG] inferTypeFromValue: detected boolean`);
    return 'bool';
  }
  
  // Duration (common in Alloy)
  if (/^\d+[smhd]$/.test(value)) {
    console.error(`[DEBUG] inferTypeFromValue: detected duration`);
    return 'duration';
  }
  
  // Arrays/lists
  if (value.startsWith('[') && value.endsWith(']')) {
    console.error(`[DEBUG] inferTypeFromValue: detected list`);
    return 'list';
  }
  
  // Objects/maps
  if (value.startsWith('{') && value.endsWith('}')) {
    console.error(`[DEBUG] inferTypeFromValue: detected map`);
    return 'map';
  }
  
  // Component references (e.g., loki.write.default.receiver or main.instance.export)
  if (/^\w+\.\w+\.\w+/.test(value)) {
    console.error(`[DEBUG] inferTypeFromValue: detected component reference`);
    return inferTypeFromComponentReference(value);
  }
  
  // Argument references (e.g., argument.loki_url.value)
  if (value.startsWith('argument.') && value.endsWith('.value')) {
    console.error(`[DEBUG] inferTypeFromValue: detected argument reference`);
    return 'argument_ref';
  }
  
  console.error(`[DEBUG] inferTypeFromValue: no type detected`);
  return null;
}

/**
 * Infer type from component reference (e.g., prometheus.remote_write.default.receiver or main.instance.export)
 */
function inferTypeFromComponentReference(reference: string): string | null {
  const parts = reference.split('.');
  console.error(`[DEBUG] inferTypeFromComponentReference: analyzing "${reference}" with ${parts.length} parts`);
  
  // Handle declared component instance references (e.g., main.basicservice_local_local.loki_write_default_receiver)
  if (parts.length === 3) {
    const [declareBlockName, instanceName, exportName] = parts;
    console.error(`[DEBUG] Detected declared component instance: declare="${declareBlockName}", instance="${instanceName}", export="${exportName}"`);
    
    // This is a declared component instance reference
    return inferTypeFromDeclaredComponentExport(declareBlockName, exportName);
  }
  
  // Handle direct component references (e.g., loki.write.default.receiver)
  if (parts.length >= 4) {
    const componentType = `${parts[0]}.${parts[1]}`;
    const fieldName = parts[parts.length - 1];
    
    console.error(`[DEBUG] Detected direct component reference: type="${componentType}", field="${fieldName}"`);
    
    // Load component info to get exported field types
    const componentInfo = loadComponentInfo(componentType);
    if (!componentInfo) {
      console.error(`[DEBUG] No component info found for ${componentType}`);
      return null;
    }
    
    // Look for the field in exported_fields in the JSON
    try {
      const fileName = componentType.replace(/\./g, '_') + '.json';
      const srcComponentsPath = path.resolve(__dirname, '..', 'src', 'components');
      const filePath = path.join(srcComponentsPath, fileName);
      
      if (!fs.existsSync(filePath)) {
        console.error(`[DEBUG] Component file not found: ${filePath}`);
        return null;
      }
      
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const componentData = JSON.parse(fileContent);
      
      if (componentData.exported_fields) {
        for (const exportedField of componentData.exported_fields) {
          if (exportedField.name === fieldName) {
            console.error(`[DEBUG] Found exported field type: ${exportedField.type}`);
            return exportedField.type;
          }
        }
      }
      
      // Fallback to lsp_structure if available
      if (componentData.lsp_structure?.exported_fields?.[fieldName]) {
        const type = componentData.lsp_structure.exported_fields[fieldName].type;
        console.error(`[DEBUG] Found exported field type from lsp_structure: ${type}`);
        return type;
      }
    } catch (error) {
      console.error(`[DEBUG] Error reading exported fields for ${componentType}: ${error}`);
    }
  }
  
  console.error(`[DEBUG] No type found for component reference`);
  return null;
}

/**
 * Infer type from declared component export (e.g., main declare block's loki_write_default_receiver export)
 */
function inferTypeFromDeclaredComponentExport(declareBlockName: string, exportName: string): string | null {
  console.error(`[DEBUG] Looking for declared export: ${declareBlockName}.${exportName}`);
  
  // Common export name to type mappings based on patterns (fallback)
  const exportTypePatterns: Record<string, string> = {
    'loki_write_default_receiver': 'LogsReceiver',
    'mimir_write_default_receiver': 'MetricsReceiver', 
    'prometheus_remote_write_default_receiver': 'MetricsReceiver',
    'loki_write_receiver': 'LogsReceiver',
    'prometheus_write_receiver': 'MetricsReceiver',
    'mimir_receiver': 'MetricsReceiver',
  };
  
  if (exportName in exportTypePatterns) {
    const type = exportTypePatterns[exportName];
    console.error(`[DEBUG] Found declared export type from pattern: ${type}`);
    return type;
  }
  
  // Try to infer from export name patterns
  if (exportName.includes('loki') && exportName.includes('receiver')) {
    console.error(`[DEBUG] Inferred LogsReceiver from export name pattern`);
    return 'LogsReceiver';
  }
  
  if ((exportName.includes('prometheus') || exportName.includes('mimir')) && exportName.includes('receiver')) {
    console.error(`[DEBUG] Inferred MetricsReceiver from export name pattern`);
    return 'MetricsReceiver';
  }
  
  console.error(`[DEBUG] No declared export type found for ${exportName}`);
  return null;
}

// Removed unused function - using TypeInference.inferTypeFromValue instead

/**
 * Get type information for declared arguments and exports
 */
function getDeclaredTypeInfo(document: TextDocument): { arguments: Map<string, string>, exports: Map<string, string> } {
  const text = document.getText();
  const lines = text.split('\n');
  
  const argumentTypes = new Map<string, string>();
  const exportTypes = new Map<string, string>();
  
  let inDeclare = false;
  let braceCount = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Track declare blocks
    if (line.match(/^\s*declare\s*"[^"]*"\s*{/)) {
      inDeclare = true;
      braceCount = 1;
      continue;
    }
    
    if (!inDeclare) continue;
    
    // Count braces
    for (const char of line) {
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;
    }
    
    // Exit declare block
    if (braceCount === 0) {
      inDeclare = false;
      continue;
    }
    
    // Look for argument declarations
    const argMatch = line.match(/^\s*argument\s*"([^"]+)"\s*{/);
    if (argMatch) {
      const argName = argMatch[1];
      // Find usages of this argument to infer type
      // Use enhanced argument type inference for better accuracy
      const inferredType = inferArgumentTypeFromUsageEnhanced(text, argName, 0, lines.length);
      if (inferredType) {
        argumentTypes.set(argName, inferredType);
      }
      continue;
    }
    
    // Look for export declarations
    const exportMatch = line.match(/^\s*export\s*"([^"]+)"\s*{/);
    if (exportMatch) {
      const exportName = exportMatch[1];
      // Look for the value assignment on the next few lines
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const valueLine = lines[j];
        const valueMatch = valueLine.match(/^\s*value\s*=\s*(.+)$/);
        if (valueMatch) {
          const value = valueMatch[1].trim();
          const inferredType = inferTypeFromValue(value);
          if (inferredType) {
            exportTypes.set(exportName, inferredType);
          }
          break;
        }
      }
    }
  }
  
  return { arguments: argumentTypes, exports: exportTypes };
}

/**
 * Infer argument type from its usage patterns in the document
 */
function inferArgumentType(text: string, argName: string): string | null {
  const lines = text.split('\n');
  
  for (const line of lines) {
    // Look for usage of argument.argName.value = someValue
    const usagePattern = new RegExp(`\\bargument\\.${argName}\\.value\\b`);
    if (usagePattern.test(line)) {
      // Check the context - is this being assigned to a known typed field?
      
      // URL fields are typically strings
      if (line.includes('url =')) {
        return 'string';
      }
      
      // Instance/name fields are typically strings  
      if (line.includes('instance =') || line.includes('name =')) {
        return 'string';
      }
      
      // Look for assignment pattern to infer from RHS
      const assignmentMatch = line.match(/(\w+)\s*=\s*argument\.\w+\.value/);
      if (assignmentMatch) {
        const fieldName = assignmentMatch[1];
        
        // Common field name patterns
        if (fieldName.includes('url') || fieldName.includes('path') || 
            fieldName.includes('name') || fieldName.includes('instance')) {
          return 'string';
        }
        
        if (fieldName.includes('port') || fieldName.includes('timeout') || 
            fieldName.includes('interval')) {
          return 'number';
        }
        
        if (fieldName.includes('enable') || fieldName.includes('disable')) {
          return 'bool';
        }
      }
    }
  }
  
  return null;
}

/**
 * Check if we're in a declare block and should use inferred types
 */
function findDeclareBlockInfo(document: TextDocument, lineIndex: number): { isInDeclare: boolean, declaredTypes?: { arguments: Map<string, string>, exports: Map<string, string> } } {
  const text = document.getText();
  const lines = text.split('\n');
  
  let braceCount = 0;
  let inDeclare = false;
  
  for (let i = 0; i <= lineIndex; i++) {
    const line = lines[i];
    
    // Check for declare block start
    if (line.match(/^\s*declare\s*"[^"]*"\s*{/)) {
      inDeclare = true;
      braceCount = 1;
      continue;
    }
    
    // Count braces
    for (const char of line) {
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;
    }
    
    // Exit declare block
    if (braceCount === 0) {
      inDeclare = false;
    }
  }
  
  if (inDeclare) {
    return {
      isInDeclare: true,
      declaredTypes: getDeclaredTypeInfo(document)
    };
  }
  
  return { isInDeclare: false };
}

// Removed unused function - nested parameter types now handled in TypeInference module

/**
 * Clear the component cache (useful for testing or when files change)
 */
export function clearComponentCache(): void {
  componentCache.clear();
}

/**
 * Find the declare block context at a specific line
 */
function findDeclareBlockAtLine(document: TextDocument, lineIndex: number): any {
  const text = document.getText();
  const lines = text.split('\n');

  let braceCount = 0;
  let currentDeclareBlockName: string | null = null;

  for (let i = 0; i <= lineIndex; i++) {
    const line = lines[i];

    // Check for declare block start
    const declareMatch = line.match(/^\s*declare\s*"([^"]+)"\s*{/);
    if (declareMatch) {
      currentDeclareBlockName = declareMatch[1];
      braceCount = 1;
      continue;
    }

    if (!currentDeclareBlockName) continue;

    // Count braces
    for (const char of line) {
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;
    }

    // Exit declare block
    if (braceCount === 0) {
      currentDeclareBlockName = null;
    }
  }

  if (currentDeclareBlockName) {
    return TypeInference.parseDeclareBlock(document, currentDeclareBlockName);
  }

  return null;
}