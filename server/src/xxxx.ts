import { TextDocument } from "vscode-languageserver-textdocument";
import * as fs from "fs";
import * as path from "path";

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
 * Load component information from JSON file
 */
export function loadComponentInfo(componentName: string): ComponentInfo | null {
  // Check cache first
  if (componentCache.has(componentName)) {
    return componentCache.get(componentName)!;
  }

  try {
    // Skip special keywords that aren't actual components
    if (
      componentName === "declare" ||
      componentName === "argument" ||
      componentName === "export"
    ) {
      componentCache.set(componentName, null);
      return null;
    }

    // Convert component name to filename (e.g., "prometheus.scrape" -> "prometheus_scrape.json")
    const fileName = componentName.replace(/\./g, "_") + ".json";
    // Use path.resolve to get absolute path from src directory, not compiled out directory
    const srcComponentsPath = path.resolve(
      __dirname,
      "..",
      "src",
      "components",
    );
    const filePath = path.join(srcComponentsPath, fileName);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      // Don't log missing files as it's normal for many component names
      componentCache.set(componentName, null);
      return null;
    }

    // Read and parse the JSON file
    const fileContent = fs.readFileSync(filePath, "utf8");
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
          description: arg.description,
        });
      }
    }

    const componentInfo: ComponentInfo = {
      name: componentName,
      parameters,
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
 * Find the component name that contains the given line
 * Handles both top-level components and components nested inside declare blocks
 */
export function findComponentForLine(
  document: TextDocument,
  lineIndex: number,
): string | null {
  const text = document.getText();
  const lines = text.split("\n");

  let braceCount = 0;
  let currentComponent: string | null = null;
  let componentBraceLevel = 0;

  for (let i = 0; i <= lineIndex; i++) {
    const line = lines[i];

    // Look for component declarations, including indented ones in declare blocks
    // Matches: prometheus.scrape "name" { or  prometheus.scrape "name" {
    const componentMatch = line.match(/^\s*(\w+(?:\.\w+)*)\s*"[^"]*"\s*{/);
    if (componentMatch) {
      currentComponent = componentMatch[1];
      componentBraceLevel = braceCount + 1; // Track the brace level for this component
    }

    // Count braces to track nesting
    for (const char of line) {
      if (char === "{") braceCount++;
      if (char === "}") braceCount--;
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
 * Infer parameter types for common nested blocks (e.g., rule blocks in relabeling components)
 */
export function inferNestedBlockParameterType(
  parameterName: string,
  componentName: string,
): string | null {
  // Common relabeling rule block parameters
  const relabelRuleParameters: Record<string, string> = {
    source_labels: "list(string)",
    target_label: "string",
    regex: "string",
    replacement: "string",
    action: "string",
    separator: "string",
    modulus: "uint64",
  };

  // Check if this is a relabeling-related component
  const isRelabelingComponent =
    componentName.includes("relabel") ||
    componentName.includes("discovery") ||
    componentName.includes("scrape") ||
    componentName.includes("operator");

  if (isRelabelingComponent && parameterName in relabelRuleParameters) {
    return relabelRuleParameters[parameterName];
  }

  // Common metric relabeling parameters (for metric_relabel_configs blocks)
  const metricRelabelParameters: Record<string, string> = {
    source_labels: "list(string)",
    target_label: "string",
    regex: "string",
    replacement: "string",
    action: "string",
    separator: "string",
  };

  if (parameterName in metricRelabelParameters) {
    return metricRelabelParameters[parameterName];
  }

  return null;
}

/**
 * Infer type from value assignment
 */
export function inferTypeFromValue(value: string): string | null {
  // Remove leading/trailing whitespace
  value = value.trim();

  // String literals
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return "string";
  }

  // Numbers
  if (/^\d+$/.test(value)) {
    return "number";
  }

  if (/^\d+\.\d+$/.test(value)) {
    return "number";
  }

  // Booleans
  if (value === "true" || value === "false") {
    return "bool";
  }

  // Duration (common in Alloy)
  if (/^\d+[smhd]$/.test(value)) {
    return "duration";
  }

  // Arrays/lists
  if (value.startsWith("[") && value.endsWith("]")) {
    return "list";
  }

  // Objects/maps
  if (value.startsWith("{") && value.endsWith("}")) {
    return "map";
  }

  // Component references (e.g., loki.write.default.receiver or main.instance.export)
  if (/^\w+\.\w+\.\w+/.test(value)) {
    return inferTypeFromComponentReference(value);
  }

  // Argument references (e.g., argument.loki_url.value)
  if (value.startsWith("argument.") && value.endsWith(".value")) {
    return "argument_ref";
  }

  return null;
}

/**
 * Infer type from component reference (e.g., prometheus.remote_write.default.receiver or main.instance.export)
 */
export function inferTypeFromComponentReference(
  reference: string,
): string | null {
  const parts = reference.split(".");

  // Handle declared component instance references (e.g., main.basicservice_local_local.loki_write_default_receiver)
  if (parts.length === 3) {
    const [, , exportName] = parts;
    // This is a declared component instance reference
    return inferTypeFromDeclaredComponentExport(exportName);
  }

  // Handle direct component references (e.g., loki.write.default.receiver)
  if (parts.length >= 4) {
    const componentType = `${parts[0]}.${parts[1]}`;
    const fieldName = parts[parts.length - 1];

    // Load component info to get exported field types
    const componentInfo = loadComponentInfo(componentType);
    if (!componentInfo) {
      return null;
    }

    // Look for the field in exported_fields in the JSON
    try {
      const fileName = componentType.replace(/\./g, "_") + ".json";
      const srcComponentsPath = path.resolve(
        __dirname,
        "..",
        "src",
        "components",
      );
      const filePath = path.join(srcComponentsPath, fileName);

      if (!fs.existsSync(filePath)) {
        return null;
      }

      const fileContent = fs.readFileSync(filePath, "utf8");
      const componentData = JSON.parse(fileContent);

      if (componentData.exported_fields) {
        for (const exportedField of componentData.exported_fields) {
          if (exportedField.name === fieldName) {
            return exportedField.type;
          }
        }
      }

      // Fallback to lsp_structure if available
      if (componentData.lsp_structure?.exported_fields?.[fieldName]) {
        return componentData.lsp_structure.exported_fields[fieldName].type;
      }
    } catch (error) {
      // Silent error handling
    }
  }

  return null;
}

/**
 * Infer type from declared component export (e.g., main declare block's loki_write_default_receiver export)
 */
function inferTypeFromDeclaredComponentExport(
  exportName: string,
): string | null {
  // Common export name to type mappings based on patterns (fallback)
  const exportTypePatterns: Record<string, string> = {
    loki_write_default_receiver: "LogsReceiver",
    mimir_write_default_receiver: "MetricsReceiver",
    prometheus_remote_write_default_receiver: "MetricsReceiver",
    loki_write_receiver: "LogsReceiver",
    prometheus_write_receiver: "MetricsReceiver",
    mimir_receiver: "MetricsReceiver",
  };

  if (exportName in exportTypePatterns) {
    return exportTypePatterns[exportName];
  }

  // Try to infer from export name patterns
  if (exportName.includes("loki") && exportName.includes("receiver")) {
    return "LogsReceiver";
  }

  if (
    (exportName.includes("prometheus") || exportName.includes("mimir")) &&
    exportName.includes("receiver")
  ) {
    return "MetricsReceiver";
  }

  return null;
}

/**
 * Get the expected type for a parameter based on component definition
 */
export function getExpectedParameterType(
  document: TextDocument,
  lineIndex: number,
  parameterName: string,
): string | null {
  // PRIORITY 1: Component JSON-defined types (ALWAYS FIRST)
  const componentName = findComponentForLine(document, lineIndex);
  if (componentName) {
    const componentInfo = loadComponentInfo(componentName);
    if (componentInfo) {
      const parameter = componentInfo.parameters.find(
        (p) => p.name === parameterName,
      );
      if (parameter) {
        return parameter.type;
      }

      // Check for nested block parameters
      const nestedType = inferNestedBlockParameterType(
        parameterName,
        componentName,
      );
      if (nestedType) {
        return nestedType;
      }
    }
  }

  return null;
}

/**
 * Infer the expected type for a declare block argument by analyzing how it's used
 */
export function inferDeclareBlockArgumentType(
  document: TextDocument,
  lineIndex: number,
  argumentName: string,
): string | null {
  const text = document.getText();
  const lines = text.split("\n");

  // Find the declare block instantiation at lineIndex
  const line = lines[lineIndex];
  const instantiationMatch = line.match(/^\s*(\w+)\s*"([^"]+)"\s*{/);
  if (!instantiationMatch) {
    return null;
  }

  const declareBlockName = instantiationMatch[1];
  const instanceLabel = instantiationMatch[2];

  // Find the declare block definition
  let inDeclareBlock = false;
  let braceCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const currentLine = lines[i];

    // Look for the declare block
    const declareMatch = currentLine.match(
      new RegExp(`^\\s*declare\\s*"${declareBlockName}"\\s*{`),
    );
    if (declareMatch) {
      inDeclareBlock = true;
      braceCount = 1;
      continue;
    }

    if (!inDeclareBlock) continue;

    // Count braces
    for (const char of currentLine) {
      if (char === "{") braceCount++;
      if (char === "}") braceCount--;
    }

    // Exit declare block
    if (braceCount === 0) {
      break;
    }

    // Look for argument definition
    const argMatch = currentLine.match(
      new RegExp(`^\\s*argument\\s*"${argumentName}"\\s*{`),
    );
    if (argMatch) {
      // Found the argument, now look for its usage within the declare block
      const usageType = findArgumentUsageTypeInDeclareBlock(
        lines,
        i,
        argumentName,
      );
      return usageType;
    }
  }

  return null;
}

/**
 * Find how an argument is used within a declare block to infer its expected type
 */
function findArgumentUsageTypeInDeclareBlock(
  lines: string[],
  argStartLine: number,
  argumentName: string,
): string | null {
  // Look for usages of argument.argumentName.value within the declare block
  const usagePattern = new RegExp(`argument\.${argumentName}\.value`);

  for (let i = argStartLine; i < lines.length; i++) {
    const line = lines[i];

    // Check if we've exited the declare block
    let braceCount = 0;
    for (const char of line) {
      if (char === "{") braceCount++;
      if (char === "}") braceCount--;
    }
    if (braceCount < 0) break;

    // Look for argument usage
    const usageMatch = line.match(usagePattern);
    if (usageMatch) {
      // Found usage, now determine the context
      const assignmentMatch = line.match(/(\w+)\s*=\s*argument\.\w+\.value/);
      if (assignmentMatch) {
        const paramName = assignmentMatch[1];
        // Get the expected type for this parameter in its context
        // This is recursive but should work
        const inferredType = inferParameterTypeFromUsage(
          line,
          paramName,
          lines,
          i,
        );
        if (inferredType) {
          return inferredType;
        }
      }
    }
  }

  return null;
}

/**
 * Find the component name that contains the given line (from lines array)
 */
function findComponentForLineFromLines(
  lines: string[],
  lineIndex: number,
): string | null {
  let braceCount = 0;
  let currentComponent: string | null = null;
  let componentBraceLevel = 0;

  for (let i = 0; i <= lineIndex; i++) {
    const line = lines[i];

    // Look for component declarations, including indented ones in declare blocks
    // Matches: prometheus.scrape "name" { or  prometheus.scrape "name" {
    const componentMatch = line.match(/^\s*(\w+(?:\.\w+)*)\s*"[^"]*"\s*{/);
    if (componentMatch) {
      currentComponent = componentMatch[1];
      componentBraceLevel = braceCount + 1; // Track the brace level for this component
    }

    // Count braces to track nesting
    for (const char of line) {
      if (char === "{") braceCount++;
      if (char === "}") braceCount--;
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
 * Infer parameter type from its usage context
 */
function inferParameterTypeFromUsage(
  line: string,
  paramName: string,
  lines: string[],
  lineIndex: number,
): string | null {
  // Find the component/block that contains this line
  const componentName = findComponentForLineFromLines(lines, lineIndex);
  if (componentName) {
    const componentInfo = loadComponentInfo(componentName);
    if (componentInfo) {
      const parameter = componentInfo.parameters.find(
        (p) => p.name === paramName,
      );
      if (parameter) {
        return parameter.type;
      }
    }
  }

  return null;
}

/**
 * Check if a value matches the expected type
 */
export function isValueCompatibleWithType(
  value: string,
  expectedType: string,
): boolean {
  const valueType = inferTypeFromValue(value);

  // Direct type match
  if (valueType === expectedType) {
    return true;
  }

  // Handle common type aliases and compatible types
  if (
    expectedType === "string" &&
    (valueType === "string" || valueType === "argument_ref")
  ) {
    return true;
  }

  if (expectedType === "duration" && valueType === "string") {
    // Duration can be represented as string literals
    return true;
  }

  // Handle list types
  if (expectedType.startsWith("list(") && valueType === "list") {
    return true;
  }

  // Handle receiver types that can be argument references
  if (expectedType.includes("Receiver") && valueType === "argument_ref") {
    return true;
  }

  if (
    expectedType.includes("Receiver") &&
    (valueType === "LogsReceiver" || valueType === "MetricsReceiver")
  ) {
    return true;
  }

  // Handle empty string as valid for many types (optional parameters)
  if (value.trim() === '""' || value.trim() === "''") {
    return true; // Empty strings are generally valid as defaults
  }

  return false;
}

/**
 * Clear the component cache (useful for testing or when files change)
 */
export function clearComponentCache(): void {
  componentCache.clear();
}

