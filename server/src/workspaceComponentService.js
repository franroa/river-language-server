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
exports.workspaceComponentService = exports.WorkspaceComponentService = void 0;
const node_1 = require("vscode-languageserver/node");
const utils = __importStar(require("./utils"));
const path = __importStar(require("path"));
const performance_1 = require("./performance");
/**
 * Workspace component scanning service
 * Centralizes the logic for discovering components across all workspace files
 */
class WorkspaceComponentService {
    constructor(connection) {
        this.cachedComponents = null;
        this.cacheTimestamp = 0;
        this.CACHE_DURATION = 30000; // 30 seconds
        this.connection = connection;
    }
    /**
     * Get all workspace documents (opened + workspace files)
     * Prioritizes opened documents to include unsaved changes
     * When no workspace folders are configured, scans directory of opened files
     */
    async getAllWorkspaceDocuments(documents, workspaceFolders) {
        const performanceManager = (0, performance_1.getPerformanceManager)(this.connection);
        // Get opened documents - these have current unsaved changes
        const openedDocs = documents.all();
        try {
            let foldersToScan = workspaceFolders;
            // If no workspace folders are configured but we have opened documents,
            // scan the directory of the first opened document
            if (foldersToScan.length === 0 && openedDocs.length > 0) {
                const firstDocUri = openedDocs[0].uri;
                if (firstDocUri.startsWith('file://')) {
                    const filePath = firstDocUri.substring(7); // Remove 'file://' prefix
                    const dirPath = path.dirname(filePath);
                    foldersToScan = [dirPath];
                    this.connection?.console.log(`No workspace configured, scanning directory: ${dirPath}`);
                }
            }
            // Get all alloy files in workspace or directory
            const alloyFiles = await performanceManager.lazyLoadWorkspaceFiles(foldersToScan, [] // No priority files
            );
            // Create TextDocument objects for workspace files not already opened
            const workspaceDocuments = [];
            for (const filePath of alloyFiles) {
                const uri = `file://${filePath}`;
                // Skip if already opened - we want to use the opened document with unsaved changes
                if (documents.get(uri)) {
                    continue;
                }
                try {
                    const { content } = await performanceManager.getCachedFileContent(filePath);
                    const document = node_1.TextDocument.create(uri, 'alloy', 1, content);
                    workspaceDocuments.push(document);
                }
                catch (error) {
                    console.warn(`Error reading workspace file ${filePath}: ${error}`);
                }
            }
            // Return opened documents first (with unsaved changes), then workspace documents from cache
            return [...openedDocs, ...workspaceDocuments];
        }
        catch (error) {
            console.warn(`Error getting workspace documents: ${error}`);
            return openedDocs; // Fallback to opened documents only
        }
    }
    /**
     * Create a workspace-wide component label map from all documents
     */
    createWorkspaceComponentLabelMap(allDocuments) {
        const workspaceComponentLabelMap = {};
        for (const doc of allDocuments) {
            const docComponentLabelMap = utils.createComponentLabelMap(doc);
            // Merge component label maps from all documents
            // Use Object.assign which will handle overwrites naturally
            // Components from later documents will overwrite earlier ones with the same key
            Object.assign(workspaceComponentLabelMap, docComponentLabelMap);
        }
        return workspaceComponentLabelMap;
    }
    /**
     * Get workspace diagnostics data including component label map
     */
    async getWorkspaceDiagnosticsData(documents, workspaceFolders) {
        const allDocuments = await this.getAllWorkspaceDocuments(documents, workspaceFolders);
        const componentLabelMap = this.createWorkspaceComponentLabelMap(allDocuments);
        return {
            allDocuments,
            componentLabelMap
        };
    }
    /**
     * Get all available components from workspace (builtin + declared + normal)
     * This scans ALL files in the workspace, not just opened ones
     * Uses caching for performance
     */
    async getAllWorkspaceComponents(documents, workspaceFolders) {
        const builtinComponents = utils.getAllComponentData();
        const allComponents = { ...builtinComponents };
        try {
            // Get all workspace documents (opened + workspace files)
            const allDocuments = await this.getAllWorkspaceDocuments(documents, workspaceFolders);
            // Process all documents for both declared and normal components
            for (const doc of allDocuments) {
                // First, handle declared components (from declare blocks)
                const declaredComponents = utils.getDeclaredComponents(doc);
                for (const [name, configBlock] of Object.entries(declaredComponents)) {
                    // Extract structure from the declare block
                    const declareStructure = utils.extractDeclareStructure(configBlock);
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
                // Second, handle normal components (regular component declarations)
                const allDeclarations = utils.getAllComponentDeclarations(doc);
                for (const decl of allDeclarations) {
                    const componentType = decl.componentType;
                    const componentLabel = decl.label;
                    // Skip if this is already a declared component (handled above)
                    if (allComponents[componentType]?.isDeclared) {
                        continue;
                    }
                    // Skip if this component type is already in builtins
                    if (builtinComponents[componentType]) {
                        continue;
                    }
                    // Add normal component to registry if not already present
                    if (!allComponents[componentType]) {
                        // Get the builtin component data as a base
                        const builtinData = builtinComponents[componentType];
                        if (builtinData) {
                            allComponents[componentType] = {
                                name: builtinData.name,
                                usage: builtinData.usage,
                                template: builtinData.template,
                                arguments: builtinData.arguments,
                                blocks: builtinData.blocks,
                                lsp_structure: builtinData.lsp_structure,
                                sourceUri: doc.uri, // Track which file this component instance comes from
                                // Add instance information for cross-file navigation
                                instances: [{
                                        label: componentLabel,
                                        uri: doc.uri,
                                        line: decl.line,
                                        range: decl.range
                                    }]
                            };
                        }
                        else {
                            // If not in builtins, create a minimal entry for navigation purposes
                            allComponents[componentType] = {
                                name: componentType,
                                usage: `Component "${componentType}"`,
                                template: `${componentType} "\${1:label}" {\n  $0\n}`,
                                arguments: [],
                                blocks: [],
                                lsp_structure: {
                                    component: componentType,
                                    arguments: {},
                                    blocks: {},
                                    required_blocks: [],
                                    conditional_blocks: {}
                                },
                                isNormal: true,
                                sourceUri: doc.uri,
                                instances: [{
                                        label: componentLabel,
                                        uri: doc.uri,
                                        line: decl.line,
                                        range: decl.range
                                    }]
                            };
                        }
                    }
                    else {
                        // Component type already exists, just add this instance
                        if (!allComponents[componentType].instances) {
                            allComponents[componentType].instances = [];
                        }
                        allComponents[componentType].instances.push({
                            label: componentLabel,
                            uri: doc.uri,
                            line: decl.line,
                            range: decl.range
                        });
                    }
                }
            }
            // Cache the results
            this.cachedComponents = allComponents;
            this.cacheTimestamp = Date.now();
            return allComponents;
        }
        catch (error) {
            console.warn('Error scanning workspace for components:', error);
            // Fallback to opened documents only
            return utils.getAllAvailableComponents(undefined, documents);
        }
    }
    /**
     * Get cached workspace components (synchronous)
     * Returns cached results if available and not expired, otherwise falls back to opened documents
     */
    getCachedWorkspaceComponents(documents) {
        const now = Date.now();
        // Return cached results if available and not expired
        if (this.cachedComponents && (now - this.cacheTimestamp) < this.CACHE_DURATION) {
            return this.cachedComponents;
        }
        // Fallback to opened documents only
        return utils.getAllAvailableComponents(undefined, documents);
    }
    /**
     * Clear the component cache
     */
    clearCache() {
        this.cachedComponents = null;
        this.cacheTimestamp = 0;
    }
}
exports.WorkspaceComponentService = WorkspaceComponentService;
// Export singleton instance
exports.workspaceComponentService = new WorkspaceComponentService();
