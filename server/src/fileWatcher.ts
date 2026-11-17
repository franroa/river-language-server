import * as fs from 'fs';
import * as path from 'path';
import { performanceManager } from './performance';

export interface FileChangeEvent {
    type: 'created' | 'modified' | 'deleted';
    path: string;
    timestamp: number;
}

export interface FileWatcherConfig {
    debounceMs: number;
    maxFiles: number;
    ignorePatterns: string[];
    extensions: string[];
}

/**
 * File watcher for incremental workspace updates
 */
export class FileWatcher {
    private watchers = new Map<string, fs.FSWatcher>();
    private debounceTimers = new Map<string, NodeJS.Timeout>();
    private changeCallbacks: ((event: FileChangeEvent) => void)[] = [];
    private config: FileWatcherConfig;
    
    constructor(config: Partial<FileWatcherConfig> = {}) {
        this.config = {
            debounceMs: 300,
            maxFiles: 1000,
            ignorePatterns: ['node_modules', '.git', '.vscode', 'dist', 'build', 'out', 'target', '.cache'],
            extensions: ['.alloy'],
            ...config
        };
    }
    
    /**
     * Start watching workspace folders
     */
    async watchWorkspace(folders: string[]): Promise<void> {
        for (const folder of folders) {
            if (fs.existsSync(folder)) {
                await this.watchDirectory(folder);
            }
        }
    }
    
    /**
     * Watch a single directory recursively
     */
    private async watchDirectory(dir: string): Promise<void> {
        try {
            const stats = fs.statSync(dir);
            if (!stats.isDirectory()) {
                return;
            }
            
            // Skip ignored directories
            const basename = path.basename(dir);
            if (this.config.ignorePatterns.some(pattern => basename.includes(pattern))) {
                return;
            }
            
            const watcher = fs.watch(dir, { recursive: true }, (eventType, filename) => {
                if (filename) {
                    const fullPath = path.join(dir, filename);
                    this.handleFileChange(eventType, fullPath);
                }
            });
            
            this.watchers.set(dir, watcher);
            
        } catch (error) {
            console.warn(`Failed to watch directory ${dir}: ${error}`);
        }
    }
    
    /**
     * Handle file system events with debouncing
     */
    private handleFileChange(eventType: string, filePath: string): void {
        // Only watch files with relevant extensions
        if (!this.config.extensions.some(ext => filePath.endsWith(ext))) {
            return;
        }
        
        // Skip ignored paths
        if (this.config.ignorePatterns.some(pattern => filePath.includes(pattern))) {
            return;
        }
        
        // Clear existing timer for this file
        const existingTimer = this.debounceTimers.get(filePath);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }
        
        // Set up new debounced timer
        const timer = setTimeout(() => {
            this.processFileChange(eventType, filePath);
            this.debounceTimers.delete(filePath);
        }, this.config.debounceMs);
        
        this.debounceTimers.set(filePath, timer);
    }
    
    /**
     * Process the actual file change after debouncing
     */
    private processFileChange(eventType: string, filePath: string): void {
        try {
            let changeType: FileChangeEvent['type'] = 'modified';
            
            if (eventType === 'rename') {
                // Check if file exists to determine if created or deleted
                if (fs.existsSync(filePath)) {
                    changeType = 'created';
                } else {
                    changeType = 'deleted';
                }
            }
            
            const event: FileChangeEvent = {
                type: changeType,
                path: filePath,
                timestamp: Date.now()
            };
            
            // Notify performance manager to clear caches
            if (changeType === 'modified' || changeType === 'deleted') {
                performanceManager.clearCaches([filePath]);
            }
            
            // Notify all registered callbacks
            for (const callback of this.changeCallbacks) {
                try {
                    callback(event);
                } catch (error) {
                    console.error(`Error in file change callback: ${error}`);
                }
            }
            
        } catch (error) {
            console.warn(`Error processing file change for ${filePath}: ${error}`);
        }
    }
    
    /**
     * Register a callback for file changes
     */
    onFileChange(callback: (event: FileChangeEvent) => void): void {
        this.changeCallbacks.push(callback);
    }
    
    /**
     * Remove a file change callback
     */
    removeFileChangeCallback(callback: (event: FileChangeEvent) => void): void {
        const index = this.changeCallbacks.indexOf(callback);
        if (index !== -1) {
            this.changeCallbacks.splice(index, 1);
        }
    }
    
    /**
     * Stop watching all directories
     */
    stopWatching(): void {
        // Clear all timers
        for (const timer of this.debounceTimers.values()) {
            clearTimeout(timer);
        }
        this.debounceTimers.clear();
        
        // Close all watchers
        for (const watcher of this.watchers.values()) {
            watcher.close();
        }
        this.watchers.clear();
        
        // Clear callbacks
        this.changeCallbacks.length = 0;
    }
    
    /**
     * Get stats about watched files
     */
    getStats(): { watchedDirectories: number; pendingChanges: number } {
        return {
            watchedDirectories: this.watchers.size,
            pendingChanges: this.debounceTimers.size
        };
    }
}

export const fileWatcher = new FileWatcher();