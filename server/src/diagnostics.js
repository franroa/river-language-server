"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlloyDiagnosticsProvider = void 0;
exports.getDocumentDiagnostics = getDocumentDiagnostics;
exports.getWorkspaceDiagnostics = getWorkspaceDiagnostics;
const node_1 = require("vscode-languageserver/node");
const utils = __importStar(require("./utils"));
const configuration_1 = require("./configuration");
/**
 * New diagnostics provider focused on type validation and unused arguments
 */
class AlloyDiagnosticsProvider {
    constructor(componentData) {
        this.componentData = {};
        this.componentData = componentData;
    }
    /**
     * Get the context (component, block, declare status) for a given line
     */
    getLineContext(document, lineIndex) {
        const text = document.getText();
        const lines = text.split('\n');
        let braceCount = 0;
        let currentComponent = null;
        let currentBlock = null;
        let inDeclareBlock = false;
        let componentBraceLevel = 0;
        let blockBraceLevel = 0;
        let declareBraceLevel = 0;
        for (let i = 0; i <= lineIndex; i++) {
            const line = lines[i];
            // Check for declare block start
            const declareMatch = line.match(/^\s*declare\s+"[^"]+"\s*{/);
            if (declareMatch) {
                inDeclareBlock = true;
                declareBraceLevel = braceCount + 1;
                currentComponent = null;
                currentBlock = null;
            }
            // Check for component declaration (e.g., "loki.source.file", "local.file_match")
            const componentMatch = line.match(/^\s*([a-zA-Z][a-zA-Z0-9_.]*)\s+"[^"]*"\s*{/);
            if (componentMatch) {
                const potentialComponent = componentMatch[1];
                // Skip declare, argument, export - these are not components
                if (!['declare', 'argument', 'export'].includes(potentialComponent)) {
                    currentComponent = potentialComponent;
                    componentBraceLevel = braceCount + 1;
                    currentBlock = null;
                    blockBraceLevel = 0;
                }
            }
            // Check for block declaration within component (e.g., "stage.output", "rule")
            const blockMatch = line.match(/^\s*([a-zA-Z][a-zA-Z0-9_.]*)\s*{/);
            if (blockMatch && currentComponent && braceCount >= componentBraceLevel) {
                const potentialBlock = blockMatch[1];
                // Only consider it a block if we're inside a component and it's not quoted
                if (!line.includes('"')) {
                    currentBlock = potentialBlock;
                    blockBraceLevel = braceCount + 1;
                }
            }
            // Count braces
            for (const char of line) {
                if (char === '{')
                    braceCount++;
                if (char === '}')
                    braceCount--;
            }
            // Exit block if we're back to component level
            if (braceCount < blockBraceLevel) {
                currentBlock = null;
                blockBraceLevel = 0;
            }
            // Exit component if we're back to declare/global level
            if (braceCount < componentBraceLevel) {
                currentComponent = null;
                currentBlock = null;
                componentBraceLevel = 0;
                blockBraceLevel = 0;
            }
            // Exit declare block if we're back to global level
            if (braceCount < declareBraceLevel) {
                inDeclareBlock = false;
                declareBraceLevel = 0;
            }
        }
        return {
            componentName: currentComponent,
            blockName: currentBlock,
            inDeclareBlock
        };
    }
    /**
     * Get expected type for a parameter based on context
     */
    getExpectedParameterType(document, lineIndex, parameterName) {
        const context = this.getLineContext(document, lineIndex);
        if (!context.componentName) {
            return null;
        }
        const componentInfo = this.componentData[context.componentName];
        if (!componentInfo || !componentInfo.lsp_structure) {
            return null;
        }
        const structure = componentInfo.lsp_structure;
        // If we're in a nested block, look for the parameter there first
        if (context.blockName && structure.blocks) {
            const blockInfo = structure.blocks[context.blockName];
            if (blockInfo && blockInfo.arguments) {
                const blockParam = blockInfo.arguments.find((p) => p.name === parameterName);
                if (blockParam) {
                    return blockParam.type;
                }
            }
        }
        // Look for the parameter in component arguments
        if (structure.arguments) {
            const parameter = structure.arguments[parameterName];
            if (parameter) {
                return parameter.type;
            }
        }
        return null;
    }
    /**
     * Infer the specific type of a map based on its contents
     * @param mapValue The map value to analyze
     * @param expectedValueType Optional expected type for values (e.g., 'string' for map(string))
     */
    inferMapType(mapValue, expectedValueType) {
        const content = mapValue.trim();
        if (!content.startsWith('{') || !content.endsWith('}')) {
            return 'map';
        }
        const innerContent = content.slice(1, -1).trim();
        if (!innerContent) {
            return 'map'; // Empty map
        }
        // Simple parsing to extract values from key-value pairs
        // Format: "key" = value, "key2" = value2
        const pairs = innerContent.split(',').map(pair => pair.trim());
        const valueTypes = [];
        for (const pair of pairs) {
            const equalsIndex = pair.indexOf('=');
            if (equalsIndex === -1)
                continue;
            const valuePart = pair.substring(equalsIndex + 1).trim();
            if (valuePart) {
                // Use contextual typing if we have an expected value type
                const valueType = this.inferValueType(valuePart, expectedValueType);
                valueTypes.push(valueType);
            }
        }
        if (valueTypes.length === 0) {
            return 'map';
        }
        // If we have an expected value type, check if values can be contextually typed
        if (expectedValueType) {
            const allCanBeTypedAs = valueTypes.every(valueType => this.canBeContextuallyTypedAs(valueType, expectedValueType));
            if (allCanBeTypedAs) {
                return `map(${expectedValueType})`;
            }
        }
        // Find the most common type among all values
        const typeCounts = {};
        for (const type of valueTypes) {
            typeCounts[type] = (typeCounts[type] || 0) + 1;
        }
        // Get the most common type
        let mostCommonType = 'unknown';
        let maxCount = 0;
        for (const [type, count] of Object.entries(typeCounts)) {
            if (count > maxCount) {
                maxCount = count;
                mostCommonType = type;
            }
        }
        return `map(${mostCommonType})`;
    }
    /**
     * Check if a value type can be contextually typed as the expected type
     * This is more permissive than basic compatibility - it allows argument references
     * and other flexible types to be used in contexts where they will resolve to the expected type
     */
    canBeContextuallyTypedAs(sourceType, expectedType) {
        // Exact match
        if (sourceType === expectedType) {
            return true;
        }
        // Argument references can be contextually typed as any compatible type
        if (sourceType === 'argument_ref') {
            return ['string', 'number', 'bool', 'duration', 'secret'].includes(expectedType);
        }
        // Component references can be contextually typed based on their exports
        if (sourceType === 'component_reference') {
            return true; // Let component reference validation handle specifics
        }
        // Use basic compatibility for other cases
        return this.areBasicTypesCompatible(sourceType, expectedType);
    }
    /**
     * Check if a string (without quotes) is a valid duration format
     */
    isDurationString(content) {
        // Valid units: h (hours), m (minutes), s (seconds), ms (milliseconds), ns (nanoseconds)
        // Support both single unit (e.g. "336h") and combined units (e.g. "1h30m")
        // Pattern matches: \d+(ns|ms|[hms]) to handle ms/ns before single chars
        const durationPattern = /^(\d+(ns|ms|[hms]))+$/;
        return durationPattern.test(content);
    }
    /**
     * Check if union types are compatible (e.g., "string or secret" with "string")
     */
    isUnionTypeCompatible(sourceType, targetType) {
        // Parse union types: "string or secret" -> ["string", "secret"]
        const parseUnionType = (type) => {
            return type.split(' or ').map(t => t.trim());
        };
        const sourceTypes = sourceType.includes(' or ') ? parseUnionType(sourceType) : [sourceType];
        const targetTypes = targetType.includes(' or ') ? parseUnionType(targetType) : [targetType];
        // For union types, we need compatibility if:
        // 1. Any source type is compatible with any target type, OR
        // 2. If target is a union, source must be compatible with at least one target type
        // 3. If source is a union, at least one source type must be compatible with target
        for (const srcType of sourceTypes) {
            for (const tgtType of targetTypes) {
                // Check basic compatibility (without recursion to avoid infinite loop)
                if (srcType === tgtType) {
                    return true;
                }
                // Check using compatibility rules (non-recursively)
                if (this.areBasicTypesCompatible(srcType, tgtType)) {
                    return true;
                }
            }
        }
        return false;
    }
    /**
     * Check basic type compatibility without union type handling (to avoid recursion)
     */
    areBasicTypesCompatible(sourceType, targetType) {
        const compatibilityRules = {
            'string': ['argument_ref', 'duration', 'secret'],
            'argument_ref': ['string'],
            'duration': ['string'],
            'secret': ['string'], // Secrets can be used where strings are expected
            'number': ['int'],
            'int': ['number'],
            'component_reference': ['receiver', 'MetricsReceiver', 'LogsReceiver', 'TracesReceiver'],
            'receiver': ['component_reference'],
            'MetricsReceiver': ['component_reference'],
            'LogsReceiver': ['component_reference'],
            'TracesReceiver': ['component_reference']
        };
        if (sourceType in compatibilityRules) {
            return compatibilityRules[sourceType].includes(targetType);
        }
        if (targetType in compatibilityRules) {
            return compatibilityRules[targetType].includes(sourceType);
        }
        return false;
    }
    /**
     * Infer the actual type of a value
     * @param value The value to analyze
     * @param expectedType Optional expected type for contextual typing
     */
    inferValueType(value, expectedType) {
        value = value.trim();
        // Remove trailing comma
        if (value.endsWith(',')) {
            value = value.slice(0, -1).trim();
        }
        // String literals - check if the content is a duration before classifying as string
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            const content = value.slice(1, -1); // Remove quotes
            // Check if the quoted content is a duration
            if (this.isDurationString(content)) {
                return 'duration';
            }
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
        // Lists
        if (value.startsWith('[') && value.endsWith(']')) {
            return 'list';
        }
        // Maps/Objects
        if (value.startsWith('{') && value.endsWith('}')) {
            return this.inferMapType(value);
        }
        // Component references
        if (/^[a-zA-Z][a-zA-Z0-9_.]*\.[a-zA-Z][a-zA-Z0-9_.]*/.test(value)) {
            return 'component_reference';
        }
        // Argument references
        if (value.startsWith('argument.')) {
            // If we have an expected type, use contextual typing for argument references
            if (expectedType && ['string', 'number', 'bool', 'duration', 'secret'].includes(expectedType)) {
                return expectedType;
            }
            return 'argument_ref';
        }
        return 'unknown';
    }
    /**
     * Parse array contents and return the elements
     */
    parseArrayElements(arrayValue) {
        const content = arrayValue.trim();
        if (!content.startsWith('[') || !content.endsWith(']')) {
            return [];
        }
        const innerContent = content.slice(1, -1).trim();
        if (!innerContent) {
            return [];
        }
        // Simple parsing - split by comma, but respect quoted strings
        const elements = [];
        let current = '';
        let inQuotes = false;
        let quoteChar = '';
        for (let i = 0; i < innerContent.length; i++) {
            const char = innerContent[i];
            if (!inQuotes && (char === '"' || char === "'")) {
                inQuotes = true;
                quoteChar = char;
                current += char;
            }
            else if (inQuotes && char === quoteChar && innerContent[i - 1] !== '\\') {
                inQuotes = false;
                current += char;
            }
            else if (!inQuotes && char === ',') {
                if (current.trim()) {
                    elements.push(current.trim());
                }
                current = '';
            }
            else {
                current += char;
            }
        }
        if (current.trim()) {
            elements.push(current.trim());
        }
        return elements;
    }
    /**
     * Validate array elements against expected element type
     */
    validateArrayElements(arrayValue, expectedElementType) {
        const elements = this.parseArrayElements(arrayValue);
        for (let i = 0; i < elements.length; i++) {
            const element = elements[i];
            // Special handling for map types with expected value types
            let elementType;
            if (expectedElementType.startsWith('map(') && expectedElementType.endsWith(')')) {
                const expectedValueType = expectedElementType.slice(4, -1); // Extract type from map(type)
                elementType = this.inferMapType(element, expectedValueType);
            }
            else {
                elementType = this.inferValueType(element);
            }
            // Special validation for empty strings in receiver lists
            if (expectedElementType.includes('Receiver') && element === '""') {
                return `Empty string is not a valid ${expectedElementType} at index ${i}`;
            }
            // Check type compatibility
            if (!this.areTypesCompatible(elementType, expectedElementType)) {
                return `Expected ${expectedElementType} but got ${elementType} at index ${i} (value: ${element})`;
            }
        }
        return null; // No validation errors
    }
    /**
     * Check if two types are compatible (reused from existing logic)
     */
    areTypesCompatible(sourceType, targetType) {
        // Exact match
        if (sourceType === targetType) {
            return true;
        }
        // Skip unknown types to reduce noise
        if (sourceType === 'unknown' || targetType === 'unknown') {
            return true;
        }
        // Handle union types (e.g., "string or secret")
        if (sourceType.includes(' or ') || targetType.includes(' or ')) {
            return this.isUnionTypeCompatible(sourceType, targetType);
        }
        // Component references are handled by separate validation
        if (sourceType === 'component_reference') {
            return true; // Let component reference validation handle this
        }
        // Handle list types
        if (targetType.startsWith('list(') && targetType.endsWith(')')) {
            if (sourceType === 'list') {
                return true;
            }
        }
        // Handle map types
        if (targetType.startsWith('map(') && targetType.endsWith(')')) {
            if (sourceType === 'map') {
                return true; // Generic map is compatible with any specific map type
            }
            if (sourceType.startsWith('map(') && sourceType.endsWith(')')) {
                // Both are specific map types - check if the value types are compatible
                const targetValueType = targetType.slice(4, -1); // Extract type from map(type)
                const sourceValueType = sourceType.slice(4, -1); // Extract type from map(type)
                return this.areBasicTypesCompatible(sourceValueType, targetValueType);
            }
        }
        // Use basic type compatibility for non-union types
        return this.areBasicTypesCompatible(sourceType, targetType);
    }
    /**
     * Validate parameter types for both inside and outside declare blocks
     */
    validateParameterTypes(document) {
        const diagnostics = [];
        if (!configuration_1.configManager.isDiagnosticEnabled('invalidArgumentType')) {
            return diagnostics;
        }
        const severity = this.mapSeverity(configuration_1.configManager.getDiagnosticSeverity('invalidArgumentType') || 'error');
        const text = document.getText();
        const lines = text.split('\n');
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex];
            // Look for parameter assignments: parameter_name = value
            const assignmentMatch = line.match(/^\s*(\w+)\s*=\s*(.+)$/);
            if (!assignmentMatch) {
                continue;
            }
            const parameterName = assignmentMatch[1];
            let value = assignmentMatch[2].trim();
            // Remove inline comments
            const commentIndex = value.search(/\s*(\/\/|#)/);
            if (commentIndex !== -1) {
                value = value.substring(0, commentIndex).trim();
            }
            if (!value) {
                continue;
            }
            // Skip component references - they are validated separately
            if (this.inferValueType(value) === 'component_reference') {
                continue;
            }
            // Get expected type for this parameter
            const expectedType = this.getExpectedParameterType(document, lineIndex, parameterName);
            if (!expectedType) {
                continue; // Skip if we can't determine expected type
            }
            const actualType = this.inferValueType(value);
            // Check for type mismatch
            if (!this.areTypesCompatible(actualType, expectedType)) {
                const valueStart = line.indexOf(value);
                const valueEnd = valueStart + value.length;
                diagnostics.push({
                    severity,
                    range: node_1.Range.create(lineIndex, valueStart, lineIndex, valueEnd),
                    message: `Type mismatch: expected '${expectedType}' but got '${actualType}' for parameter '${parameterName}'`,
                    source: 'alloy-lsp',
                });
            }
            // Special validation for empty strings in receiver lists
            if (actualType === 'list' && expectedType.includes('Receiver')) {
                // Check for empty string in receiver arrays like [""]
                if (value.includes('""')) {
                    const valueStart = line.indexOf(value);
                    const valueEnd = valueStart + value.length;
                    diagnostics.push({
                        severity,
                        range: node_1.Range.create(lineIndex, valueStart, lineIndex, valueEnd),
                        message: `Empty string is not a valid ${expectedType.replace('list(', '').replace(')', '')} reference`,
                        source: 'alloy-lsp',
                    });
                }
            }
            // Additional validation for list types - check array elements
            if (actualType === 'list' && expectedType.startsWith('list(') && expectedType.endsWith(')')) {
                const expectedElementType = expectedType.slice(5, -1); // Extract element type from list(ElementType)
                const arrayValidationError = this.validateArrayElements(value, expectedElementType);
                if (arrayValidationError) {
                    const valueStart = line.indexOf(value);
                    const valueEnd = valueStart + value.length;
                    diagnostics.push({
                        severity,
                        range: node_1.Range.create(lineIndex, valueStart, lineIndex, valueEnd),
                        message: `Invalid list element: ${arrayValidationError}`,
                        source: 'alloy-lsp',
                    });
                }
            }
        }
        return diagnostics;
    }
    /**
     * Validate unused arguments in declare blocks
     */
    validateUnusedArguments(document) {
        const diagnostics = [];
        if (!configuration_1.configManager.isDiagnosticEnabled('unusedArgument') ||
            !configuration_1.configManager.isValidationEnabled('enableUnusedDetection')) {
            return diagnostics;
        }
        const severity = this.mapSeverity(configuration_1.configManager.getDiagnosticSeverity('unusedArgument') || 'warning');
        const text = document.getText();
        const lines = text.split('\n');
        // Find all declared arguments in declare blocks
        const declaredArguments = [];
        let inDeclareBlock = false;
        let braceCount = 0;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // Track declare block
            if (line.match(/^\s*declare\s+"[^"]+"\s*{/)) {
                inDeclareBlock = true;
                braceCount = 1;
                continue;
            }
            if (inDeclareBlock) {
                // Count braces
                for (const char of line) {
                    if (char === '{')
                        braceCount++;
                    if (char === '}')
                        braceCount--;
                }
                // Exit declare block
                if (braceCount === 0) {
                    inDeclareBlock = false;
                    continue;
                }
                // Look for argument declarations
                const argMatch = line.match(/^\s*argument\s+"([^"]+)"\s*{/);
                if (argMatch) {
                    const argName = argMatch[1];
                    const nameStart = line.indexOf(`"${argName}"`);
                    // Check if this argument is optional by looking ahead within this argument block only
                    let isOptional = false;
                    // Check if the argument block is single-line (like: argument "name" { optional = true })
                    if (line.includes('{') && line.includes('}')) {
                        // Single-line argument block - check for optional = true in the same line
                        if (line.includes('optional = true')) {
                            isOptional = true;
                        }
                    }
                    else {
                        // Multi-line argument block - look for optional = true inside
                        let argBraceCount = 1; // We're already inside the argument block
                        for (let j = i + 1; j < lines.length; j++) {
                            const nextLine = lines[j];
                            // Count braces to stay within this argument block
                            for (const char of nextLine) {
                                if (char === '{')
                                    argBraceCount++;
                                if (char === '}')
                                    argBraceCount--;
                            }
                            // Check for optional = true within this argument block
                            if (argBraceCount > 0 && nextLine.includes('optional = true')) {
                                isOptional = true;
                            }
                            // Exit when we've closed this argument block
                            if (argBraceCount === 0) {
                                break;
                            }
                        }
                    }
                    declaredArguments.push({
                        name: argName,
                        line: i,
                        range: node_1.Range.create(i, nameStart + 1, i, nameStart + 1 + argName.length),
                        isOptional
                    });
                }
            }
        }
        // Check which arguments are actually used
        for (const arg of declaredArguments) {
            const usagePattern = new RegExp(`argument\\.${arg.name}(?:\\.\\w+)?`, 'g');
            const isUsed = usagePattern.test(text);
            // Flag unused arguments (both optional and required)
            if (!isUsed) {
                const optionalText = arg.isOptional ? 'optional ' : '';
                diagnostics.push({
                    severity,
                    range: arg.range,
                    message: `Unused ${optionalText}argument '${arg.name}' in declare block`,
                    source: 'alloy-lsp',
                });
            }
        }
        return diagnostics;
    }
    /**
     * Validate undefined arguments referenced in declare blocks
     */
    validateUndefinedArguments(document) {
        const diagnostics = [];
        if (!configuration_1.configManager.isDiagnosticEnabled('unknownArgument')) {
            return diagnostics;
        }
        const severity = this.mapSeverity(configuration_1.configManager.getDiagnosticSeverity('unknownArgument') || 'error');
        const text = document.getText();
        const lines = text.split('\n');
        // Find all declare blocks and their declared arguments
        const declareBlocks = [];
        let currentDeclareBlock = null;
        let braceCount = 0;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // Start of declare block
            const declareMatch = line.match(/^\s*declare\s+"[^"]+"\s*{/);
            if (declareMatch) {
                currentDeclareBlock = {
                    startLine: i,
                    arguments: new Set()
                };
                braceCount = 1;
                continue;
            }
            if (currentDeclareBlock) {
                // Count braces
                for (const char of line) {
                    if (char === '{')
                        braceCount++;
                    if (char === '}')
                        braceCount--;
                }
                // Look for argument declarations
                const argMatch = line.match(/^\s*argument\s+"([^"]+)"\s*{/);
                if (argMatch) {
                    currentDeclareBlock.arguments.add(argMatch[1]);
                }
                // End of declare block
                if (braceCount === 0) {
                    declareBlocks.push({
                        startLine: currentDeclareBlock.startLine,
                        endLine: i,
                        arguments: currentDeclareBlock.arguments
                    });
                    currentDeclareBlock = null;
                }
            }
        }
        // Find all argument references and check if they're defined
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex];
            // Find argument references like argument.name.value
            const argRefRegex = /argument\.([a-zA-Z_][a-zA-Z0-9_]*)/g;
            let match;
            while ((match = argRefRegex.exec(line)) !== null) {
                const argName = match[1];
                const argRef = match[0];
                // Find which declare block this line belongs to
                const declareBlock = declareBlocks.find(block => lineIndex >= block.startLine && lineIndex <= block.endLine);
                if (declareBlock && !declareBlock.arguments.has(argName)) {
                    // Argument is referenced but not declared in this declare block
                    const argRefStart = line.indexOf(argRef);
                    const argRefEnd = argRefStart + argRef.length;
                    diagnostics.push({
                        severity,
                        range: node_1.Range.create(lineIndex, argRefStart, lineIndex, argRefEnd),
                        message: `Undefined argument '${argName}' in declare block`,
                        source: 'alloy-lsp',
                    });
                }
            }
        }
        return diagnostics;
    }
    /**
     * Validate component reference exports and types
     */
    validateComponentReferences(document) {
        const diagnostics = [];
        if (!configuration_1.configManager.isDiagnosticEnabled('componentReference')) {
            return diagnostics;
        }
        const severity = this.mapSeverity(configuration_1.configManager.getDiagnosticSeverity('componentReference') || 'error');
        const text = document.getText();
        const lines = text.split('\n');
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex];
            // Look for parameter assignments: parameter_name = value
            const assignmentMatch = line.match(/^\s*(\w+)\s*=\s*(.+)$/);
            if (!assignmentMatch) {
                continue;
            }
            const parameterName = assignmentMatch[1];
            let value = assignmentMatch[2].trim();
            // Remove inline comments
            const commentIndex = value.search(/\s*(\/\/|#)/);
            if (commentIndex !== -1) {
                value = value.substring(0, commentIndex).trim();
            }
            if (!value) {
                continue;
            }
            // Check if the value is a component reference
            if (this.inferValueType(value) === 'component_reference') {
                const validationResult = this.validateComponentReference(value, document, lineIndex, parameterName);
                if (validationResult) {
                    diagnostics.push({
                        severity,
                        range: validationResult.range,
                        message: validationResult.message,
                        source: 'alloy-lsp',
                    });
                }
            }
        }
        return diagnostics;
    }
    /**
     * Validate a single component reference
     */
    validateComponentReference(reference, document, lineIndex, parameterName) {
        const text = document.getText();
        const lines = text.split('\n');
        const line = lines[lineIndex];
        // Parse the component reference
        const parts = reference.split('.');
        if (parts.length < 3) {
            return null; // Not a valid component reference
        }
        // Find the component type and label
        let componentType = '';
        let componentLabel = '';
        let propertyPath = '';
        // Try to find the component type by checking against available components
        for (let i = 0; i < parts.length - 1; i++) {
            const possibleType = parts.slice(0, i + 1).join('.');
            if (this.componentData[possibleType]) {
                componentType = possibleType;
                componentLabel = parts[i + 1];
                propertyPath = parts.slice(i + 2).join('.');
                break;
            }
        }
        if (!componentType || !componentLabel) {
            return null; // Could not parse component reference
        }
        // Get the component data
        const componentInfo = this.componentData[componentType];
        if (!componentInfo) {
            return {
                range: node_1.Range.create(lineIndex, line.indexOf(reference), lineIndex, line.indexOf(reference) + reference.length),
                message: `Unknown component type '${componentType}'`
            };
        }
        // Check if the component has exported fields
        let exportedFields = null;
        if (componentInfo.lsp_structure && componentInfo.lsp_structure.exported_fields) {
            exportedFields = componentInfo.lsp_structure.exported_fields;
        }
        else if (componentInfo.exported_fields) {
            exportedFields = componentInfo.exported_fields;
        }
        if (!exportedFields) {
            return {
                range: node_1.Range.create(lineIndex, line.indexOf(reference), lineIndex, line.indexOf(reference) + reference.length),
                message: `Component '${componentType}' does not export any fields`
            };
        }
        // Find the exported field
        const exportedField = exportedFields[propertyPath];
        if (!exportedField) {
            const availableFields = Object.keys(exportedFields).join(', ');
            return {
                range: node_1.Range.create(lineIndex, line.indexOf(reference), lineIndex, line.indexOf(reference) + reference.length),
                message: `Component '${componentType}' does not export field '${propertyPath}'. Available fields: ${availableFields}`
            };
        }
        // Check type compatibility
        const expectedType = this.getExpectedParameterType(document, lineIndex, parameterName);
        if (expectedType && exportedField.type) {
            const actualType = exportedField.type;
            if (!this.areTypesCompatible(actualType, expectedType)) {
                return {
                    range: node_1.Range.create(lineIndex, line.indexOf(reference), lineIndex, line.indexOf(reference) + reference.length),
                    message: `Type mismatch: expected '${expectedType}' but got '${actualType}' for parameter '${parameterName}'`
                };
            }
        }
        return null; // No validation errors
    }
    /**
     * Map configuration severity to diagnostic severity
     */
    mapSeverity(severity) {
        switch (severity) {
            case 'error':
                return node_1.DiagnosticSeverity.Error;
            case 'warning':
                return node_1.DiagnosticSeverity.Warning;
            case 'info':
                return node_1.DiagnosticSeverity.Information;
            default:
                return node_1.DiagnosticSeverity.Hint;
        }
    }
}
exports.AlloyDiagnosticsProvider = AlloyDiagnosticsProvider;
/**
 * Main function to get diagnostics for a document
 */
async function getDocumentDiagnostics(document) {
    try {
        // Get component data
        const componentData = await utils.getAllAvailableComponents(document);
        if (Object.keys(componentData).length === 0) {
            return [];
        }
        const provider = new AlloyDiagnosticsProvider(componentData);
        const diagnostics = [];
        // Validate parameter types (works inside and outside declare blocks)
        diagnostics.push(...provider.validateParameterTypes(document));
        // Validate unused arguments in declare blocks
        diagnostics.push(...provider.validateUnusedArguments(document));
        // Validate undefined arguments referenced in declare blocks
        diagnostics.push(...provider.validateUndefinedArguments(document));
        // Validate component reference exports and types
        diagnostics.push(...provider.validateComponentReferences(document));
        return diagnostics;
    }
    catch (error) {
        console.error('Error in getDocumentDiagnostics:', error);
        return [];
    }
}
/**
 * Get workspace diagnostics
 */
async function getWorkspaceDiagnostics(documents) {
    const diagnostics = [];
    for (const document of documents.all()) {
        try {
            const documentDiagnostics = await getDocumentDiagnostics(document);
            if (documentDiagnostics.length > 0) {
                diagnostics.push({
                    uri: document.uri,
                    items: documentDiagnostics
                });
            }
        }
        catch (error) {
            console.error(`Error processing document ${document.uri}:`, error);
        }
    }
    return diagnostics;
}
