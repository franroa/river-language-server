import { TextDocument } from "vscode-languageserver-textdocument";
import { loadComponentInfo } from "./typeInference";

/**
 * Context information for argument usage analysis
 */
interface ArgumentUsageContext {
  parameterName: string;
  componentName: string;
  usageType: 'direct' | 'in_list' | 'in_map' | 'in_concatenation';
  expectedType: string | null;
}

/**
 * Enhanced type inference for arguments in declare blocks
 * This replaces the basic type inference with proper handling of list/map contexts
 */
export function inferArgumentTypeFromUsageEnhanced(
  text: string, 
  argName: string, 
  startLine: number, 
  endLine: number
): string | null {
  const lines = text.split('\n');
  const searchLines = lines.slice(startLine, Math.min(endLine, lines.length));
  
  const usageContexts: ArgumentUsageContext[] = [];
  
  // Find all usages of this argument
  for (let i = 0; i < searchLines.length; i++) {
    const line = searchLines[i];
    const argumentUsagePattern = new RegExp(`argument\\.${argName}\\.value`);
    
    if (argumentUsagePattern.test(line)) {
      const context = analyzeArgumentUsageContext(line, searchLines, i);
      if (context) {
        usageContexts.push(context);
      }
    }
  }
  
  if (usageContexts.length === 0) {
    return 'string'; // Default fallback
  }
  
  // Determine the most specific type based on usage contexts
  return determineArgumentType(usageContexts);
}

/**
 * Analyze the context in which an argument is used
 */
function analyzeArgumentUsageContext(
  line: string, 
  searchLines: string[], 
  lineIndex: number
): ArgumentUsageContext | null {
  // Find the component context
  const componentName = findComponentInPreviousLines(searchLines, lineIndex);
  if (!componentName) {
    return null;
  }
  
  // Pattern 1: Direct assignment (parameter = argument.name.value)
  const directAssignmentMatch = line.match(/^\s*(\w+)\s*=\s*argument\.\w+\.value/);
  if (directAssignmentMatch) {
    const parameterName = directAssignmentMatch[1];
    const expectedType = getComponentParameterType(componentName, parameterName);
    return {
      parameterName,
      componentName,
      usageType: 'direct',
      expectedType
    };
  }
  
  // Pattern 2: Usage in list context (parameter = [..., argument.name.value, ...])
  const listUsageMatch = line.match(/^\s*(\w+)\s*=\s*\[/);
  if (listUsageMatch) {
    const parameterName = listUsageMatch[1];
    const expectedListType = getComponentParameterType(componentName, parameterName);
    const elementType = extractElementTypeFromListType(expectedListType);
    
    // Check if the argument is used as a map value within the list
    // Pattern: [{"key" = argument.name.value}] or [{key = argument.name.value}]
    const mapValueInListMatch = line.match(/\[.*\{\s*(?:"[^"]+"|[a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*argument\.\w+\.value.*\}/);
    if (mapValueInListMatch && elementType?.startsWith('map(')) {
      // Extract the map value type: map(string) -> string
      const mapValueType = elementType.slice(4, -1); // Remove 'map(' and ')'
      return {
        parameterName,
        componentName,
        usageType: 'in_map', // Change to map context since it's used as a map value
        expectedType: mapValueType
      };
    }
    
    return {
      parameterName,
      componentName,
      usageType: 'in_list',
      expectedType: elementType
    };
  }
  
  // Pattern 3: Usage in map context (inside { key = argument.name.value })
  // Handle both quoted and unquoted keys
  const mapKeyMatch = line.match(/^\s*(?:"([^"]+)"|([a-zA-Z_][a-zA-Z0-9_]*))\s*=\s*argument\.\w+\.value/);
  if (mapKeyMatch) {
    // This is a map value assignment, type should be string in most cases
    const keyName = mapKeyMatch[1] || mapKeyMatch[2]; // Either quoted or unquoted key
    return {
      parameterName: keyName,
      componentName,
      usageType: 'in_map',
      expectedType: 'string'
    };
  }
  
  // Pattern 4: String concatenation context
  if (line.includes(' + ') || (line.includes('+') && line.includes('"'))) {
    return {
      parameterName: 'concatenation',
      componentName,
      usageType: 'in_concatenation',
      expectedType: 'string'
    };
  }
  
  return null;
}

/**
 * Extract element type from list type notation
 * e.g., "list(MetricsReceiver)" -> "MetricsReceiver"
 *       "list(string)" -> "string"
 *       "MetricsReceiver" -> "MetricsReceiver" (not a list)
 */
function extractElementTypeFromListType(listType: string | null): string | null {
  if (!listType) {
    return null;
  }
  
  const listMatch = listType.match(/^list\((.+)\)$/);
  if (listMatch) {
    return listMatch[1];
  }
  
  // If it's not a list type, return the type itself for direct assignment
  return listType;
}

/**
 * Get component parameter type from component definition
 */
function getComponentParameterType(componentName: string, parameterName: string): string | null {
  const componentInfo = loadComponentInfo(componentName);
  if (!componentInfo) {
    return null;
  }
  
  // Check direct parameters
  const parameter = componentInfo.parameters.find(p => p.name === parameterName);
  if (parameter) {
    return parameter.type;
  }
  
  // Check nested parameters (e.g., endpoint.url)
  const nestedParameter = componentInfo.parameters.find(p => p.name.endsWith(`.${parameterName}`));
  if (nestedParameter) {
    return nestedParameter.type;
  }
  
  return null;
}

/**
 * Determine the argument type based on all usage contexts
 */
function determineArgumentType(contexts: ArgumentUsageContext[]): string {
  // If all contexts point to the same type, use that
  const types = contexts
    .map(ctx => ctx.expectedType)
    .filter((type): type is string => type !== null);
    
  if (types.length === 0) {
    return 'string'; // Default fallback
  }
  
  // Check for consensus
  const uniqueTypes = [...new Set(types)];
  if (uniqueTypes.length === 1) {
    return uniqueTypes[0];
  }
  
  // Handle mixed usage patterns - prioritize specific types over generic ones
  const prioritizedTypes = ['MetricsReceiver', 'LogsReceiver', 'TraceReceiver'];
  for (const priorityType of prioritizedTypes) {
    if (uniqueTypes.includes(priorityType)) {
      return priorityType;
    }
  }
  
  // If we have mixed types with no clear priority, default to string
  return 'string';
}

/**
 * Find component name from previous lines (looking backwards)
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
 * Enhanced argument type inference for complex usage patterns
 * Handles cases where arguments are used in lists, maps, and concatenations
 */
export function inferArgumentTypeFromComplexUsage(
  document: TextDocument,
  declareBlockName: string,
  argumentName: string
): string | null {
  const text = document.getText();
  const lines = text.split('\n');
  
  // Find the declare block boundaries
  const declareBlockBounds = findDeclareBlockBounds(lines, declareBlockName);
  if (!declareBlockBounds) {
    return null;
  }
  
  const { startLine, endLine } = declareBlockBounds;
  const usageAnalysis = analyzeArgumentUsagePatterns(
    lines.slice(startLine, endLine + 1),
    argumentName
  );
  
  return determineTypeFromUsageAnalysis(usageAnalysis);
}

/**
 * Find the start and end lines of a declare block
 */
function findDeclareBlockBounds(lines: string[], declareBlockName: string): { startLine: number; endLine: number } | null {
  let startLine = -1;
  let braceCount = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (startLine === -1) {
      const declareMatch = line.match(/^\s*declare\s*"([^"]+)"\s*{/);
      if (declareMatch && declareMatch[1] === declareBlockName) {
        startLine = i;
        braceCount = 1;
        continue;
      }
    } else {
      // Count braces to find the end of the declare block
      for (const char of line) {
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
      }
      
      if (braceCount === 0) {
        return { startLine, endLine: i };
      }
    }
  }
  
  return null;
}

/**
 * Usage pattern analysis result
 */
interface UsageAnalysis {
  directAssignments: { parameter: string; componentType: string; expectedType: string }[];
  listUsages: { parameter: string; componentType: string; listType: string; elementType: string }[];
  mapUsages: { key: string; contextType: string }[];
  concatenations: number;
}

/**
 * Analyze how an argument is used throughout the declare block
 */
function analyzeArgumentUsagePatterns(lines: string[], argumentName: string): UsageAnalysis {
  const analysis: UsageAnalysis = {
    directAssignments: [],
    listUsages: [],
    mapUsages: [],
    concatenations: 0
  };
  
  let currentComponent: string | null = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Track current component context
    const componentMatch = line.match(/^\s*(\w+(?:\.\w+)*)\s*"[^"]*"\s*{/);
    if (componentMatch) {
      currentComponent = componentMatch[1];
      continue;
    }
    
    // Skip lines that don't reference our argument
    const argumentPattern = new RegExp(`argument\\.${argumentName}\\.value`);
    if (!argumentPattern.test(line)) {
      continue;
    }
    
    // Analyze the usage pattern
    if (currentComponent) {
      const usage = categorizeArgumentUsage(line, currentComponent, argumentName);
      if (usage) {
        switch (usage.type) {
          case 'direct':
            analysis.directAssignments.push(usage.data as any);
            break;
          case 'list':
            analysis.listUsages.push(usage.data as any);
            break;
          case 'map':
            analysis.mapUsages.push(usage.data as any);
            break;
          case 'concatenation':
            analysis.concatenations++;
            break;
        }
      }
    }
  }
  
  return analysis;
}

/**
 * Categorize how an argument is used in a specific line
 */
function categorizeArgumentUsage(
  line: string, 
  componentType: string, 
  _argumentName: string
): { type: 'direct' | 'list' | 'map' | 'concatenation'; data: any } | null {
  
  // Direct assignment: parameter = argument.name.value
  const directMatch = line.match(/^\s*(\w+)\s*=\s*argument\.\w+\.value\s*$/);
  if (directMatch) {
    const parameterName = directMatch[1];
    const expectedType = getComponentParameterType(componentType, parameterName);
    return {
      type: 'direct',
      data: { parameter: parameterName, componentType, expectedType: expectedType || 'string' }
    };
  }
  
  // List context: parameter = [argument.name.value] or parameter = [..., argument.name.value, ...]
  const listMatch = line.match(/^\s*(\w+)\s*=\s*\[.*argument\.\w+\.value.*\]/);
  if (listMatch) {
    const parameterName = listMatch[1];
    const listType = getComponentParameterType(componentType, parameterName) || 'list';
    const elementType = extractElementTypeFromListType(listType) || 'string';
    return {
      type: 'list',
      data: { parameter: parameterName, componentType, listType, elementType }
    };
  }
  
  // Map context: "key" = argument.name.value
  const mapMatch = line.match(/^\s*"([^"]+)"\s*=\s*.*argument\.\w+\.value/);
  if (mapMatch) {
    return {
      type: 'map',
      data: { key: mapMatch[1], contextType: 'map_value' }
    };
  }
  
  // String concatenation: contains + operator
  if (line.includes(' + ') || (line.includes('+') && line.includes('"'))) {
    return {
      type: 'concatenation',
      data: {}
    };
  }
  
  return null;
}

/**
 * Determine the final argument type from usage analysis
 */
function determineTypeFromUsageAnalysis(analysis: UsageAnalysis): string {
  // Priority 1: If used in list context, use the element type
  if (analysis.listUsages.length > 0) {
    const elementTypes = analysis.listUsages.map(usage => usage.elementType);
    const uniqueElementTypes = [...new Set(elementTypes)];
    
    if (uniqueElementTypes.length === 1) {
      return uniqueElementTypes[0];
    }
    
    // If multiple element types, prefer receiver types
    for (const type of ['MetricsReceiver', 'LogsReceiver', 'TraceReceiver']) {
      if (uniqueElementTypes.includes(type)) {
        return type;
      }
    }
    
    return uniqueElementTypes[0]; // Fallback to first found
  }
  
  // Priority 2: Direct assignments
  if (analysis.directAssignments.length > 0) {
    const directTypes = analysis.directAssignments.map(assign => assign.expectedType);
    const uniqueDirectTypes = [...new Set(directTypes)];
    
    if (uniqueDirectTypes.length === 1) {
      return uniqueDirectTypes[0];
    }
    
    // Handle type conflicts - prefer specific receiver types
    for (const type of ['MetricsReceiver', 'LogsReceiver', 'TraceReceiver']) {
      if (uniqueDirectTypes.includes(type)) {
        return type;
      }
    }
    
    return uniqueDirectTypes[0];
  }
  
  // Priority 3: String concatenation or map usage suggests string type
  if (analysis.concatenations > 0 || analysis.mapUsages.length > 0) {
    return 'string';
  }
  
  // Default fallback
  return 'string';
}