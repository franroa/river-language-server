import { TextDocument } from "vscode-languageserver-textdocument";
import { TextDocuments, Connection } from "vscode-languageserver/node";
import * as fs from 'fs';
import * as path from 'path';
import * as utils from './utils';


/**
 * Performance manager for large workspaces
 */
export class PerformanceManager {
    private static instance: PerformanceManager;
    private connection?: Connection;

    // File system cache with LRU eviction
    private fileCache = new Map<string, {
        content: string;
        lastModified: number;
        parsed: any;
        parseTime: number;
        accessCount: number;
        lastAccessed: number;
        size: number; // Estimated memory size
    }>();

    // Cache access tracking for LRU
    private accessOrder: string[] = [];

    // Component cache
    private componentCache = new Map<string, {
        components: Record<string, any>;
        timestamp: number;
    }>();

    // Diagnostics cache
    private diagnosticsCache = new Map<string, {
        diagnostics: any[];
        timestamp: number;
        contentHash: string;
    }>();

    // Performance tracking
    private performanceMetrics = {
        fileReads: 0,
        cacheHits: 0,
        cacheMisses: 0,
        avgParseTime: 0,
        totalParseTime: 0,
        parseCount: 0
    };

    // Configuration
    private config = {
        cacheTimeout: 30000, // 30 seconds
        maxFiles: 1000,
        chunkSize: 50,
        enableMetrics: true,
        diagnosticsDebounce: 1000,
        enableLazyLoading: true,
        enableIncrementalParsing: true,
        maxCacheSize: 500, // Maximum cached files
        cacheEvictionPolicy: 'lru' as 'lru' | 'fifo'
    };

    private constructor(connection?: Connection) {
        this.connection = connection;
    }
    
    static getInstance(connection?: Connection): PerformanceManager {
        if (!PerformanceManager.instance) {
            PerformanceManager.instance = new PerformanceManager(connection);
        }
        return PerformanceManager.instance;
    }
    
    /**
     * Configure performance settings
     */
    configure(config: Partial<typeof this.config>) {
        Object.assign(this.config, config);
    }
    
    /**
     * Get cached file content or read from disk
     */
    async getCachedFileContent(filePath: string): Promise<{ content: string; fromCache: boolean }> {
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
        } catch (error) {
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
    async getCachedParsedDocument(document: TextDocument): Promise<{ 
        components: utils.ParsedComponent[]; 
        configBlocks: utils.ParsedConfigBlock[];
        fromCache: boolean;
    }> {
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
    getCachedWorkspaceComponents(documents: TextDocuments<TextDocument>): {
        components: Record<string, any>;
        fromCache: boolean;
    } {
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
    async getCachedDiagnostics(document: TextDocument, documents?: TextDocuments<TextDocument>, workspaceFolders?: string[]): Promise<{
        diagnostics: any[];
        fromCache: boolean;
    }> {
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
        const { getDocumentDiagnostics } = await import('./diagnostics');
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
    async scanWorkspaceInChunks(workspaceFolders: string[],
        onChunk?: (files: string[], progress: { current: number; total: number }) => void): Promise<string[]> {

        const allFiles = await this.findAlloyFilesRecursive(workspaceFolders);

        // Limit total files processed
        if (allFiles.length > this.config.maxFiles) {
            console.warn(`Found ${allFiles.length} .alloy files, limiting to ${this.config.maxFiles}`);
            allFiles.splice(this.config.maxFiles);
        }

        // Process in chunks
        const processedFiles: string[] = [];
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
    async lazyLoadWorkspaceFiles(workspaceFolders: string[], priorityFiles: string[] = []): Promise<string[]> {
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
            } catch (error) {
                console.warn(`Failed to pre-load file ${filePath}: ${error}`);
            }
        }

        return prioritizedFiles;
    }

    /**
     * Incremental parsing - only re-parse changed files
     */
    async incrementalParseWorkspace(documents: TextDocuments<TextDocument>,
        changedFiles: string[] = []): Promise<void> {

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
    private prioritizeFiles(allFiles: string[], priorityFiles: string[]): string[] {
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

            if (aCached) return -1;
            if (bCached) return 1;

            return 0;
        });

        return prioritized;
    }

    /**
     * Find files that depend on a given file
     */
    private async findDependentFiles(changedFile: string, documents: TextDocuments<TextDocument>): Promise<string[]> {
        const dependentFiles: string[] = [];
        const changedUri = `file://${changedFile}`;

        try {
            // Get components from the changed file
            const changedDoc = documents.get(changedUri);
            if (!changedDoc) return dependentFiles;

            const components = utils.parseDocument(changedDoc);

            // Find files that reference these components
            for (const doc of documents.all()) {
                if (doc.uri === changedUri) continue;

                const references = utils.parseComponentReferencesInDocument(doc, utils.getAllAvailableComponents(doc));
                const hasDependency = references.some(ref =>
                    ref.isValidReference &&
                    components.some(comp =>
                        comp.name === ref.componentType &&
                        comp.label === ref.componentLabel
                    )
                );

                if (hasDependency) {
                    dependentFiles.push(doc.uri.replace('file://', ''));
                }
            }
        } catch (error) {
            console.warn(`Error finding dependent files for ${changedFile}: ${error}`);
        }

        return dependentFiles;
    }
    
    /**
     * Optimized workspace diagnostics with batching
     */
    async getOptimizedWorkspaceDiagnostics(documents: TextDocuments<TextDocument>, workspaceFolders?: string[]): Promise<{ uri: string; items: any[] }[]> {
        const startTime = Date.now();
        const allDocuments = documents.all();
        
        // Use fallback if there are too many files
        if (allDocuments.length > this.config.maxFiles / 2) {
            console.warn(`Large workspace detected (${allDocuments.length} files), using fallback diagnostics`);
            const { getWorkspaceDiagnostics } = await import('./diagnostics');
            return await getWorkspaceDiagnostics(documents);
        }
        
        // Process documents in batches to avoid overwhelming the system
        const results: { uri: string; items: any[] }[] = [];
        const batchSize = Math.min(this.config.chunkSize, 20); // Smaller batches for diagnostics
        
        for (let i = 0; i < allDocuments.length; i += batchSize) {
            const batch = allDocuments.slice(i, i + batchSize);
            const batchPromises = batch.map(async (doc) => {
                const { diagnostics } = await this.getCachedDiagnostics(doc, documents, workspaceFolders);
                return diagnostics.length > 0 ? { uri: doc.uri, items: diagnostics } : null;
            });
            
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults.filter(r => r !== null) as { uri: string; items: any[] }[]);
            
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
    clearCaches(patterns?: string[]) {
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
    private async findAlloyFilesRecursive(folders: string[]): Promise<string[]> {
        const files: string[] = [];
        
        const scanDir = async (dir: string) => {
            try {
                const entries = await fs.promises.readdir(dir, { withFileTypes: true });
                
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    
                    if (entry.isDirectory()) {
                        // Skip common directories that shouldn't contain alloy files
                        if (!['node_modules', '.git', '.vscode', 'dist', 'build', 'out', 'target', '.cache'].includes(entry.name)) {
                            await scanDir(fullPath);
                        }
                    } else if (entry.isFile() && entry.name.endsWith('.alloy')) {
                        files.push(fullPath);
                    }
                }
            } catch (error) {
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
    
    private hashContent(content: string): string {
        // Simple hash function for content change detection
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return hash.toString();
    }
    
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Update cache access tracking for LRU
     */
    private updateCacheAccess(filePath: string): void {
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
    private ensureCacheSize(): void {
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
    private removeFromAccessOrder(filePath: string): void {
        const index = this.accessOrder.indexOf(filePath);
        if (index > -1) {
            this.accessOrder.splice(index, 1);
        }
    }
}

// Global instance for reuse - will be initialized with connection when needed
let _performanceManager: PerformanceManager | null = null;

export function getPerformanceManager(connection?: Connection): PerformanceManager {
    if (!_performanceManager) {
        _performanceManager = PerformanceManager.getInstance(connection);
    }
    return _performanceManager;
}

// For backward compatibility
export const performanceManager = {
    scanWorkspaceInChunks: (workspaceFolders: string[], progressCallback?: (chunk: any[], progress: any) => void) => {
        const manager = getPerformanceManager();
        return manager.scanWorkspaceInChunks(workspaceFolders, progressCallback);
    },
    getCachedFileContent: (filePath: string) => {
        const manager = getPerformanceManager();
        return manager.getCachedFileContent(filePath);
    },
    getOptimizedWorkspaceDiagnostics: (documents: TextDocuments<TextDocument>, workspaceFolders?: string[]) => {
        const manager = getPerformanceManager();
        return manager.getOptimizedWorkspaceDiagnostics(documents, workspaceFolders);
    },
    getMetrics: () => {
        const manager = getPerformanceManager();
        return manager.getMetrics();
    },
    configure: (config: any) => {
        const manager = getPerformanceManager();
        return manager.configure(config);
    },
    clearCaches: (patterns?: string[]) => {
        const manager = getPerformanceManager();
        return manager.clearCaches(patterns);
    },
    resetMetrics: () => {
        const manager = getPerformanceManager();
        return manager.resetMetrics();
    }
};