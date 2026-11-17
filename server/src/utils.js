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
exports.ScopeManager = exports.RangeUtils = exports.DocumentContextManager = exports.ConfigDataManager = exports.isKnownComponent = exports.getBlockArguments = exports.getComponentArguments = exports.getRequiredBlocks = exports.getBlockDescription = exports.getAvailableBlocksAtPath = exports.getBlockStructure = exports.getComponentData = exports.findComponentAtPosition = exports.getAllComponentData = exports.ProviderTemplate = exports.PerformanceOptimizer = exports.ErrorHandler = exports.PositionFactory = exports.ResponseManager = exports.ComponentAnalyzer = exports.ProviderContext = exports.componentParser = exports.COMPONENT_REFERENCE_PATTERN = void 0;
exports.isInsideQuotes = isInsideQuotes;
exports.isInsideComment = isInsideComment;
exports.parseComponentReferencesInDocument = parseComponentReferencesInDocument;
exports.parseComponentDeclarationAtPosition = parseComponentDeclarationAtPosition;
exports.getWordAtPositionInComponentDeclaration = getWordAtPositionInComponentDeclaration;
exports.isValidComponentType = isValidComponentType;
exports.detectComponentInContent = detectComponentInContent;
exports.getCachedWorkspaceComponents = getCachedWorkspaceComponents;
exports.clearWorkspaceComponentCache = clearWorkspaceComponentCache;
exports.findArgumentReferencesInDocument = findArgumentReferencesInDocument;
exports.findDeclareInstantiationsInDocument = findDeclareInstantiationsInDocument;
exports.findDeclareBlockInDocument = findDeclareBlockInDocument;
exports.findArgumentInDocument = findArgumentInDocument;
exports.checkArgumentReference = checkArgumentReference;
exports.checkDeclareInstantiation = checkDeclareInstantiation;
exports.getAllWorkspaceComponents = getAllWorkspaceComponents;
exports.getCachedWorkspaceComponentsFromService = getCachedWorkspaceComponentsFromService;
exports.getWorkspaceDiagnosticsData = getWorkspaceDiagnosticsData;
exports.clearWorkspaceCache = clearWorkspaceCache;
exports.parseDocument = parseDocument;
exports.parseComponentsInDeclareBlocks = parseComponentsInDeclareBlocks;
exports.parseAllComponents = parseAllComponents;
exports.parseConfigBlocks = parseConfigBlocks;
exports.findBlockAtPosition = findBlockAtPosition;
exports.extractDeclareStructure = extractDeclareStructure;
exports.getDeclaredComponents = getDeclaredComponents;
exports.isDeclaredComponent = isDeclaredComponent;
exports.getWorkspaceFromDocuments = getWorkspaceFromDocuments;
exports.isDeclaredComponentWorkspace = isDeclaredComponentWorkspace;
exports.isDeclaredArgument = isDeclaredArgument;
exports.isDeclaredExport = isDeclaredExport;
exports.getAllAvailableComponents = getAllAvailableComponents;
exports.getComponentContext = getComponentContext;
exports.getBlockContext = getBlockContext;
exports.findParsedComponent = findParsedComponent;
exports.findParsedComponentAtPosition = findParsedComponentAtPosition;
exports.findBlockByPath = findBlockByPath;
exports.hasValidComponentData = hasValidComponentData;
exports.getCurrentWord = getCurrentWord;
exports.isInsideComponentBlock = isInsideComponentBlock;
exports.getFullContext = getFullContext;
exports.getComponent = getComponent;
exports.findScopeAtPosition = findScopeAtPosition;
exports.getReferences = getReferences;
exports.getAllComponentDeclarations = getAllComponentDeclarations;
exports.getAllComponentDeclarationsWorkspace = getAllComponentDeclarationsWorkspace;
exports.getWordAtPosition = getWordAtPosition;
exports.getWordAtPositionInReference = getWordAtPositionInReference;
exports.findWordRange = findWordRange;
exports.findComponentReferenceFromLabel = findComponentReferenceFromLabel;
exports.getRenameableInfo = getRenameableInfo;
exports.getComponentReferences = getComponentReferences;
exports.createComponentLabelMap = createComponentLabelMap;
exports.findAllComponentReferences = findAllComponentReferences;
exports.findAllComponentReferencesInWorkspace = findAllComponentReferencesInWorkspace;
exports.getComponentAtPosition = getComponentAtPosition;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const node_1 = require("vscode-languageserver/node");
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
const parser_1 = require("./parser");
const workspaceComponentService_1 = require("./workspaceComponentService");
/**
 * The component reference regex pattern used across all providers
 */
exports.COMPONENT_REFERENCE_PATTERN = /\b([a-zA-Z_][a-zA-Z0-9_.]*\b)/g;
/**
 * Check if a match is inside quoted strings
 */
function isInsideQuotes(text, index) {
    let quoteCount = 0;
    for (let i = 0; i < index; i++) {
        if (text[i] === '"' && (i === 0 || text[i - 1] !== '\\')) {
            quoteCount++;
        }
    }
    return quoteCount % 2 === 1;
}
/**
 * Check if a match is inside commented sections
 */
function isInsideComment(lineText, matchIndex) {
    const beforeMatch = lineText.substring(0, matchIndex);
    const commentStart = beforeMatch.indexOf('//');
    return commentStart !== -1;
}
/**
 * Core function to find and parse component references in document lines
 * This centralizes the component reference parsing logic used by all providers
 */
function parseComponentReferencesInDocument(document, allComponentData) {
    const matches = [];
    const content = document.getText();
    const lines = content.split('\n');
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        const pattern = new RegExp(exports.COMPONENT_REFERENCE_PATTERN);
        let match;
        while ((match = pattern.exec(line)) !== null) {
            const potentialRef = match[1];
            const parts = potentialRef.split('.');
            // Skip component declarations (lines that look like component declarations)
            const trimmed = line.trim();
            const componentDeclMatch = trimmed.match(/^[a-zA-Z_.][a-zA-Z0-9_.]*\s+"[^"]*"(\s*\{|\s*$)/);
            if (componentDeclMatch && match.index === line.indexOf(trimmed)) {
                continue;
            }
            // Skip matches that are inside quoted strings
            if (isInsideQuotes(line, match.index)) {
                continue;
            }
            // Skip matches that are inside commented sections
            if (isInsideComment(line, match.index)) {
                continue;
            }
            // Check if this looks like a component reference (at least component.type.label)
            if (parts.length >= 3) {
                let componentType = '';
                let componentLabel = '';
                let foundMatch = false;
                // First check if this is a declared component export: main.eu.export_name
                if (parts.length >= 3 && allComponentData[parts[0]] && allComponentData[parts[0]].isDeclared) {
                    componentType = parts[0];
                    componentLabel = parts[1];
                    foundMatch = true;
                }
                else {
                    // Try different splits to find the component type and label for built-in components
                    for (let i = 0; i < parts.length - 1; i++) {
                        const possibleType = parts.slice(0, i + 1).join('.');
                        const possibleLabel = parts[i + 1];
                        // Check if this is a valid component type
                        if (allComponentData[possibleType]) {
                            componentType = possibleType;
                            componentLabel = possibleLabel;
                            foundMatch = true;
                            break;
                        }
                    }
                }
                let property;
                if (foundMatch) {
                    if (allComponentData[componentType] && allComponentData[componentType].isDeclared) {
                        // For declared components: main.eu.export_name -> property is export_name
                        property = parts.length > 2 ? parts.slice(2).join('.') : undefined;
                    }
                    else {
                        // For built-in components: component.type.label.property -> property calculation
                        property = parts.length > (componentType.split('.').length + 1)
                            ? parts.slice(componentType.split('.').length + 1).join('.')
                            : undefined;
                    }
                }
                matches.push({
                    lineIndex,
                    matchIndex: match.index,
                    matchedText: potentialRef,
                    componentType: foundMatch ? componentType : '',
                    componentLabel: foundMatch ? componentLabel : '',
                    property,
                    isValidReference: foundMatch
                });
            }
        }
    }
    return matches;
}
/**
 * Parse a component declaration line and extract component type and name
 * @param line The line of text to parse
 * @param character The character position in the line
 * @returns ComponentDeclarationInfo if parsing succeeds, null otherwise
 */
function parseComponentDeclarationAtPosition(line, character) {
    const trimmed = line.trim();
    // Check for declare blocks: declare "component_name"
    const declareMatch = trimmed.match(/^declare\s+"([^"]+)"\s*\{/);
    if (declareMatch) {
        return {
            componentType: 'declare',
            declarationType: 'declare',
            declarationName: declareMatch[1]
        };
    }
    // Check for argument declarations: argument "argument_name"
    const argumentMatch = trimmed.match(/^argument\s+"([^"]+)"\s*\{/);
    if (argumentMatch) {
        return {
            componentType: 'argument',
            declarationType: 'argument',
            declarationName: argumentMatch[1]
        };
    }
    // Check for export declarations: export "export_name"
    const exportMatch = trimmed.match(/^export\s+"([^"]+)"\s*\{/);
    if (exportMatch) {
        return {
            componentType: 'export',
            declarationType: 'export',
            declarationName: exportMatch[1]
        };
    }
    // Check for regular component declarations: component_type "component_name" {
    const componentMatch = trimmed.match(/^([a-zA-Z_.][a-zA-Z0-9_.]*)\s*(?:"([^"]*)")?\s*\{/);
    if (componentMatch) {
        const componentType = componentMatch[1];
        const componentName = componentMatch[2];
        // Find the position of the component type
        const componentTypeIndex = line.indexOf(componentType);
        if (componentTypeIndex !== -1) {
            const componentTypeStart = componentTypeIndex;
            const componentTypeEnd = componentTypeIndex + componentType.length;
            // If cursor is on the component type, return component type info
            if (character >= componentTypeStart && character < componentTypeEnd) {
                return {
                    componentType,
                    componentName,
                    declarationType: 'component'
                };
            }
        }
        // If there's a component name, check if cursor is on the name
        if (componentName) {
            const nameQuotePattern = `"${componentName}"`;
            const nameQuoteIndex = line.indexOf(nameQuotePattern);
            if (nameQuoteIndex !== -1) {
                const nameStart = nameQuoteIndex;
                const nameEnd = nameQuoteIndex + nameQuotePattern.length;
                // If cursor is on the component name, return component name info
                if (character >= nameStart && character < nameEnd) {
                    return {
                        componentType,
                        componentName,
                        declarationType: 'component'
                    };
                }
            }
        }
        // Default fallback - return component type
        return {
            componentType,
            componentName,
            declarationType: 'component'
        };
    }
    return null;
}
/**
 * Get the word at a specific position in a component declaration
 * @param line The line of text to parse
 * @param character The character position in the line
 * @returns The word/name at the cursor position, or null if not found
 */
function getWordAtPositionInComponentDeclaration(line, character) {
    const declarationInfo = parseComponentDeclarationAtPosition(line, character);
    if (!declarationInfo) {
        return null;
    }
    // For config blocks (declare/argument/export), return the declaration name
    if (declarationInfo.declarationType !== 'component') {
        return declarationInfo.declarationName || declarationInfo.componentType;
    }
    // For component declarations, determine what the cursor is on
    const componentTypeIndex = line.indexOf(declarationInfo.componentType);
    if (componentTypeIndex !== -1) {
        const componentTypeStart = componentTypeIndex;
        const componentTypeEnd = componentTypeIndex + declarationInfo.componentType.length;
        // If cursor is on the component type, return component type
        if (character >= componentTypeStart && character < componentTypeEnd) {
            return declarationInfo.componentType;
        }
    }
    // If there's a component name, check if cursor is on the name
    if (declarationInfo.componentName) {
        const nameQuotePattern = `"${declarationInfo.componentName}"`;
        const nameQuoteIndex = line.indexOf(nameQuotePattern);
        if (nameQuoteIndex !== -1) {
            const nameStart = nameQuoteIndex;
            const nameEnd = nameQuoteIndex + nameQuotePattern.length;
            // If cursor is on the component name, return component name
            if (character >= nameStart && character < nameEnd) {
                return declarationInfo.componentName;
            }
        }
    }
    // Default fallback
    return declarationInfo.componentType;
}
/**
 * Check if a word is a valid component type that can be renamed
 * @param word The word to check
 * @returns true if the word is a renameable component type
 */
function isValidComponentType(word) {
    // Component types should have dots and follow the pattern like "otelcol.processor.transform"
    if (!word.includes('.')) {
        return false;
    }
    // Check if it matches component type pattern
    if (!word.match(/^[a-zA-Z_.][a-zA-Z0-9_.]*$/)) {
        return false;
    }
    // Don't treat simple words like "default", "metrics" as component types
    const parts = word.split('.');
    if (parts.length < 2) {
        return false;
    }
    // Basic heuristic: component types typically start with known prefixes
    const commonPrefixes = ['otelcol', 'prometheus', 'loki', 'discovery', 'logging', 'tracing'];
    const firstPart = parts[0];
    // If it starts with a known component prefix, it's likely a component type
    if (commonPrefixes.includes(firstPart)) {
        return true;
    }
    // If it has multiple dots and looks like a component type, allow it
    if (parts.length >= 3) {
        return true;
    }
    return false;
}
class ComponentParser {
    constructor(componentsDir) {
        this.componentRegistry = {};
        if (componentsDir) {
            this.componentsDir = componentsDir;
        }
        else {
            // Check if we're running from compiled output (out/src) or source (src)
            const currentDir = __dirname;
            // If we're in out/src, go back to project root and then to src/components
            if (currentDir.includes(path.join('out', 'src'))) {
                this.componentsDir = path.join(__dirname, "..", "..", "..", "src", "components");
            }
            // If we're in src, the components are in the same src directory
            else if (currentDir.endsWith('src')) {
                this.componentsDir = path.join(__dirname, "components");
            }
            // Fallback: try both locations
            else {
                const srcPath = path.join(__dirname, "components");
                const outPath = path.join(__dirname, "..", "..", "..", "src", "components");
                if (fs.existsSync(srcPath)) {
                    this.componentsDir = srcPath;
                }
                else if (fs.existsSync(outPath)) {
                    this.componentsDir = outPath;
                }
                else {
                    // Last resort: try the original logic
                    this.componentsDir = path.join(__dirname, "..", "src", "components");
                }
            }
        }
    }
    loadComponentData() {
        try {
            // First try to load from the config_blocks_data.json file
            const configBlocksPath = path.join(__dirname, "config_blocks", "config_blocks_data.json");
            if (fs.existsSync(configBlocksPath)) {
                try {
                    const data = fs.readFileSync(configBlocksPath, "utf8");
                    const allComponents = JSON.parse(data);
                    // Process each component from the config_blocks_data.json
                    for (const [componentName, componentData] of Object.entries(allComponents)) {
                        try {
                            const transformedData = this.transformComponentData(componentData);
                            this.componentRegistry[componentName] = transformedData;
                        }
                        catch (error) {
                            // Silently handle individual component processing errors
                        }
                    }
                    return this.componentRegistry;
                }
                catch (error) {
                    // Silently handle config_blocks_data.json loading errors
                }
            }
            // Fallback to the original components directory approach
            if (!fs.existsSync(this.componentsDir)) {
                return {};
            }
            const files = fs.readdirSync(this.componentsDir);
            const jsonFiles = files.filter((file) => file.endsWith(".json"));
            for (const jsonFile of jsonFiles) {
                const filePath = path.join(this.componentsDir, jsonFile);
                try {
                    const data = fs.readFileSync(filePath, "utf8");
                    const rawData = JSON.parse(data);
                    // Transform the raw JSON data into the expected ComponentData format with lsp_structure
                    const componentData = this.transformComponentData(rawData);
                    this.componentRegistry[componentData.name] = componentData;
                }
                catch (error) {
                    // Silently handle component file loading errors
                }
            }
            return this.componentRegistry;
        }
        catch (error) {
            return {};
        }
    }
    /**
     * Transform raw JSON component data into the expected ComponentData format with lsp_structure
     * Uses the lsp_structure from the JSON file directly if available
     */
    transformComponentData(rawData) {
        let lspStructure;
        // If the JSON file already has lsp_structure, use it directly
        if (rawData.lsp_structure) {
            lspStructure = rawData.lsp_structure;
        }
        else {
            // Fallback to transformation logic for older format
            lspStructure = transformToLspStructure({
                arguments: rawData.arguments || [],
                blocks: rawData.blocks || []
            });
        }
        // Create the ComponentData with lsp_structure
        const componentData = {
            name: rawData.name,
            usage: rawData.usage || `${rawData.name} component`,
            template: rawData.template || `${rawData.name} "\${1:label}" {\n  $0\n}`,
            arguments: rawData.arguments || [],
            blocks: rawData.blocks || [],
            lsp_structure: lspStructure
        };
        return componentData;
    }
    getComponentData(componentName) {
        if (Object.keys(this.componentRegistry).length === 0) {
            this.loadComponentData();
        }
        if (componentName) {
            return this.componentRegistry[componentName] || null;
        }
        // Return the first component if no specific name is requested
        const firstComponent = Object.values(this.componentRegistry)[0];
        return firstComponent || null;
    }
    getAllComponentData() {
        if (Object.keys(this.componentRegistry).length === 0) {
            this.loadComponentData();
        }
        return this.componentRegistry;
    }
    getBlockStructure(componentName) {
        const data = this.getComponentData(componentName);
        return data ? data.lsp_structure.blocks : null;
    }
    getRequiredBlocks(componentName) {
        const data = this.getComponentData(componentName);
        return data ? data.lsp_structure.required_blocks : [];
    }
    findComponentAtPosition(content, position) {
        const allComponentData = this.getAllComponentData();
        const knownComponents = Object.keys(allComponentData);
        return parser_1.alloyParser.findComponentAtPosition(content, position, knownComponents);
    }
    findBlockAtPosition(content, position) {
        return parser_1.alloyParser.findBlockAtPosition(content, position);
    }
    getAvailableBlocksAtPath(blockPath, componentName) {
        const structure = this.getBlockStructure(componentName);
        if (!structure)
            return [];
        const componentData = this.getComponentData(componentName);
        if (!componentData)
            return [];
        // If the path is empty or contains only the component name, return top-level blocks
        if (blockPath.length === 0 ||
            (blockPath.length === 1 && blockPath[0] === componentData.name)) {
            return Object.keys(structure);
        }
        let current = structure;
        for (const pathSegment of blockPath) {
            if (current[pathSegment] && current[pathSegment].children) {
                current = current[pathSegment].children;
            }
            else {
                return [];
            }
        }
        return Object.keys(current);
    }
    getBlockDescription(blockPath, componentName) {
        const structure = this.getBlockStructure(componentName);
        if (!structure)
            return null;
        let current = structure;
        for (const pathSegment of blockPath) {
            if (current[pathSegment]) {
                if (pathSegment === blockPath[blockPath.length - 1]) {
                    return current[pathSegment].description;
                }
                current = current[pathSegment].children;
            }
            else {
                return null;
            }
        }
        return null;
    }
    /**
     * Check if a component is known (exists in registry)
     */
    isKnownComponent(componentName) {
        const allComponentData = this.getAllComponentData();
        const componentData = allComponentData[componentName];
        return !!(componentData && componentData.lsp_structure);
    }
    /**
     * Get component arguments for a specific component
     */
    getComponentArguments(componentName) {
        const data = this.getComponentData(componentName);
        return data ? data.lsp_structure.arguments : null;
    }
    /**
     * Get block arguments for a specific block path
     */
    getBlockArguments(blockPath, componentName) {
        const structure = this.getBlockStructure(componentName);
        if (!structure)
            return [];
        let current = structure;
        for (const pathSegment of blockPath) {
            if (current[pathSegment]) {
                if (pathSegment === blockPath[blockPath.length - 1]) {
                    return current[pathSegment].arguments || [];
                }
                current = current[pathSegment].children;
            }
            else {
                return [];
            }
        }
        return [];
    }
}
// Helper function to detect component in content
function detectComponentInContent(content) {
    const lines = content.split("\n");
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("//")) {
            const allComponentData = exports.componentParser.getAllComponentData();
            for (const componentName of Object.keys(allComponentData)) {
                if (trimmed.startsWith(componentName)) {
                    return componentName;
                }
            }
        }
    }
    return null;
}
// Singleton instance
exports.componentParser = new ComponentParser();
// Workspace component cache for performance
let workspaceComponentCache = null;
let workspaceCacheTimestamp = 0;
const CACHE_DURATION = 30000; // 30 seconds
/**
 * Get cached workspace components with automatic invalidation
 */
function getCachedWorkspaceComponents(documents) {
    const now = Date.now();
    // Invalidate cache if it's older than CACHE_DURATION
    if (workspaceComponentCache && (now - workspaceCacheTimestamp) > CACHE_DURATION) {
        workspaceComponentCache = null;
    }
    // Return cached result if available
    if (workspaceComponentCache) {
        return workspaceComponentCache;
    }
    // Compute and cache new result
    workspaceComponentCache = getAllAvailableComponents(undefined, documents);
    workspaceCacheTimestamp = now;
    return workspaceComponentCache;
}
/**
 * Clear workspace component cache (call when files change)
 */
function clearWorkspaceComponentCache() {
    workspaceComponentCache = null;
    workspaceCacheTimestamp = 0;
}
// ================================================================================================
// UNIFIED MANAGER CLASSES - DRY ELIMINATION
// ================================================================================================
/**
 * Unified Provider Context Manager
 * Handles common provider initialization patterns
 */
class ProviderContext {
    constructor(document, position, documents, workspaceFolders) {
        this.document = document;
        this.position = position;
        this.documents = documents;
        this.workspaceFolders = workspaceFolders;
    }
    /**
     * Create a provider context with validation
     */
    static create(params, documents, workspaceFolders = []) {
        const document = documents.get(params.textDocument.uri);
        if (!document) {
            return null;
        }
        return new ProviderContext(document, params.position, documents, workspaceFolders);
    }
    /**
     * Get word at current position
     */
    getWordAtPosition() {
        return getWordAtPosition(this.document, this.position);
    }
    /**
     * Get all workspace components (cached)
     */
    async getAllWorkspaceComponents() {
        return await getAllWorkspaceComponents(this.documents, this.workspaceFolders);
    }
    /**
     * Get line text at current position
     */
    getCurrentLineText() {
        return this.document.getText({
            start: { line: this.position.line, character: 0 },
            end: { line: this.position.line + 1, character: 0 }
        }).replace(/\n$/, '');
    }
}
exports.ProviderContext = ProviderContext;
/**
 * Unified Component Analysis Manager
 * Handles component detection and analysis patterns
 */
class ComponentAnalyzer {
    constructor(allComponentData) {
        this.allComponentData = allComponentData;
    }
    /**
     * Create analyzer with workspace components
     */
    static async create(documents, workspaceFolders) {
        const allComponentData = await getAllWorkspaceComponents(documents, workspaceFolders);
        return new ComponentAnalyzer(allComponentData);
    }
    /**
     * Check if component exists
     */
    hasComponent(componentName) {
        return !!this.allComponentData[componentName];
    }
    /**
     * Get component data
     */
    getComponent(componentName) {
        return this.allComponentData[componentName];
    }
    /**
     * Parse complex component references like "otelcol.processor.transform.default.input"
     */
    parseComplexReference(wordAtPosition, document) {
        let componentName = wordAtPosition;
        let componentLabel;
        let property;
        if (wordAtPosition.includes('.')) {
            const parts = wordAtPosition.split('.');
            if (parts.length >= 2) {
                componentName = parts[0];
                // Try to find the longest matching component name
                for (let i = 1; i <= parts.length; i++) {
                    const potentialComponent = parts.slice(0, i).join('.');
                    if (this.hasComponent(potentialComponent) || isDeclaredComponent(document, potentialComponent)) {
                        componentName = potentialComponent;
                        if (i < parts.length) {
                            componentLabel = parts[i];
                            if (i + 1 < parts.length) {
                                property = parts.slice(i + 1).join('.');
                            }
                        }
                        break;
                    }
                }
            }
        }
        return { componentName, componentLabel, property };
    }
}
exports.ComponentAnalyzer = ComponentAnalyzer;
/**
 * Unified Response Manager
 * Handles common response patterns and error handling
 */
class ResponseManager {
    /**
     * Safe null check with early return pattern
     */
    static validateAndReturn(value, fallback = null) {
        return value ?? fallback;
    }
    /**
     * Create location from position range
     */
    static createLocation(uri, startLine, startChar, endLine, endChar) {
        return node_1.Location.create(uri, node_1.Range.create(node_1.Position.create(startLine, startChar), node_1.Position.create(endLine, endChar)));
    }
    /**
     * Create location from word at position
     */
    static createLocationFromWord(document, position, word) {
        const lineText = document.getText({
            start: { line: position.line, character: 0 },
            end: { line: position.line + 1, character: 0 }
        });
        const wordIndex = lineText.indexOf(word);
        if (wordIndex === -1)
            return null;
        return this.createLocation(document.uri, position.line, wordIndex, position.line, wordIndex + word.length);
    }
}
exports.ResponseManager = ResponseManager;
/**
 * Advanced Position & Range Factory
 * Eliminates 190+ duplicate Range.create() and Position.create() patterns
 */
class PositionFactory {
    /**
     * Create position with validation
     */
    static position(line, character) {
        return node_1.Position.create(Math.max(0, line), Math.max(0, character));
    }
    /**
     * Create range with validation
     */
    static range(startLine, startChar, endLine, endChar) {
        return node_1.Range.create(this.position(startLine, startChar), this.position(endLine, endChar));
    }
    /**
     * Create range on same line
     */
    static rangeSameLine(line, startChar, endChar) {
        return this.range(line, startChar, line, endChar);
    }
    /**
     * Create range from word bounds
     */
    static rangeFromWord(line, wordStart, wordLength) {
        return this.rangeSameLine(line, wordStart, wordStart + wordLength);
    }
    /**
     * Create location with our factory methods
     */
    static location(uri, startLine, startChar, endLine, endChar) {
        return node_1.Location.create(uri, this.range(startLine, startChar, endLine, endChar));
    }
    /**
     * Create location from word match
     */
    static locationFromMatch(uri, lineIndex, matchIndex, matchLength) {
        return node_1.Location.create(uri, this.rangeFromWord(lineIndex, matchIndex, matchLength));
    }
}
exports.PositionFactory = PositionFactory;
/**
 * Unified Error Handler
 * Standardizes error handling across all providers
 */
class ErrorHandler {
    /**
     * Handle provider errors with consistent logging
     */
    static handleProviderError(providerName, error, context) {
        const message = context
            ? `${providerName} error in ${context}: ${error}`
            : `${providerName} error: ${error}`;
        // Silently handle warnings
        return null;
    }
    /**
     * Safe execution wrapper with error handling
     */
    static async safeExecute(operation, providerName, fallback = null) {
        try {
            return await operation();
        }
        catch (error) {
            return this.handleProviderError(providerName, error) ?? fallback;
        }
    }
    /**
     * Validate required parameters
     */
    static validateParams(params, required) {
        return required.every(key => params[key] !== null && params[key] !== undefined);
    }
}
exports.ErrorHandler = ErrorHandler;
/**
 * Performance Optimizer
 * Centralized performance optimizations and caching
 */
class PerformanceOptimizer {
    /**
     * Memoized function wrapper
     */
    static memoize(fn, keyGenerator, ttl = 60000 // 1 minute default
    ) {
        return (...args) => {
            const key = keyGenerator(...args);
            const cached = this.cache.get(key);
            const now = Date.now();
            if (cached && (now - cached.timestamp) < cached.ttl) {
                return cached.data;
            }
            const result = fn(...args);
            this.cache.set(key, { data: result, timestamp: now, ttl });
            return result;
        };
    }
    /**
     * Clear expired cache entries
     */
    static cleanupCache() {
        const now = Date.now();
        for (const [key, entry] of this.cache.entries()) {
            if ((now - entry.timestamp) > entry.ttl) {
                this.cache.delete(key);
            }
        }
    }
    /**
     * Get cache statistics
     */
    static getCacheStats() {
        return {
            size: this.cache.size,
            entries: Array.from(this.cache.keys())
        };
    }
}
exports.PerformanceOptimizer = PerformanceOptimizer;
PerformanceOptimizer.cache = new Map();
/**
 * Provider Template Factory
 * Creates consistent provider structure for easy development
 */
class ProviderTemplate {
    /**
     * Standard provider wrapper with error handling and context management
     */
    static async wrapProvider(providerName, params, documents, workspaceFolders, handler) {
        return ErrorHandler.safeExecute(async () => {
            // Unified context creation
            const context = ProviderContext.create(params, documents, workspaceFolders);
            if (!context) {
                return null;
            }
            // Unified component analysis
            const analyzer = await ComponentAnalyzer.create(documents, workspaceFolders);
            // Execute provider logic
            return await handler(context, analyzer);
        }, providerName);
    }
    /**
     * Create standardized range response
     */
    static createRangeResponse(uri, lineIndex, startChar, endChar) {
        return PositionFactory.location(uri, lineIndex, startChar, lineIndex, endChar);
    }
}
exports.ProviderTemplate = ProviderTemplate;
// ================================================================================================
// UNIFIED WORKSPACE FUNCTIONS - ALL PROVIDERS SHOULD USE THESE
// ================================================================================================
/**
 * Find all argument.name.value references in a document
 */
function findArgumentReferencesInDocument(document, argumentName) {
    const references = [];
    const content = document.getText();
    const lines = content.split('\n');
    const argumentPattern = new RegExp(`\\bargument\\.${argumentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.value\\b`, 'g');
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        let match;
        // Reset regex lastIndex for each line
        argumentPattern.lastIndex = 0;
        while ((match = argumentPattern.exec(line)) !== null) {
            const matchStart = match.index;
            const argNameStart = matchStart + 9; // "argument.".length
            const argNameEnd = argNameStart + argumentName.length;
            references.push({
                uri: document.uri,
                range: node_1.Range.create(node_1.Position.create(lineIndex, argNameStart), node_1.Position.create(lineIndex, argNameEnd))
            });
        }
    }
    return references;
}
/**
 * Find all instantiations of a declare block in a document
 */
function findDeclareInstantiationsInDocument(document, declareName) {
    const references = [];
    const content = document.getText();
    const lines = content.split('\n');
    const instantiationPattern = new RegExp(`^(\\s*)${declareName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+"([^"]*)"\\s*\\{`, 'gm');
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        let match;
        // Reset regex lastIndex for each line
        instantiationPattern.lastIndex = 0;
        while ((match = instantiationPattern.exec(line)) !== null) {
            const matchStart = match.index;
            const nameStart = matchStart + match[1].length; // Skip indentation
            const nameEnd = nameStart + declareName.length;
            references.push({
                uri: document.uri,
                range: node_1.Range.create(node_1.Position.create(lineIndex, nameStart), node_1.Position.create(lineIndex, nameEnd))
            });
        }
    }
    return references;
}
/**
 * Find declare block definition within a specific document
 */
function findDeclareBlockInDocument(document, declareName) {
    const content = document.getText();
    const lines = content.split('\n');
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        // Look for declare blocks: declare "name" {
        const declarePattern = new RegExp(`\\bdeclare\\s+"${declareName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*\\{`);
        const match = line.match(declarePattern);
        if (match) {
            const startChar = match.index || 0;
            const nameStart = line.indexOf(`"${declareName}"`, startChar);
            const nameEnd = nameStart + declareName.length + 2; // +2 for quotes
            return {
                uri: document.uri,
                range: node_1.Range.create(node_1.Position.create(lineIndex, nameStart + 1), // +1 to skip opening quote
                node_1.Position.create(lineIndex, nameEnd - 1) // -1 to skip closing quote
                )
            };
        }
    }
    return null;
}
/**
 * Find argument definition within a specific document
 */
function findArgumentInDocument(document, argumentName) {
    const content = document.getText();
    const lines = content.split('\n');
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        // Look for argument blocks: argument "name" { ... }
        const argPattern = new RegExp(`\\bargument\\s+"${argumentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*\\{`);
        const match = line.match(argPattern);
        if (match) {
            const startChar = match.index || 0;
            const nameStart = line.indexOf(`"${argumentName}"`, startChar);
            const nameEnd = nameStart + argumentName.length + 2; // +2 for quotes
            return {
                uri: document.uri,
                range: node_1.Range.create(node_1.Position.create(lineIndex, nameStart + 1), // +1 to skip opening quote
                node_1.Position.create(lineIndex, nameEnd - 1) // -1 to skip closing quote
                )
            };
        }
    }
    return null;
}
/**
 * Check if the current position is on an argument reference (argument.name.value)
 */
function checkArgumentReference(document, position) {
    const line = document.getText({
        start: { line: position.line, character: 0 },
        end: { line: position.line, character: 1000 }
    });
    const beforeCursor = line.substring(0, position.character);
    const afterCursor = line.substring(position.character);
    // Look for argument.name.value pattern around the cursor
    const fullLine = beforeCursor + afterCursor;
    const argumentPattern = /argument\.([a-zA-Z_][a-zA-Z0-9_]*)\.value/g;
    let match;
    while ((match = argumentPattern.exec(fullLine)) !== null) {
        const matchStart = match.index;
        const matchEnd = match.index + match[0].length;
        // Check if cursor is within this match
        if (position.character >= matchStart && position.character <= matchEnd) {
            const argumentName = match[1];
            // Check which part of the reference the cursor is on
            const argNameStart = matchStart + 9; // "argument.".length
            const argNameEnd = argNameStart + argumentName.length;
            if (position.character >= argNameStart && position.character <= argNameEnd) {
                // Cursor is on the argument name
                return { argumentName, isValueAccess: false };
            }
            else if (position.character >= argNameEnd) {
                // Cursor is on .value part
                return { argumentName, isValueAccess: true };
            }
        }
    }
    return null;
}
/**
 * Check if the current position is on a declare block instantiation (function call)
 */
function checkDeclareInstantiation(document, position) {
    const line = document.getText({
        start: { line: position.line, character: 0 },
        end: { line: position.line, character: 1000 }
    });
    // Look for component instantiation pattern: component_name "label" {
    const componentPattern = /^(\s*)([a-zA-Z_][a-zA-Z0-9_.]*)\s+"([^"]*)"\s*\{/;
    const match = line.match(componentPattern);
    if (match) {
        const componentName = match[2];
        const indentation = match[1];
        const nameStart = indentation.length;
        const nameEnd = nameStart + componentName.length;
        // Check if cursor is within the component name
        if (position.character >= nameStart && position.character <= nameEnd) {
            // Check if this component is declared (not a builtin component)
            if (isDeclaredComponent(document, componentName)) {
                return { declareName: componentName };
            }
        }
    }
    return null;
}
/**
 * Get all workspace documents (opened + workspace files)
 */
async function getAllWorkspaceComponents(documents, workspaceFolders) {
    return await workspaceComponentService_1.workspaceComponentService.getAllWorkspaceComponents(documents, workspaceFolders);
}
/**
 * Get cached workspace components (unified function for providers)
 */
function getCachedWorkspaceComponentsFromService(documents) {
    return workspaceComponentService_1.workspaceComponentService.getCachedWorkspaceComponents(documents);
}
/**
 * Get workspace diagnostics data (unified function for providers)
 */
async function getWorkspaceDiagnosticsData(documents, workspaceFolders) {
    return await workspaceComponentService_1.workspaceComponentService.getWorkspaceDiagnosticsData(documents, workspaceFolders);
}
/**
 * Clear workspace cache (unified function for providers)
 */
function clearWorkspaceCache() {
    workspaceComponentService_1.workspaceComponentService.clearCache();
}
// Utility functions that combine parser and component functionality
/**
 * Parse a document and return all components found
 */
function parseDocument(document) {
    return parser_1.alloyParser.parseDocument(document);
}
/**
 * Utility function to find the end of a block (matching closing brace)
 */
function findBlockEndUtil(lines, startLine) {
    let braceCount = 0;
    let foundOpenBrace = false;
    for (let i = startLine; i < lines.length; i++) {
        const line = lines[i];
        const openBraces = (line.match(/\{/g) || []).length;
        const closeBraces = (line.match(/\}/g) || []).length;
        if (openBraces > 0) {
            foundOpenBrace = true;
        }
        braceCount += openBraces - closeBraces;
        if (foundOpenBrace && braceCount === 0) {
            return i;
        }
    }
    return lines.length - 1;
}
/**
 * Parse components inside declare blocks
 */
function parseComponentsInDeclareBlocks(document) {
    const content = document.getText();
    const lines = content.split('\n');
    const components = [];
    // First, find all declare blocks
    const configBlocks = parseConfigBlocks(document);
    const declareBlocks = configBlocks.filter(block => block.name === 'declare');
    for (const declareBlock of declareBlocks) {
        // Parse components within this declare block
        const declareStartLine = declareBlock.range.start.line;
        const declareEndLine = declareBlock.range.end.line;
        for (let i = declareStartLine + 1; i < declareEndLine; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            if (trimmed.startsWith('//') || trimmed === '') {
                continue;
            }
            // Skip argument declarations and other config constructs
            if (trimmed.startsWith('argument ') || trimmed.startsWith('export ')) {
                continue;
            }
            // Skip lines that contain '=' as they are argument assignments
            if (trimmed.includes('=')) {
                continue;
            }
            // Check for component declarations
            const componentDeclarationMatch = trimmed.match(/^([a-zA-Z_.][a-zA-Z0-9_.]*)\s*(?:"([^"]*)")?/);
            if (componentDeclarationMatch) {
                const componentName = componentDeclarationMatch[1];
                const componentLabel = componentDeclarationMatch[2];
                // Skip if this is a config block keyword
                const configKeywords = ['declare', 'argument', 'export', 'foreach', 'http', 'import.file',
                    'import.git', 'import.http', 'import.string', 'livedebugging', 'livelogging',
                    'logging', 'remotecfg', 'tracing'];
                if (configKeywords.includes(componentName)) {
                    continue;
                }
                // Look for opening brace
                let braceLineIndex = -1;
                let braceFound = false;
                // Check if brace is on same line
                if (trimmed.includes('{')) {
                    braceLineIndex = i;
                    braceFound = true;
                }
                else {
                    // Look for brace on next few lines
                    for (let j = i + 1; j < Math.min(i + 4, declareEndLine); j++) {
                        const nextLine = lines[j].trim();
                        if (nextLine.startsWith('//') || nextLine === '') {
                            continue;
                        }
                        if (nextLine.includes('{')) {
                            braceLineIndex = j;
                            braceFound = true;
                            break;
                        }
                        if (nextLine.match(/^[a-zA-Z_.][a-zA-Z0-9_.]*\s*(?:"[^"]*")?/)) {
                            break;
                        }
                    }
                }
                if (braceFound) {
                    const componentStartLine = i;
                    const componentEndLine = findBlockEndUtil(lines, braceLineIndex);
                    // Make sure the component end is within the declare block
                    if (componentEndLine < declareEndLine) {
                        const componentRange = node_1.Range.create(node_1.Position.create(componentStartLine, 0), node_1.Position.create(componentEndLine, lines[componentEndLine]?.length || 0));
                        components.push({
                            name: componentName,
                            label: componentLabel || '',
                            range: componentRange,
                            startLine: componentStartLine,
                            endLine: componentEndLine,
                            args: {},
                            blocks: [],
                            scope: declareBlock.label || 'unknown'
                        });
                        // Skip to the end of this component
                        i = componentEndLine;
                    }
                }
            }
        }
    }
    return components;
}
/**
 * Parse all components in a document (both top-level and inside declare blocks)
 */
function parseAllComponents(document) {
    const topLevelComponents = parseDocument(document);
    const declareComponents = parseComponentsInDeclareBlocks(document);
    return [...topLevelComponents, ...declareComponents];
}
/**
 * Parse a document and return all config blocks found
 */
function parseConfigBlocks(document) {
    return parser_1.alloyParser.parseConfigBlocks(document);
}
/**
 * Find block position at cursor
 */
function findBlockAtPosition(content, position) {
    return parser_1.alloyParser.findBlockAtPosition(content, position);
}
/**
 * Transform component data to LSP structure format (shared logic for both JSON and declare blocks)
 */
function transformToLspStructure(data) {
    const structure = {
        arguments: {},
        blocks: {},
        required_blocks: []
    };
    // Transform arguments
    if (data.arguments && Array.isArray(data.arguments)) {
        for (const arg of data.arguments) {
            structure.arguments[arg.name] = {
                type: arg.type || 'string',
                description: arg.description || `Argument ${arg.name}`,
                required: arg.required || false,
                default: arg.default || ''
            };
        }
    }
    // Transform blocks
    if (data.blocks && Array.isArray(data.blocks)) {
        for (const block of data.blocks) {
            const blockName = block.name || block.block; // Handle both 'name' and 'block' properties
            if (blockName) {
                structure.blocks[blockName] = {
                    description: block.description || `Block ${blockName}`,
                    required: block.required || false,
                    arguments: block.arguments || [],
                    nested_blocks: block.nested_blocks || []
                };
                if (block.required) {
                    structure.required_blocks.push(blockName);
                }
            }
        }
    }
    return structure;
}
/**
 * Extract declare structure from a parsed config block
 * Note: This handles declare blocks specifically, which have different parsing requirements
 * than JSON component data (e.g., argument blocks vs argument arrays)
 */
function extractDeclareStructure(declareBlock) {
    const structure = {
        arguments: {},
        blocks: {},
        required_blocks: []
    };
    // Extract argument blocks
    if (declareBlock.blocks) {
        for (const block of declareBlock.blocks) {
            if (block.name === 'argument' && block.label) {
                // Parse the optional attribute from the argument block
                const optionalArg = block.args['optional'];
                const isOptional = optionalArg ? optionalArg.value.toLowerCase() === 'true' : false;
                structure.arguments[block.label] = {
                    type: 'string', // Default type for declared arguments
                    description: `Argument ${block.label}`,
                    required: !isOptional, // Required if not explicitly marked as optional
                    default: ''
                };
            }
            // Extract other blocks (like export blocks, nested components)
            else if (block.name !== 'argument') {
                structure.blocks[block.name] = {
                    description: `Block ${block.name}`,
                    required: false,
                    children: {},
                    arguments: [],
                    nested_blocks: []
                };
            }
        }
    }
    return structure;
}
/**
 * Get declared components from a document
 */
function getDeclaredComponents(document) {
    const configBlocks = parseConfigBlocks(document);
    const declaredComponents = {};
    for (const configBlock of configBlocks) {
        if (configBlock.type === 'declare' && configBlock.label) {
            // The label is the component name in declare "component_name" { }
            declaredComponents[configBlock.label] = configBlock;
        }
    }
    return declaredComponents;
}
/**
 * Check if a component name is declared in the document
 */
function isDeclaredComponent(document, componentName) {
    const declaredComponents = getDeclaredComponents(document);
    return declaredComponents.hasOwnProperty(componentName);
}
/**
 * Get workspace folder from current document or opened documents
 */
function getWorkspaceFromDocuments(documents, currentDocument) {
    // If currentDocument provided, use its directory as workspace
    if (currentDocument && currentDocument.uri.startsWith('file://')) {
        const filePath = currentDocument.uri.substring(7);
        const path = require('path');
        const workspaceDir = path.dirname(filePath);
        return [workspaceDir];
    }
    // Otherwise, collect unique directories from all opened documents
    const workspaceDirs = new Set();
    const path = require('path');
    for (const doc of documents.all()) {
        if (doc.uri.startsWith('file://')) {
            const filePath = doc.uri.substring(7);
            const docDirectory = path.dirname(filePath);
            workspaceDirs.add(docDirectory);
        }
    }
    return Array.from(workspaceDirs);
}
/**
 * Check if a component name is declared across the workspace (cross-file)
 */
async function isDeclaredComponentWorkspace(documents, componentName, workspaceFolders = []) {
    // First check opened documents
    for (const document of documents.all()) {
        if (isDeclaredComponent(document, componentName)) {
            return true;
        }
    }
    // If not found in opened documents, check workspace files
    if (workspaceFolders.length > 0) {
        const { getPerformanceManager } = await Promise.resolve().then(() => __importStar(require('./performance')));
        const performanceManager = getPerformanceManager();
        try {
            // Get all alloy files in workspace
            const alloyFiles = await performanceManager.lazyLoadWorkspaceFiles(workspaceFolders, [] // No priority files
            );
            // Check each workspace file for declare blocks
            for (const filePath of alloyFiles) {
                const uri = `file://${filePath}`;
                // Skip files that are already opened (already checked above)
                if (documents.get(uri)) {
                    continue;
                }
                try {
                    const { content } = await performanceManager.getCachedFileContent(filePath);
                    const document = vscode_languageserver_textdocument_1.TextDocument.create(uri, 'alloy', 1, content);
                    if (isDeclaredComponent(document, componentName)) {
                        return true;
                    }
                }
                catch (error) {
                    // Continue on error reading individual files
                    // Silently handle file reading errors
                }
            }
        }
        catch (error) {
            // Silently handle workspace file errors
        }
    }
    else {
        // When no workspace folders provided, automatically detect from opened documents
        const autoWorkspaceFolders = getWorkspaceFromDocuments(documents);
        if (autoWorkspaceFolders.length > 0) {
            // Recursively call with detected workspace folders
            return await isDeclaredComponentWorkspace(documents, componentName, autoWorkspaceFolders);
        }
    }
    return false;
}
/**
 * Check if an argument name is declared in the document
 */
function isDeclaredArgument(document, argumentName) {
    const configBlocks = parseConfigBlocks(document);
    for (const configBlock of configBlocks) {
        if (configBlock.type === 'declare' && configBlock.blocks) {
            for (const block of configBlock.blocks) {
                if (block.name === 'argument' && block.label === argumentName) {
                    return true;
                }
            }
        }
    }
    return false;
}
/**
 * Check if a word is a declared export in the document
 */
function isDeclaredExport(document, exportName) {
    const configBlocks = parseConfigBlocks(document);
    for (const configBlock of configBlocks) {
        if (configBlock.type === 'declare' && configBlock.blocks) {
            for (const block of configBlock.blocks) {
                if (block.name === 'export' && block.label === exportName) {
                    return true;
                }
            }
        }
    }
    return false;
}
/**
 * Get all available component types including declared ones from workspace
 */
async function getAllAvailableComponents(document, documents, workspaceFolders) {
    const builtinComponents = exports.componentParser.getAllComponentData();
    const allComponents = { ...builtinComponents };
    // If we have workspace folders, do full workspace scanning
    if (workspaceFolders && workspaceFolders.length > 0 && documents) {
        try {
            const workspaceComponents = await getAllWorkspaceComponents(documents, workspaceFolders);
            // Merge workspace components with builtins
            Object.assign(allComponents, workspaceComponents);
            return allComponents;
        }
        catch (error) {
            // Silently handle workspace component errors
        }
    }
    // Fallback: Get workspace documents if available (opened documents only)
    const workspaceDocuments = documents ? documents.all() : (document ? [document] : []);
    for (const doc of workspaceDocuments) {
        const declaredComponents = getDeclaredComponents(doc);
        for (const [name, configBlock] of Object.entries(declaredComponents)) {
            // Extract structure from the declare block
            const declareStructure = extractDeclareStructure(configBlock);
            // Create a pseudo component data for declared components
            allComponents[name] = {
                name,
                usage: `Declared component "${name}"`,
                template: `${name} "\${1:label}" {\n  $0\n}`,
                arguments: [],
                blocks: [],
                lsp_structure: {
                    component: name,
                    arguments: declareStructure.arguments,
                    blocks: declareStructure.blocks,
                    required_blocks: declareStructure.required_blocks,
                    conditional_blocks: {}
                },
                isDeclared: true,
                declareBlock: configBlock,
                sourceUri: doc.uri // Track which file this component comes from
            };
        }
    }
    return allComponents;
}
/**
 * Get component context at a specific position
 */
function getComponentContext(content, position, document) {
    const componentName = exports.componentParser.findComponentAtPosition(content, position);
    if (!componentName) {
        return null;
    }
    const allComponentData = exports.componentParser.getAllComponentData();
    const componentData = allComponentData[componentName];
    let parsedComponent;
    if (document) {
        const parsedComponents = parseDocument(document);
        parsedComponent = parsedComponents.find(comp => comp.name === componentName);
    }
    return {
        componentName,
        componentData,
        parsedComponent
    };
}
/**
 * Get block context at a specific position
 */
function getBlockContext(content, position, componentName) {
    const blockPosition = findBlockAtPosition(content, position);
    const blockPath = blockPosition ? blockPosition.blockPath : [];
    let targetBlock;
    if (componentName && blockPath.length > 0) {
        // This would require more complex logic to find the specific block
        // For now, we'll leave this as undefined and let individual providers handle it
    }
    return {
        blockPath,
        blockPosition,
        targetBlock
    };
}
/**
 * Find a parsed component by name in a list of parsed components
 */
function findParsedComponent(parsedComponents, componentName) {
    return parsedComponents.find(comp => comp.name === componentName) || null;
}
/**
 * Find the specific parsed component instance at a given position
 * This is needed when there are multiple components of the same type
 */
function findParsedComponentAtPosition(parsedComponents, position) {
    // Find all components that match the position (cursor is within their range)
    const matchingComponents = parsedComponents.filter(comp => position.line >= comp.startLine && position.line <= comp.endLine);
    // If multiple components match (nested components), return the most specific one
    // (the one with the smallest range that contains the position)
    if (matchingComponents.length > 0) {
        return matchingComponents.reduce((mostSpecific, current) => {
            const mostSpecificRange = mostSpecific.endLine - mostSpecific.startLine;
            const currentRange = current.endLine - current.startLine;
            return currentRange < mostSpecificRange ? current : mostSpecific;
        });
    }
    return null;
}
/**
 * Find a block by path within parsed blocks
 */
function findBlockByPath(blocks, targetPath) {
    return parser_1.alloyParser.findBlockByPath(blocks, targetPath);
}
/**
 * Common validation helper - check if component data is valid
 */
function hasValidComponentData(componentData) {
    return !!(componentData && componentData.lsp_structure);
}
/**
 * Get current word being typed at cursor position
 */
function getCurrentWord(textBeforeCursor) {
    return parser_1.alloyParser.getCurrentWord(textBeforeCursor);
}
/**
 * Check if we're inside a component block
 */
function isInsideComponentBlock(content, position, componentName) {
    return parser_1.alloyParser.isInsideComponentBlock(content, position, componentName);
}
/**
 * Get standardized component and block context for any position
 * This is the main function that other providers should use
 */
function getFullContext(document, position) {
    const content = document.getText();
    const allComponentData = exports.componentParser.getAllComponentData();
    if (Object.keys(allComponentData).length === 0) {
        return null;
    }
    const componentContext = getComponentContext(content, position, document);
    if (!componentContext) {
        return null;
    }
    const blockContext = getBlockContext(content, position, componentContext.componentName);
    return {
        content,
        allComponentData,
        component: componentContext,
        block: blockContext,
        parsedComponents: parseDocument(document)
    };
}
// Convenience exports for direct access to componentParser methods
const getAllComponentData = () => exports.componentParser.getAllComponentData();
exports.getAllComponentData = getAllComponentData;
const findComponentAtPosition = (content, position, documents) => {
    // Get both built-in and workspace components
    let allComponentData = exports.componentParser.getAllComponentData();
    // If documents are available, include workspace components
    if (documents) {
        const workspaceComponents = getCachedWorkspaceComponents(documents);
        allComponentData = { ...allComponentData, ...workspaceComponents };
    }
    const knownComponents = Object.keys(allComponentData);
    return parser_1.alloyParser.findComponentAtPosition(content, position, knownComponents);
};
exports.findComponentAtPosition = findComponentAtPosition;
const getComponentData = (componentName) => exports.componentParser.getComponentData(componentName);
exports.getComponentData = getComponentData;
const getBlockStructure = (componentName) => exports.componentParser.getBlockStructure(componentName);
exports.getBlockStructure = getBlockStructure;
const getAvailableBlocksAtPath = (blockPath, componentName) => exports.componentParser.getAvailableBlocksAtPath(blockPath, componentName);
exports.getAvailableBlocksAtPath = getAvailableBlocksAtPath;
const getBlockDescription = (blockPath, componentName) => exports.componentParser.getBlockDescription(blockPath, componentName);
exports.getBlockDescription = getBlockDescription;
const getRequiredBlocks = (componentName) => exports.componentParser.getRequiredBlocks(componentName);
exports.getRequiredBlocks = getRequiredBlocks;
const getComponentArguments = (componentName) => exports.componentParser.getComponentArguments(componentName);
exports.getComponentArguments = getComponentArguments;
const getBlockArguments = (blockPath, componentName) => exports.componentParser.getBlockArguments(blockPath, componentName);
exports.getBlockArguments = getBlockArguments;
const isKnownComponent = (componentName) => exports.componentParser.isKnownComponent(componentName);
exports.isKnownComponent = isKnownComponent;
// ================================================================================================
// UNIFIED PROVIDER FUNCTIONS
// ================================================================================================
/**
 * Unified getComponent function - use this in all providers instead of individual implementations
 */
async function getComponent(document, position, documents, workspaceFolders) {
    const allComponentData = await getAllAvailableComponents(document, documents, workspaceFolders);
    return getComponentAtPosition(document, position, allComponentData);
}
/**
 * Unified getReferences function - use this in all providers instead of individual implementations
 */
/**
 * Find the scope (declare block name) for a given position in the document
 */
function findScopeAtPosition(document, position) {
    const configBlocks = parseConfigBlocks(document);
    for (const block of configBlocks) {
        if (block.type === 'declare' && block.label) {
            // Check if position is within this declare block
            if (position.line >= block.range.start.line && position.line <= block.range.end.line) {
                return block.label;
            }
        }
    }
    return 'root'; // Default to root scope
}
async function getReferences(documents, componentName, label, workspaceFolders = [], connection, targetScope) {
    return await getComponentReferences(documents, componentName, label, workspaceFolders, targetScope);
}
/**
 * Get all component declarations from a document (both regular and declared components)
 */
function getAllComponentDeclarations(document) {
    const declarations = [];
    const lines = document.getText().split('\n');
    // Get root-level components
    const components = parser_1.alloyParser.parseDocument(document);
    for (const component of components) {
        if (component.label) {
            // Find the exact positions in the source line
            const line = lines[component.startLine];
            const componentType = component.name;
            const label = component.label;
            // Find positions in the original line
            const typeStart = line.indexOf(componentType);
            const typeEnd = typeStart + componentType.length;
            const labelQuotePattern = `"${label}"`;
            const labelQuoteStart = line.indexOf(labelQuotePattern);
            const labelStart = labelQuoteStart + 1; // +1 to skip opening quote
            const labelEnd = labelStart + label.length;
            declarations.push({
                componentType,
                label,
                line: component.startLine,
                scope: component.scope || 'root',
                range: {
                    type: { start: typeStart, end: typeEnd },
                    label: { start: labelStart, end: labelEnd }
                }
            });
        }
    }
    // Get components from inside declare blocks
    const configBlocks = parser_1.alloyParser.parseConfigBlocks(document);
    for (const configBlock of configBlocks) {
        if (configBlock.type === 'declare' && configBlock.components) {
            for (const component of configBlock.components) {
                if (component.label) {
                    // Find the exact positions in the source line
                    const line = lines[component.startLine];
                    const componentType = component.name;
                    const label = component.label;
                    // Find positions in the original line
                    const typeStart = line.indexOf(componentType);
                    const typeEnd = typeStart + componentType.length;
                    const labelQuotePattern = `"${label}"`;
                    const labelQuoteStart = line.indexOf(labelQuotePattern);
                    const labelStart = labelQuoteStart + 1; // +1 to skip opening quote
                    const labelEnd = labelStart + label.length;
                    declarations.push({
                        componentType,
                        label,
                        line: component.startLine,
                        scope: component.scope || configBlock.label || 'unknown',
                        range: {
                            type: { start: typeStart, end: typeEnd },
                            label: { start: labelStart, end: labelEnd }
                        }
                    });
                }
            }
        }
    }
    return declarations;
}
/**
 * Get all component declarations from all documents in the workspace
 */
function getAllComponentDeclarationsWorkspace(documents) {
    const allDeclarations = [];
    for (const document of documents.all()) {
        const documentDeclarations = getAllComponentDeclarations(document);
        allDeclarations.push(...documentDeclarations);
    }
    return allDeclarations;
}
/**
 * Find the word at a given position in the document (centralized version)
 */
function getWordAtPosition(document, position) {
    const line = document.getText({
        start: { line: position.line, character: 0 },
        end: { line: position.line + 1, character: 0 }
    }).replace(/\n$/, '');
    const character = position.character;
    if (character >= line.length)
        return null;
    const trimmed = line.trim();
    // Check for declare blocks: declare "component_name"
    if (trimmed.includes('declare')) {
        const declareMatch = trimmed.match(/declare\s+"([^"]+)"/);
        if (declareMatch) {
            const componentName = declareMatch[1];
            const declareKeywordIndex = line.indexOf('declare');
            const declareKeywordEnd = declareKeywordIndex + 7; // length of "declare"
            if (character >= declareKeywordIndex && character < declareKeywordEnd) {
                return 'declare';
            }
            return componentName;
        }
    }
    // Check for argument declarations: argument "argument_name"
    if (trimmed.includes('argument')) {
        const argumentMatch = trimmed.match(/argument\s+"([^"]+)"/);
        if (argumentMatch) {
            const argumentName = argumentMatch[1];
            const argumentKeywordIndex = line.indexOf('argument');
            const argumentKeywordEnd = argumentKeywordIndex + 8; // length of "argument"
            if (character >= argumentKeywordIndex && character < argumentKeywordEnd) {
                return 'argument';
            }
            return argumentName;
        }
    }
    // Check for export declarations: export "export_name"
    if (trimmed.includes('export')) {
        const exportMatch = trimmed.match(/export\s+"([^"]+)"/);
        if (exportMatch) {
            const exportName = exportMatch[1];
            const exportKeywordIndex = line.indexOf('export');
            const exportKeywordEnd = exportKeywordIndex + 6; // length of "export"
            if (character >= exportKeywordIndex && character < exportKeywordEnd) {
                return 'export';
            }
            return exportName;
        }
    }
    // Check for argument assignments: argument_name = value
    const assignmentMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=/);
    if (assignmentMatch) {
        const argumentName = assignmentMatch[1];
        const argumentStart = line.indexOf(argumentName);
        const argumentEnd = argumentStart + argumentName.length;
        if (character >= argumentStart && character < argumentEnd) {
            return argumentName;
        }
    }
    // Check for component declarations: component_type "component_name" {
    if (trimmed.match(/^[a-zA-Z_.]/) && !trimmed.includes('=')) {
        const componentMatch = trimmed.match(/^([a-zA-Z_.][a-zA-Z0-9_.]*)\s+"([^"]+)"\s*\{/);
        if (componentMatch) {
            const componentType = componentMatch[1];
            const componentLabel = componentMatch[2];
            // Check if this is a declared component type (custom component defined with declare)
            if (isDeclaredComponent(document, componentType)) {
                // For declared component instances like dec "_local_2", return the component type for renaming
                return componentType;
            }
            else {
                // For regular components like prometheus.scrape "metrics", return the component type for hover/completion
                // The position check will determine if we're on the type or label
                const componentTypeStart = line.indexOf(componentType);
                const componentTypeEnd = componentTypeStart + componentType.length;
                const labelStart = line.indexOf(`"${componentLabel}"`);
                const labelEnd = labelStart + componentLabel.length + 2; // +2 for quotes
                if (character >= componentTypeStart && character < componentTypeEnd) {
                    return componentType;
                }
                else if (character >= labelStart && character < labelEnd) {
                    return componentLabel;
                }
            }
        }
        return null;
    }
    // Check for component references in expressions like: otelcol.processor.transform.defaulttest.input
    return getWordAtPositionInReference(document, position);
}
/**
 * Find the word at position in component references (dotted paths)
 */
function getWordAtPositionInReference(document, position) {
    const line = document.getText({
        start: { line: position.line, character: 0 },
        end: { line: position.line + 1, character: 0 }
    }).replace(/\n$/, '');
    const character = position.character;
    // Find word boundaries for component references (including dots and underscores)
    let start = character;
    let end = character;
    // Move start backwards to find the beginning of the word/reference
    while (start > 0 && /[a-zA-Z0-9_.]/.test(line[start - 1])) {
        start--;
    }
    // Move end forwards to find the end of the word/reference
    while (end < line.length && /[a-zA-Z0-9_.]/.test(line[end])) {
        end++;
    }
    if (start === end)
        return null;
    const word = line.substring(start, end);
    // Check if this is a component reference like: component_type.label.property
    if (word.includes('.')) {
        // For component references, different providers need different information:
        // - Definition provider needs the full reference to parse
        // - Rename provider needs the parsed label/type
        // So return the full reference and let each provider decide how to handle it
        return word;
    }
    // If the word contains quotes, extract just the component name
    if (word.includes('"')) {
        const match = word.match(/^([a-zA-Z_][a-zA-Z0-9_]*)/);
        if (match) {
            return match[1];
        }
    }
    return word;
}
/**
 * Find the range of a word at a given position (centralized version)
 */
function findWordRange(document, position, word) {
    const line = document.getText({
        start: { line: position.line, character: 0 },
        end: { line: position.line + 1, character: 0 }
    }).replace(/\n$/, '');
    // For argument assignments like "queries_path = value", find the argument name
    const trimmed = line.trim();
    const assignmentMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=/);
    if (assignmentMatch && assignmentMatch[1] === word) {
        const startChar = line.indexOf(word);
        const endChar = startChar + word.length;
        return {
            start: { line: position.line, character: startChar },
            end: { line: position.line, character: endChar }
        };
    }
    // For quoted strings like declare "name", argument "name", export "name"
    // Select just the name inside the quotes, not including the quotes
    const quotedPattern = `"${word}"`;
    const quotedIndex = line.indexOf(quotedPattern);
    if (quotedIndex !== -1) {
        return {
            start: { line: position.line, character: quotedIndex + 1 }, // +1 to skip opening quote
            end: { line: position.line, character: quotedIndex + 1 + word.length }
        };
    }
    // Default word boundary search - find the actual word occurrence in the current line
    const wordIndex = line.indexOf(word);
    if (wordIndex !== -1) {
        return {
            start: { line: position.line, character: wordIndex },
            end: { line: position.line, character: wordIndex + word.length }
        };
    }
    // Fallback: use cursor position to find word boundaries
    let start = position.character;
    let end = position.character;
    // Move start backwards to find the beginning of the word
    while (start > 0 && /[a-zA-Z0-9_.]/.test(line[start - 1])) {
        start--;
    }
    // Move end forwards to find the end of the word
    while (end < line.length && /[a-zA-Z0-9_.]/.test(line[end])) {
        end++;
    }
    return {
        start: { line: position.line, character: start },
        end: { line: position.line, character: end }
    };
}
/**
  * Try to find a full component reference when only a label is found
  * This is useful when the cursor is on a component label like "default" and we need to find the full reference
  */
function findComponentReferenceFromLabel(document, position, wordAtPosition) {
    // Extract the full component reference from the current line
    const line = document.getText({
        start: { line: position.line, character: 0 },
        end: { line: position.line + 1, character: 0 }
    }).replace(/\n$/, '');
    // Look for component references containing the word
    const pattern = new RegExp(exports.COMPONENT_REFERENCE_PATTERN);
    let match;
    while ((match = pattern.exec(line)) !== null) {
        const potentialRef = match[1];
        if (potentialRef.includes(wordAtPosition) && potentialRef.includes('.')) {
            // Parse the component reference
            const parts = potentialRef.split('.');
            if (parts.length < 2)
                continue;
            // Find the longest matching component name
            const allComponents = getAllAvailableComponents(document);
            const componentNames = Object.keys(allComponents).sort((a, b) => b.length - a.length);
            for (const componentName of componentNames) {
                if (potentialRef.startsWith(componentName)) {
                    const remaining = potentialRef.substring(componentName.length + 1); // +1 for the dot
                    if (!remaining) {
                        return { component: componentName };
                    }
                    const remainingParts = remaining.split('.');
                    if (remainingParts.length >= 1) {
                        const label = remainingParts[0];
                        const property = remainingParts.length > 1 ? remainingParts.slice(1).join('.') : undefined;
                        return { component: componentName, label, property };
                    }
                }
            }
        }
    }
    return null;
}
/**
  * Check if a position is renameable and get rename info (centralized version)
  */
function getRenameableInfo(document, position, documents) {
    try {
        const wordAtPosition = getWordAtPosition(document, position);
        if (!wordAtPosition)
            return null;
        const content = document.getText();
        const lines = content.split('\n');
        if (position.line < 0 || position.line >= lines.length)
            return null;
        const currentLine = lines[position.line];
        if (!currentLine || position.character < 0 || position.character >= currentLine.length)
            return null;
        // Check for declare, argument, export keywords first
        if (wordAtPosition === 'declare') {
            const declareMatch = currentLine.match(/declare\s+"([^"]+)"/);
            if (declareMatch) {
                const declareName = declareMatch[1];
                return {
                    type: 'declare-name',
                    name: declareName,
                    range: findWordRange(document, position, declareName)
                };
            }
        }
        if (wordAtPosition === 'argument') {
            const argumentMatch = currentLine.match(/argument\s+"([^"]+)"/);
            if (argumentMatch) {
                const argumentName = argumentMatch[1];
                return {
                    type: 'argument-name',
                    name: argumentName,
                    range: findWordRange(document, position, argumentName)
                };
            }
        }
        if (wordAtPosition === 'export') {
            const exportMatch = currentLine.match(/export\s+"([^"]+)"/);
            if (exportMatch) {
                const exportName = exportMatch[1];
                return {
                    type: 'export-name',
                    name: exportName,
                    range: findWordRange(document, position, exportName)
                };
            }
        }
        // Check if this is a declared component (for usage contexts)
        if (isDeclaredComponent(document, wordAtPosition)) {
            return {
                type: 'declare-name',
                name: wordAtPosition,
                range: findWordRange(document, position, wordAtPosition)
            };
        }
        // Check if this is a declared argument (for usage contexts)
        if (isDeclaredArgument(document, wordAtPosition)) {
            return {
                type: 'argument-name',
                name: wordAtPosition,
                range: findWordRange(document, position, wordAtPosition)
            };
        }
        // Check if this is a declared export (for usage contexts)
        if (isDeclaredExport(document, wordAtPosition)) {
            return {
                type: 'export-name',
                name: wordAtPosition,
                range: findWordRange(document, position, wordAtPosition)
            };
        }
        // Handle component declarations and references
        return getComponentRenameableInfo(document, position, wordAtPosition, currentLine, documents);
    }
    catch (error) {
        return null;
    }
}
// ================================================================================================
// UNIFIED MANAGER CLASSES - ELIMINATE DRY VIOLATIONS
// ================================================================================================
/**
 * Unified configuration data manager
 * Eliminates duplication of config loading logic across providers
 */
class ConfigDataManager {
    /**
     * Get config blocks data with caching and unified path resolution
     */
    static getConfigBlockData() {
        if (this.configBlockDataCache) {
            return this.configBlockDataCache;
        }
        try {
            const possiblePaths = [
                path.join(__dirname, 'config_blocks', 'config_blocks_data.json'),
                path.join(__dirname, '..', 'src', 'config_blocks', 'config_blocks_data.json'),
                path.join(process.cwd(), 'server', 'src', 'config_blocks', 'config_blocks_data.json'),
                path.join(process.cwd(), 'src', 'config_blocks', 'config_blocks_data.json')
            ];
            for (const configBlocksPath of possiblePaths) {
                try {
                    if (fs.existsSync(configBlocksPath)) {
                        const data = fs.readFileSync(configBlocksPath, 'utf8');
                        this.configBlockDataCache = JSON.parse(data);
                        return this.configBlockDataCache;
                    }
                }
                catch (e) {
                    // Continue to next path
                }
            }
            // Config blocks data not found
            this.configBlockDataCache = {};
            return this.configBlockDataCache;
        }
        catch (error) {
            // Failed to load config blocks data
            this.configBlockDataCache = {};
            return this.configBlockDataCache;
        }
    }
    /**
     * Clear cached data (useful for testing or when files change)
     */
    static clearCache() {
        this.configBlockDataCache = null;
    }
}
exports.ConfigDataManager = ConfigDataManager;
ConfigDataManager.configBlockDataCache = null;
/**
 * Unified document context manager
 * Eliminates repetitive document/position handling logic
 */
class DocumentContextManager {
    /**
     * Get basic document context with validation
     */
    static getBasicContext(params, documents) {
        const document = documents.get(params.textDocument.uri);
        if (!document) {
            return null;
        }
        const position = params.position;
        const content = document.getText();
        const lines = content.split('\n');
        if (position.line >= lines.length) {
            return null;
        }
        const currentLine = lines[position.line];
        return {
            document,
            position,
            content,
            currentLine
        };
    }
    /**
     * Get enhanced context with word and component information
     */
    static getComponentContext(params, documents) {
        const basicContext = this.getBasicContext(params, documents);
        if (!basicContext) {
            return null;
        }
        const wordAtPosition = getWordAtPosition(basicContext.document, basicContext.position);
        let componentName;
        let componentLabel;
        if (wordAtPosition && wordAtPosition.includes('.')) {
            const parts = wordAtPosition.split('.');
            if (parts.length >= 2) {
                componentName = parts[0];
                componentLabel = parts[1];
            }
        }
        return {
            ...basicContext,
            wordAtPosition,
            componentName,
            componentLabel
        };
    }
}
exports.DocumentContextManager = DocumentContextManager;
/**
 * Unified range utilities
 * Eliminates repetitive range calculation and validation logic
 */
class RangeUtils {
    /**
     * Create a word range with validation
     */
    static createWordRange(document, line, word) {
        const content = document.getText();
        const lines = content.split('\n');
        if (line >= lines.length || line < 0) {
            return null;
        }
        const lineText = lines[line];
        const startChar = lineText.indexOf(word);
        if (startChar === -1) {
            return null;
        }
        const endChar = startChar + word.length;
        return node_1.Range.create(node_1.Position.create(line, startChar), node_1.Position.create(line, endChar));
    }
    /**
     * Find word position in line text
     */
    static findWordPositionInLine(line, word) {
        const startIndex = line.indexOf(word);
        if (startIndex === -1) {
            return null;
        }
        return {
            start: startIndex,
            end: startIndex + word.length
        };
    }
    /**
     * Create range with validation
     */
    static createValidatedRange(startLine, startChar, endLine, endChar) {
        if (startLine < 0 || startChar < 0 || endLine < 0 || endChar < 0) {
            return null;
        }
        if (startLine > endLine || (startLine === endLine && startChar > endChar)) {
            return null;
        }
        return node_1.Range.create(node_1.Position.create(startLine, startChar), node_1.Position.create(endLine, endChar));
    }
}
exports.RangeUtils = RangeUtils;
/**
 * Unified scope manager
 * Eliminates repetitive scope determination logic
 */
class ScopeManager {
    /**
     * Build scope map for a document (line number -> scope name)
     */
    static buildScopeMap(document) {
        const scopeMap = new Map();
        const configBlocks = parseConfigBlocks(document);
        for (const block of configBlocks) {
            if (block.type === 'declare' && block.label) {
                for (let line = block.range.start.line; line <= block.range.end.line; line++) {
                    scopeMap.set(line, block.label);
                }
            }
        }
        return scopeMap;
    }
    /**
     * Get scope at position with caching
     */
    static getScopeAtPosition(document, position) {
        const scopeMap = this.buildScopeMap(document);
        return scopeMap.get(position.line) || 'root';
    }
    /**
     * Check if two positions are in the same scope
     */
    static isInSameScope(pos1, pos2, document) {
        const scope1 = this.getScopeAtPosition(document, pos1);
        const scope2 = this.getScopeAtPosition(document, pos2);
        return scope1 === scope2;
    }
}
exports.ScopeManager = ScopeManager;
/**
 * Unified function to get all references to a component
 * This replaces individual provider implementations
 */
async function getComponentReferences(documents, componentName, label, workspaceFolders = [], targetScope) {
    const references = [];
    const allComponentData = await workspaceComponentService_1.workspaceComponentService.getAllWorkspaceComponents(documents, workspaceFolders);
    // Get all workspace documents (opened + workspace files)
    const allDocuments = await workspaceComponentService_1.workspaceComponentService.getAllWorkspaceDocuments(documents, workspaceFolders);
    for (const document of allDocuments) {
        // Find component references (usages)
        const componentRefs = findAllComponentReferences(document, allComponentData);
        for (const ref of componentRefs) {
            if (ref.component === componentName && (!label || ref.label === label)) {
                // Apply scope filtering if targetScope is provided
                if (targetScope !== undefined) {
                    const refScope = ref.scope || 'root';
                    if (refScope !== targetScope) {
                        continue; // Skip references not in the target scope
                    }
                }
                references.push(node_1.Location.create(document.uri, node_1.Range.create(node_1.Position.create(ref.range.start.line, ref.range.start.character), node_1.Position.create(ref.range.end.line, ref.range.end.character))));
            }
        }
        // Find component declarations
        const componentDecls = getAllComponentDeclarations(document);
        for (const decl of componentDecls) {
            if (decl.componentType === componentName && (!label || decl.label === label)) {
                // Apply scope filtering if targetScope is provided
                if (targetScope !== undefined) {
                    const declScope = decl.scope || 'root';
                    if (declScope !== targetScope) {
                        continue; // Skip declarations not in the target scope
                    }
                }
                references.push(node_1.Location.create(document.uri, node_1.Range.create(node_1.Position.create(decl.line, decl.range.label.start), node_1.Position.create(decl.line, decl.range.label.end))));
            }
        }
    }
    return references;
}
/**
 * Create a comprehensive map of all component labels with scope information
 * This is the unified component discovery function used across all providers
 */
function createComponentLabelMap(document) {
    const declaredComponents = getDeclaredComponents(document);
    const componentDeclarations = getAllComponentDeclarations(document);
    const componentLabelMap = {};
    // Track component scopes - components inside declare blocks have different scope
    const declareBlocks = parseConfigBlocks(document);
    const scopeMap = {}; // line -> scope name
    // Map declare block line ranges to their scope names
    for (const block of declareBlocks) {
        if (block.type === 'declare' && block.label) {
            for (let line = block.range.start.line; line <= block.range.end.line; line++) {
                scopeMap[line] = block.label;
            }
        }
    }
    // Add component declarations with scope information
    for (const decl of componentDeclarations) {
        if (decl.label) {
            const key = `${decl.componentType}:${decl.label}`;
            const scope = scopeMap[decl.line] || 'root'; // default to root scope
            componentLabelMap[key] = {
                componentType: decl.componentType,
                label: decl.label,
                range: {
                    start: { line: decl.line, character: decl.range.label.start },
                    end: { line: decl.line, character: decl.range.label.end }
                },
                scope: scope,
                line: decl.line,
                uri: document.uri
            };
        }
    }
    // Also include declared components (these define new component types)
    for (const [name, configBlock] of Object.entries(declaredComponents)) {
        if (configBlock.label) {
            const key = `${name}:${configBlock.label}`;
            componentLabelMap[key] = {
                componentType: name,
                label: configBlock.label,
                range: configBlock.range,
                scope: 'root', // declare blocks themselves are in root scope
                uri: document.uri
            };
        }
    }
    return componentLabelMap;
}
/**
 * Find all component references in a document
 * This is the unified reference finding function used across all providers
 */
function findAllComponentReferences(document, allComponentData) {
    const matches = parseComponentReferencesInDocument(document, allComponentData);
    const references = [];
    // Build a map of line numbers to their scope (declare block)
    const configBlocks = parser_1.alloyParser.parseConfigBlocks(document);
    const scopeMap = {}; // line -> scope name
    // Map declare block line ranges to their scope names
    for (const block of configBlocks) {
        if (block.type === 'declare' && block.label) {
            for (let line = block.range.start.line; line <= block.range.end.line; line++) {
                scopeMap[line] = block.label;
            }
        }
    }
    for (const match of matches) {
        if (match.isValidReference) {
            // Determine the scope of this reference
            const referenceScope = scopeMap[match.lineIndex] || 'root';
            references.push({
                component: match.componentType,
                label: match.componentLabel,
                property: match.property,
                fullReference: match.matchedText,
                scope: referenceScope,
                range: {
                    start: { line: match.lineIndex, character: match.matchIndex },
                    end: { line: match.lineIndex, character: match.matchIndex + match.matchedText.length }
                }
            });
        }
    }
    return references;
}
/**
 * Find all component references across the entire workspace
 * This is the workspace-aware version of findAllComponentReferences
 */
function findAllComponentReferencesInWorkspace(documents, allComponentData) {
    const allReferences = [];
    for (const document of documents.all()) {
        const documentReferences = findAllComponentReferences(document, allComponentData);
        allReferences.push(...documentReferences);
    }
    return allReferences;
}
/**
 * Unified function to get component information at a position
 * This replaces individual provider implementations
 */
function getComponentAtPosition(document, position, allComponentData) {
    const references = findAllComponentReferences(document, allComponentData);
    // Find the reference that contains the cursor position
    for (const ref of references) {
        if (position.line === ref.range.start.line &&
            position.character >= ref.range.start.character &&
            position.character <= ref.range.end.character) {
            return ref;
        }
    }
    return null;
}
/**
  * Get renameable info for components (helper for getRenameableInfo)
  */
function getComponentRenameableInfo(document, position, wordAtPosition, currentLine, documents) {
    // Check for regular component declarations: component_type "label" {
    if (!currentLine.includes('argument') && !currentLine.includes('export') && !currentLine.includes('declare')) {
        const componentLabelMatch = currentLine.match(/^(\s*)([a-zA-Z_.][a-zA-Z0-9_.]*)\s+"([^"]+)"\s*\{/);
        if (componentLabelMatch) {
            const componentType = componentLabelMatch[2];
            const label = componentLabelMatch[3];
            // Skip declared component instances - they should be handled as declare-name type
            if (isDeclaredComponent(document, componentType)) {
                return null;
            }
            // If wordAtPosition matches the label, return rename info for the label
            if (wordAtPosition === label) {
                const quotePattern = `"${label}"`;
                const quoteIndex = currentLine.indexOf(quotePattern);
                if (quoteIndex !== -1) {
                    return {
                        type: 'component-label',
                        name: label,
                        componentType: componentType,
                        range: {
                            start: { line: position.line, character: quoteIndex + 1 }, // +1 to skip opening quote
                            end: { line: position.line, character: quoteIndex + label.length + 1 } // +1 for opening quote
                        }
                    };
                }
            }
        }
    }
    // Check for component references in expressions like: otelcol.processor.transform.defaulttest.input
    if (wordAtPosition && currentLine.includes('.')) {
        // First, try to find if this word is part of a component reference
        const componentRef = findComponentReferenceFromLabel(document, position, wordAtPosition);
        if (componentRef && componentRef.label) {
            // Find the component declaration for this label (workspace-aware)
            const componentDeclarations = documents ?
                getAllComponentDeclarationsWorkspace(documents) :
                getAllComponentDeclarations(document);
            const decl = componentDeclarations.find(d => d.componentType === componentRef.component && d.label === componentRef.label);
            if (decl) {
                // Find the position of the label in the current reference
                const referencePattern = decl.componentType + '.' + decl.label;
                let refIndex = currentLine.indexOf(referencePattern);
                if (refIndex === -1) {
                    // Try to find the label in a more complex reference
                    const componentTypeIndex = currentLine.indexOf(decl.componentType);
                    if (componentTypeIndex !== -1) {
                        const afterComponentType = currentLine.substring(componentTypeIndex + decl.componentType.length);
                        const labelPattern = new RegExp(`\\.${decl.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\.|$|\\s)`);
                        const labelMatch = afterComponentType.match(labelPattern);
                        if (labelMatch) {
                            refIndex = componentTypeIndex;
                        }
                    }
                }
                if (refIndex !== -1) {
                    const labelStartInRef = refIndex + decl.componentType.length + 1; // +1 for the dot
                    const labelEndInRef = labelStartInRef + decl.label.length;
                    return {
                        type: 'component-label',
                        name: decl.label,
                        componentType: decl.componentType,
                        range: {
                            start: { line: position.line, character: labelStartInRef },
                            end: { line: position.line, character: labelEndInRef }
                        }
                    };
                }
            }
        }
        // Fallback: Check if wordAtPosition matches any component label (workspace-aware)
        const componentDeclarations = documents ?
            getAllComponentDeclarationsWorkspace(documents) :
            getAllComponentDeclarations(document);
        componentDeclarations.sort((a, b) => b.componentType.length - a.componentType.length);
        for (const decl of componentDeclarations) {
            if (wordAtPosition === decl.label) {
                // Find the component reference in current line
                const referencePattern = decl.componentType + '.' + decl.label;
                let refIndex = currentLine.indexOf(referencePattern);
                // If exact pattern not found, try to find the label after the component type
                if (refIndex === -1) {
                    const componentTypeIndex = currentLine.indexOf(decl.componentType);
                    if (componentTypeIndex !== -1) {
                        const afterComponentType = currentLine.substring(componentTypeIndex + decl.componentType.length);
                        const labelPattern = new RegExp(`\\.${decl.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\.|$|\\s)`);
                        const labelMatch = afterComponentType.match(labelPattern);
                        if (labelMatch) {
                            const labelStartInRef = componentTypeIndex + decl.componentType.length + 1; // +1 for the dot
                            const labelEndInRef = labelStartInRef + decl.label.length;
                            return {
                                type: 'component-label',
                                name: decl.label,
                                componentType: decl.componentType,
                                range: {
                                    start: { line: position.line, character: labelStartInRef },
                                    end: { line: position.line, character: labelEndInRef }
                                }
                            };
                        }
                    }
                }
                else {
                    // Found exact pattern
                    const labelStartInRef = refIndex + decl.componentType.length + 1; // +1 for the dot
                    const labelEndInRef = labelStartInRef + decl.label.length;
                    return {
                        type: 'component-label',
                        name: decl.label,
                        componentType: decl.componentType,
                        range: {
                            start: { line: position.line, character: labelStartInRef },
                            end: { line: position.line, character: labelEndInRef }
                        }
                    };
                }
            }
        }
    }
    return null;
}
