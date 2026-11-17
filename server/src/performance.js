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
exports.performanceManager = exports.PerformanceManager = void 0;
exports.getPerformanceManager = getPerformanceManager;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const utils = __importStar(require("./utils"));
/**
 * Performance manager for large workspaces
 */
class PerformanceManager {
    constructor(connection) {
        // File system cache with LRU eviction
        this.fileCache = new Map();
        // Cache access tracking for LRU
        this.accessOrder = [];
        // Component cache
        this.componentCache = new Map();
        // Diagnostics cache
        this.diagnosticsCache = new Map();
        // Performance tracking
        this.performanceMetrics = {
            fileReads: 0,
            cacheHits: 0,
            cacheMisses: 0,
            avgParseTime: 0,
            totalParseTime: 0,
            parseCount: 0
        };
        // Configuration
        this.config = {
            cacheTimeout: 30000, // 30 seconds
            maxFiles: 1000,
            chunkSize: 50,
            enableMetrics: true,
            diagnosticsDebounce: 1000,
            enableLazyLoading: true,
            enableIncrementalParsing: true,
            maxCacheSize: 500, // Maximum cached files
            cacheEvictionPolicy: 'lru'
        };
        this.connection = connection;
    }
    static getInstance(connection) {
        if (!PerformanceManager.instance) {
            PerformanceManager.instance = new PerformanceManager(connection);
        }
        return PerformanceManager.instance;
    }
    /**
     * Configure performance settings
     */
    configure(config) {
        Object.assign(this.config, config);
    }
    /**
     * Get cached file content or read from disk
     */
    async getCachedFileContent(filePath) {
        const cached = this.fileCache.get(filePath);
        try {
            const stats = fs.statSync(filePath);
            const lastModified = stats.mtime.getTime();
            if (cached && cached.lastModified === lastModified) {
                this.updateCacheAccess(filePath);
                this.performanceMetrics.cacheHits++;
                return { content: cached.content, fromCache: true };
            }
            // Cache miss - read file
            this.performanceMetrics.cacheMisses++;
            this.performanceMetrics.fileReads++;
            const content = fs.readFileSync(filePath, 'utf8');
            // Ensure cache doesn't exceed max size
            this.ensureCacheSize();
            this.fileCache.set(filePath, {
                content,
                lastModified,
                parsed: null,
                parseTime: 0,
                accessCount: 1,
                lastAccessed: Date.now(),
                size: content.length
            });
            return { content, fromCache: false };
        }
        catch (error) {
            // File doesn't exist or can't be read
            if (cached) {
                this.fileCache.delete(filePath);
                this.removeFromAccessOrder(filePath);
            }
            throw error;
        }
    }
    /**
     * Get cached parsed document or parse fresh
     */
    async getCachedParsedDocument(document) {
        const uri = document.uri;
        const cached = this.fileCache.get(uri);
        const contentHash = this.hashContent(document.getText());
        if (cached && cached.parsed && cached.parsed.contentHash === contentHash) {
            this.performanceMetrics.cacheHits++;
            return {
                components: cached.parsed.components,
                configBlocks: cached.parsed.configBlocks,
                fromCache: true
            };
        }
        // Cache miss - parse document
        const startTime = Date.now();
        this.performanceMetrics.cacheMisses++;
        const components = utils.parseDocument(document);
        const configBlocks = utils.parseConfigBlocks(document);
        const parseTime = Date.now() - startTime;
        // Update performance metrics
        this.performanceMetrics.totalParseTime += parseTime;
        this.performanceMetrics.parseCount++;
        this.performanceMetrics.avgParseTime = this.performanceMetrics.totalParseTime / this.performanceMetrics.parseCount;
        // Cache the results
        this.fileCache.set(uri, {
            content: document.getText(),
            lastModified: Date.now(),
            parsed: {
                components,
                configBlocks,
                contentHash
            },
            parseTime,
            accessCount: 1,
            lastAccessed: Date.now(),
            size: document.getText().length + JSON.stringify({ components, configBlocks }).length
        });
        return { components, configBlocks, fromCache: false };
    }
    /**
     * Get cached workspace components
     */
    getCachedWorkspaceComponents(documents) {
        const now = Date.now();
        const cacheKey = 'workspace';
        const cached = this.componentCache.get(cacheKey);
        if (cached && (now - cached.timestamp) < this.config.cacheTimeout) {
            this.performanceMetrics.cacheHits++;
            return { components: cached.components, fromCache: true };
        }
        // Cache miss - compute workspace components
        this.performanceMetrics.cacheMisses++;
        const components = utils.getAllAvailableComponents(undefined, documents);
        this.componentCache.set(cacheKey, {
            components,
            timestamp: now
        });
        return { components, fromCache: false };
    }
    /**
     * Get cached diagnostics for a document
     */
    async getCachedDiagnostics(document, documents, workspaceFolders) {
        const uri = document.uri;
        const contentHash = this.hashContent(document.getText());
        const cached = this.diagnosticsCache.get(uri);
        const now = Date.now();
        if (cached && cached.contentHash === contentHash &&
            (now - cached.timestamp) < this.config.cacheTimeout) {
            this.performanceMetrics.cacheHits++;
            return { diagnostics: cached.diagnostics, fromCache: true };
        }
        // Cache miss - compute diagnostics
        this.performanceMetrics.cacheMisses++;
        const { getDocumentDiagnostics } = await Promise.resolve().then(() => __importStar(require('./diagnostics')));
        const diagnostics = await getDocumentDiagnostics(document);
        this.diagnosticsCache.set(uri, {
            diagnostics,
            timestamp: now,
            contentHash
        });
        return { diagnostics, fromCache: false };
    }
    /**
     * Scan workspace in chunks for better performance
     */
    async scanWorkspaceInChunks(workspaceFolders, onChunk) {
        const allFiles = await this.findAlloyFilesRecursive(workspaceFolders);
        // Limit total files processed
        if (allFiles.length > this.config.maxFiles) {
            console.warn(`Found ${allFiles.length} .alloy files, limiting to ${this.config.maxFiles}`);
            allFiles.splice(this.config.maxFiles);
        }
        // Process in chunks
        const processedFiles = [];
        for (let i = 0; i < allFiles.length; i += this.config.chunkSize) {
            const chunk = allFiles.slice(i, i + this.config.chunkSize);
            processedFiles.push(...chunk);
            if (onChunk) {
                onChunk(chunk, {
                    current: Math.min(i + this.config.chunkSize, allFiles.length),
                    total: allFiles.length
                });
            }
            // Small delay to prevent blocking the event loop
            if (i + this.config.chunkSize < allFiles.length) {
                await this.sleep(10);
            }
        }
        return processedFiles;
    }
    /**
     * Lazy load workspace files - only load when needed
     */
    async lazyLoadWorkspaceFiles(workspaceFolders, priorityFiles = []) {
        if (!this.config.enableLazyLoading) {
            return this.scanWorkspaceInChunks(workspaceFolders);
        }
        const allFiles = await this.findAlloyFilesRecursive(workspaceFolders);
        // Prioritize frequently accessed files
        const prioritizedFiles = this.prioritizeFiles(allFiles, priorityFiles);
        // Only load high-priority files initially
        const highPriorityFiles = prioritizedFiles.slice(0, Math.min(50, prioritizedFiles.length));
        // Pre-load high priority files
        for (const filePath of highPriorityFiles) {
            try {
                await this.getCachedFileContent(filePath);
            }
            catch (error) {
                console.warn(`Failed to pre-load file ${filePath}: ${error}`);
            }
        }
        return prioritizedFiles;
    }
    /**
     * Incremental parsing - only re-parse changed files
     */
    async incrementalParseWorkspace(documents, changedFiles = []) {
        if (!this.config.enableIncrementalParsing) {
            return;
        }
        const startTime = Date.now();
        // Only parse changed files and their dependencies
        const filesToParse = new Set(changedFiles);
        // Find files that reference changed components
        for (const changedFile of changedFiles) {
            const dependentFiles = await this.findDependentFiles(changedFile, documents);
            dependentFiles.forEach(file => filesToParse.add(file));
        }
        // Clear caches for changed files
        for (const file of filesToParse) {
            this.clearCaches([file]);
        }
        const duration = Date.now() - startTime;
        this.connection?.console.log(`Incremental parsing completed in ${duration}ms for ${filesToParse.size} files`);
    }
    /**
     * Prioritize files based on access patterns and importance
     */
    prioritizeFiles(allFiles, priorityFiles) {
        const prioritized = [...allFiles];
        // Sort by priority: explicit priorities first, then by cache access patterns
        prioritized.sort((a, b) => {
            // Check explicit priorities
            const aPriority = priorityFiles.includes(a) ? 1 : 0;
            const bPriority = priorityFiles.includes(b) ? 1 : 0;
            if (aPriority !== bPriority) {
                return bPriority - aPriority;
            }
            // Then by cache access patterns
            const aCached = this.fileCache.get(a);
            const bCached = this.fileCache.get(b);
            if (aCached && bCached) {
                return bCached.accessCount - aCached.accessCount;
            }
            if (aCached)
                return -1;
            if (bCached)
                return 1;
            return 0;
        });
        return prioritized;
    }
    /**
     * Find files that depend on a given file
     */
    async findDependentFiles(changedFile, documents) {
        const dependentFiles = [];
        const changedUri = `file://${changedFile}`;
        try {
            // Get components from the changed file
            const changedDoc = documents.get(changedUri);
            if (!changedDoc)
                return dependentFiles;
            const components = utils.parseDocument(changedDoc);
            // Find files that reference these components
            for (const doc of documents.all()) {
                if (doc.uri === changedUri)
                    continue;
                const references = utils.parseComponentReferencesInDocument(doc, utils.getAllAvailableComponents(doc));
                const hasDependency = references.some(ref => ref.isValidReference &&
                    components.some(comp => comp.name === ref.componentType &&
                        comp.label === ref.componentLabel));
                if (hasDependency) {
                    dependentFiles.push(doc.uri.replace('file://', ''));
                }
            }
        }
        catch (error) {
            console.warn(`Error finding dependent files for ${changedFile}: ${error}`);
        }
        return dependentFiles;
    }
    /**
     * Optimized workspace diagnostics with batching
     */
    async getOptimizedWorkspaceDiagnostics(documents, workspaceFolders) {
        const startTime = Date.now();
        const allDocuments = documents.all();
        // Use fallback if there are too many files
        if (allDocuments.length > this.config.maxFiles / 2) {
            console.warn(`Large workspace detected (${allDocuments.length} files), using fallback diagnostics`);
            const { getWorkspaceDiagnostics } = await Promise.resolve().then(() => __importStar(require('./diagnostics')));
            return await getWorkspaceDiagnostics(documents);
        }
        // Process documents in batches to avoid overwhelming the system
        const results = [];
        const batchSize = Math.min(this.config.chunkSize, 20); // Smaller batches for diagnostics
        for (let i = 0; i < allDocuments.length; i += batchSize) {
            const batch = allDocuments.slice(i, i + batchSize);
            const batchPromises = batch.map(async (doc) => {
                const { diagnostics } = await this.getCachedDiagnostics(doc, documents, workspaceFolders);
                return diagnostics.length > 0 ? { uri: doc.uri, items: diagnostics } : null;
            });
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults.filter(r => r !== null));
            // Small delay between batches
            if (i + batchSize < allDocuments.length) {
                await this.sleep(5);
            }
        }
        const duration = Date.now() - startTime;
        this.connection?.console.log(`Optimized workspace diagnostics completed in ${duration}ms for ${allDocuments.length} files`);
        return results;
    }
    /**
     * Clear caches (call when files change significantly)
     */
    clearCaches(patterns) {
        if (!patterns || patterns.length === 0) {
            this.fileCache.clear();
            this.componentCache.clear();
            this.diagnosticsCache.clear();
            return;
        }
        // Clear specific patterns
        for (const pattern of patterns) {
            for (const key of this.fileCache.keys()) {
                if (key.includes(pattern)) {
                    this.fileCache.delete(key);
                }
            }
            for (const key of this.diagnosticsCache.keys()) {
                if (key.includes(pattern)) {
                    this.diagnosticsCache.delete(key);
                }
            }
        }
        // Always clear workspace component cache when files change
        this.componentCache.clear();
    }
    /**
     * Get performance metrics
     */
    getMetrics() {
        return {
            ...this.performanceMetrics,
            cacheHitRatio: this.performanceMetrics.cacheHits /
                (this.performanceMetrics.cacheHits + this.performanceMetrics.cacheMisses) || 0,
            cacheSize: {
                files: this.fileCache.size,
                components: this.componentCache.size,
                diagnostics: this.diagnosticsCache.size
            }
        };
    }
    /**
     * Reset metrics
     */
    resetMetrics() {
        this.performanceMetrics = {
            fileReads: 0,
            cacheHits: 0,
            cacheMisses: 0,
            avgParseTime: 0,
            totalParseTime: 0,
            parseCount: 0
        };
    }
    // Private helper methods
    async findAlloyFilesRecursive(folders) {
        const files = [];
        const scanDir = async (dir) => {
            try {
                const entries = await fs.promises.readdir(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        // Skip common directories that shouldn't contain alloy files
                        if (!['node_modules', '.git', '.vscode', 'dist', 'build', 'out', 'target', '.cache'].includes(entry.name)) {
                            await scanDir(fullPath);
                        }
                    }
                    else if (entry.isFile() && entry.name.endsWith('.alloy')) {
                        files.push(fullPath);
                    }
                }
            }
            catch (error) {
                console.warn(`Error scanning directory ${dir}: ${error}`);
            }
        };
        for (const folder of folders) {
            if (fs.existsSync(folder)) {
                await scanDir(folder);
            }
        }
        return files;
    }
    hashContent(content) {
        // Simple hash function for content change detection
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return hash.toString();
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Update cache access tracking for LRU
     */
    updateCacheAccess(filePath) {
        const cached = this.fileCache.get(filePath);
        if (cached) {
            cached.accessCount++;
            cached.lastAccessed = Date.now();
            // Update access order for LRU
            this.removeFromAccessOrder(filePath);
            this.accessOrder.push(filePath);
        }
    }
    /**
     * Ensure cache doesn't exceed maximum size
     */
    ensureCacheSize() {
        while (this.fileCache.size >= this.config.maxCacheSize && this.accessOrder.length > 0) {
            const oldestKey = this.accessOrder.shift();
            if (oldestKey) {
                this.fileCache.delete(oldestKey);
            }
        }
    }
    /**
     * Remove file from access order tracking
     */
    removeFromAccessOrder(filePath) {
        const index = this.accessOrder.indexOf(filePath);
        if (index > -1) {
            this.accessOrder.splice(index, 1);
        }
    }
}
exports.PerformanceManager = PerformanceManager;
// Global instance for reuse - will be initialized with connection when needed
let _performanceManager = null;
function getPerformanceManager(connection) {
    if (!_performanceManager) {
        _performanceManager = PerformanceManager.getInstance(connection);
    }
    return _performanceManager;
}
// For backward compatibility
exports.performanceManager = {
    scanWorkspaceInChunks: (workspaceFolders, progressCallback) => {
        const manager = getPerformanceManager();
        return manager.scanWorkspaceInChunks(workspaceFolders, progressCallback);
    },
    getCachedFileContent: (filePath) => {
        const manager = getPerformanceManager();
        return manager.getCachedFileContent(filePath);
    },
    getOptimizedWorkspaceDiagnostics: (documents, workspaceFolders) => {
        const manager = getPerformanceManager();
        return manager.getOptimizedWorkspaceDiagnostics(documents, workspaceFolders);
    },
    getMetrics: () => {
        const manager = getPerformanceManager();
        return manager.getMetrics();
    },
    configure: (config) => {
        const manager = getPerformanceManager();
        return manager.configure(config);
    },
    clearCaches: (patterns) => {
        const manager = getPerformanceManager();
        return manager.clearCaches(patterns);
    },
    resetMetrics: () => {
        const manager = getPerformanceManager();
        return manager.resetMetrics();
    }
};
