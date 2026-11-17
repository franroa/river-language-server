/**
 * Configuration management for the Alloy Language Server
 */

import { Connection, DidChangeConfigurationNotification } from "vscode-languageserver/node";

export interface AlloyLspConfiguration {
    diagnostics: DiagnosticsConfiguration;
    performance: PerformanceConfiguration;
    symbols: SymbolsConfiguration;
    completion: CompletionConfiguration;
    semanticTokens: SemanticTokensConfiguration;
    codeLens: CodeLensConfiguration;
}

export interface DiagnosticsConfiguration {
    enabled: boolean;
        severity: {
            unknownComponent: 'error' | 'warning' | 'info' | 'off';
            unknownBlock: 'error' | 'warning' | 'info' | 'off';
            missingRequiredArgument: 'error' | 'warning' | 'info' | 'off';
            unknownArgument: 'error' | 'warning' | 'info' | 'off';
            duplicateComponent: 'error' | 'warning' | 'info' | 'off';
            componentReference: 'error' | 'warning' | 'info' | 'off';
            crossScopeReference: 'error' | 'warning' | 'info' | 'off';
            invalidArgumentType: 'error' | 'warning' | 'info' | 'off';
            deprecatedComponent: 'error' | 'warning' | 'info' | 'off';
            unusedComponent: 'error' | 'warning' | 'info' | 'off';
            unusedArgument: 'error' | 'warning' | 'info' | 'off';
            circularDependency: 'error' | 'warning' | 'info' | 'off';
        };
    validation: {
        enableWorkspaceValidation: boolean;
        enableCrossScopeValidation: boolean;
        enableDuplicateDetection: boolean;
        enableReferenceValidation: boolean;
        enableTypeValidation: boolean;
        enableDeprecationCheck: boolean;
        enableUnusedDetection: boolean;
        enableCircularDependencyCheck: boolean;
        enableSyntaxValidation: boolean;
    };
    throttle: {
        workspaceDiagnosticsDelay: number; // milliseconds
        documentDiagnosticsDelay: number; // milliseconds
        maxConcurrentValidations: number;
    };
    filtering: {
        excludePatterns: string[]; // glob patterns to exclude from diagnostics
        includePatterns: string[]; // glob patterns to include in diagnostics
        maxDiagnosticsPerFile: number;
        maxDiagnosticsTotal: number;
    };
}

export interface PerformanceConfiguration {
    maxFiles: number;
    chunkSize: number;
    cacheTimeout: number; // milliseconds
    enableMetrics: boolean;
    enableCaching: boolean;
    optimizedParsing: boolean;
}

export interface SymbolsConfiguration {
    enableFuzzySearch: boolean;
    enableHierarchy: boolean;
    maxSymbolResults: number;
    enableRelationships: boolean;
    enableWorkspaceSymbolsInOutline: boolean;
    maxWorkspaceSymbolsInOutline: number;
}

export interface CompletionConfiguration {
    enabled: boolean;
    maxCompletionItems: number;
    enableSnippets: boolean;
    enableArgumentCompletion: boolean;
    enableComponentCompletion: boolean;
}

export interface SemanticTokensConfiguration {
    enabled: boolean;
}

export interface CodeLensConfiguration {
    enabled: boolean;
    showReferenceCounts: boolean;
    showUsageCounts: boolean;
    showDocumentationLinks: boolean;
    showValidationStatus: boolean;
    refreshOnSave: boolean;
}

/**
 * Configuration manager for the Language Server
 */
export class ConfigurationManager {
    private connection: Connection | null = null;
    private hasConfigurationCapability = false;
    private currentConfig: AlloyLspConfiguration;

    constructor() {
        this.currentConfig = this.getDefaultConfiguration();
    }

    /**
     * Initialize configuration management
     */
    async initialize(connection: Connection, hasConfigurationCapability: boolean) {
        this.connection = connection;
        this.hasConfigurationCapability = hasConfigurationCapability;

        if (hasConfigurationCapability) {
            // Register for configuration changes
            connection.client.register(DidChangeConfigurationNotification.type, undefined);

            // Load initial configuration
            await this.updateConfiguration();

            // Listen for configuration changes
            connection.onDidChangeConfiguration(async (change) => {
                if (this.hasConfigurationCapability) {
                    // Update configuration
                    await this.updateConfiguration();
                } else {
                    // Fall back to using the change directly
                    this.currentConfig = change.settings.alloyLsp || this.getDefaultConfiguration();
                }

                connection.console.log("Configuration updated");
                this.logConfiguration();
            });
        }

        connection.console.log("Configuration manager initialized");
    }

    /**
     * Get current configuration
     */
    getConfiguration(): AlloyLspConfiguration {
        return { ...this.currentConfig };
    }

    /**
     * Get configuration section
     */
    getDiagnosticsConfig(): DiagnosticsConfiguration {
        return { ...this.currentConfig.diagnostics };
    }

    getPerformanceConfig(): PerformanceConfiguration {
        return { ...this.currentConfig.performance };
    }

    getSymbolsConfig(): SymbolsConfiguration {
        return { ...this.currentConfig.symbols };
    }

    getCompletionConfig(): CompletionConfiguration {
        return { ...this.currentConfig.completion };
    }

    /**
     * Update configuration from client
     */
    private async updateConfiguration(): Promise<void> {
        if (!this.connection || !this.hasConfigurationCapability) {
            return;
        }

        try {
            const result = await this.connection.workspace.getConfiguration('alloyLsp');
            this.connection.console.log(`Received configuration from client: ${JSON.stringify(result, null, 2)}`);
            this.currentConfig = { ...this.getDefaultConfiguration(), ...result };
            this.connection.console.log(`Final merged configuration: ${JSON.stringify(this.currentConfig, null, 2)}`);
        } catch (error) {
            this.connection?.console.warn(`Failed to fetch configuration: ${error}`);
        }
    }

    /**
     * Get default configuration
     */
    private getDefaultConfiguration(): AlloyLspConfiguration {
        return {
            diagnostics: {
                enabled: true,
                severity: {
                    unknownComponent: 'error',
                    unknownBlock: 'error',
                    missingRequiredArgument: 'error',
                    unknownArgument: 'error',
                    duplicateComponent: 'error',
                    componentReference: 'error',
                    crossScopeReference: 'error',
                    invalidArgumentType: 'error',
                    deprecatedComponent: 'warning',
                    unusedComponent: 'info',
                    unusedArgument: 'warning',
                    circularDependency: 'error'
                },
                validation: {
                    enableWorkspaceValidation: true,
                    enableCrossScopeValidation: true,
                    enableDuplicateDetection: true,
                    enableReferenceValidation: true,
                    enableTypeValidation: true,
                    enableDeprecationCheck: true,
                    enableUnusedDetection: true,
                    enableCircularDependencyCheck: true,
                    enableSyntaxValidation: true
                },
                throttle: {
                    workspaceDiagnosticsDelay: 1000,
                    documentDiagnosticsDelay: 300,
                    maxConcurrentValidations: 5
                },
                filtering: {
                    excludePatterns: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
                    includePatterns: ['**/*.alloy'],
                    maxDiagnosticsPerFile: 100,
                    maxDiagnosticsTotal: 1000
                }
            },
            performance: {
                maxFiles: 1000,
                chunkSize: 50,
                cacheTimeout: 30000,
                enableMetrics: true,
                enableCaching: true,
                optimizedParsing: true
            },
            symbols: {
                enableFuzzySearch: true,
                enableHierarchy: true,
                maxSymbolResults: 150,
                enableRelationships: true,
                enableWorkspaceSymbolsInOutline: false,
                maxWorkspaceSymbolsInOutline: 20
            },
            completion: {
                enabled: true,
                maxCompletionItems: 100,
                enableSnippets: true,
                enableArgumentCompletion: true,
                enableComponentCompletion: true
            },
            semanticTokens: {
                enabled: true
            },
            codeLens: {
                enabled: true,
                showReferenceCounts: true,
                showUsageCounts: true,
                showDocumentationLinks: true,
                showValidationStatus: true,
                refreshOnSave: true
            }
        };
    }

    /**
     * Log current configuration
     */
    private logConfiguration(): void {
        if (!this.connection) return;

        const config = this.currentConfig;
        this.connection.console.log(`Configuration:
  Diagnostics: ${config.diagnostics.enabled ? 'enabled' : 'disabled'}
  Performance: max ${config.performance.maxFiles} files, ${config.performance.chunkSize} chunk size
  Symbols: fuzzy search ${config.symbols.enableFuzzySearch ? 'on' : 'off'}, hierarchy ${config.symbols.enableHierarchy ? 'on' : 'off'}
  Completion: ${config.completion.enabled ? 'enabled' : 'disabled'}, max ${config.completion.maxCompletionItems} items`);
    }

    /**
     * Check if a diagnostic type is enabled
     */
    isDiagnosticEnabled(type: keyof DiagnosticsConfiguration['severity']): boolean {
        return this.currentConfig.diagnostics.enabled && 
               this.currentConfig.diagnostics.severity[type] !== 'off';
    }

    /**
     * Get diagnostic severity level
     */
    getDiagnosticSeverity(type: keyof DiagnosticsConfiguration['severity']): 'error' | 'warning' | 'info' | 'off' {
        return this.currentConfig.diagnostics.severity[type];
    }

    /**
     * Check if validation type is enabled
     */
    isValidationEnabled(type: keyof DiagnosticsConfiguration['validation']): boolean {
        return this.currentConfig.diagnostics.enabled &&
                this.currentConfig.diagnostics.validation[type];
    }

    /**
     * Check if a file should be included in diagnostics based on patterns
     */
    shouldIncludeFile(filePath: string): boolean {
        const { includePatterns, excludePatterns } = this.currentConfig.diagnostics.filtering;

        // Check exclude patterns first
        for (const pattern of excludePatterns) {
            if (this.matchesPattern(filePath, pattern)) {
                return false;
            }
        }

        // Check include patterns
        for (const pattern of includePatterns) {
            if (this.matchesPattern(filePath, pattern)) {
                return true;
            }
        }

        // If no include patterns match, exclude by default
        return includePatterns.length === 0;
    }

    /**
     * Get maximum diagnostics limits
     */
    getDiagnosticsLimits(): { perFile: number; total: number } {
        return {
            perFile: this.currentConfig.diagnostics.filtering.maxDiagnosticsPerFile,
            total: this.currentConfig.diagnostics.filtering.maxDiagnosticsTotal
        };
    }

    /**
     * Get throttle settings
     */
    getThrottleSettings(): DiagnosticsConfiguration['throttle'] {
        return { ...this.currentConfig.diagnostics.throttle };
    }

    /**
     * Simple glob pattern matching (basic implementation)
     */
    private matchesPattern(filePath: string, pattern: string): boolean {
        // Convert glob pattern to regex
        const regexPattern = pattern
            .replace(/\*\*/g, '.*')  // ** matches any number of path segments
            .replace(/\*/g, '[^/]*') // * matches any characters except /
            .replace(/\?/g, '[^/]');  // ? matches any single character except /

        const regex = new RegExp(`^${regexPattern}$`);
        return regex.test(filePath);
    }

    /**
     * Check if semantic tokens are enabled
     */
    isSemanticTokensEnabled(): boolean {
        return this.currentConfig.semanticTokens.enabled;
    }

    /**
     * Check if code lens is enabled
     */
    isCodeLensEnabled(): boolean {
        return this.currentConfig.codeLens.enabled;
    }

    /**
     * Get code lens configuration
     */
    getCodeLensConfig(): CodeLensConfiguration {
        return this.currentConfig.codeLens;
    }
}

// Global configuration manager instance
export const configManager = new ConfigurationManager();

/**
 * Configuration schema for VS Code settings
 */
export const CONFIGURATION_SCHEMA = {
    "type": "object",
    "properties": {
        "alloyLsp": {
            "type": "object",
            "properties": {
                "diagnostics": {
                    "type": "object",
                    "properties": {
                        "enabled": {
                            "type": "boolean",
                            "default": true,
                            "description": "Enable/disable all diagnostics"
                        },
                        "severity": {
                            "type": "object",
                            "properties": {
                                "unknownComponent": {
                                    "type": "string",
                                    "enum": ["error", "warning", "info", "off"],
                                    "default": "error",
                                    "description": "Severity for unknown component diagnostics"
                                },
                                "unknownBlock": {
                                    "type": "string",
                                    "enum": ["error", "warning", "info", "off"],
                                    "default": "error",
                                    "description": "Severity for unknown block diagnostics"
                                },
                                "missingRequiredArgument": {
                                    "type": "string",
                                    "enum": ["error", "warning", "info", "off"],
                                    "default": "error",
                                    "description": "Severity for missing required argument diagnostics"
                                },
                                "unknownArgument": {
                                    "type": "string",
                                    "enum": ["error", "warning", "info", "off"],
                                    "default": "error",
                                    "description": "Severity for unknown argument diagnostics"
                                },
                                "duplicateComponent": {
                                    "type": "string",
                                    "enum": ["error", "warning", "info", "off"],
                                    "default": "error",
                                    "description": "Severity for duplicate component diagnostics"
                                },
                                "componentReference": {
                                    "type": "string",
                                    "enum": ["error", "warning", "info", "off"],
                                    "default": "error",
                                    "description": "Severity for component reference diagnostics"
                                },
                                "crossScopeReference": {
                                    "type": "string",
                                    "enum": ["error", "warning", "info", "off"],
                                    "default": "error",
                                    "description": "Severity for cross-scope reference diagnostics"
                                }
                            }
                        },
                        "validation": {
                            "type": "object",
                            "properties": {
                                "enableWorkspaceValidation": {
                                    "type": "boolean",
                                    "default": true,
                                    "description": "Enable workspace-wide validation"
                                },
                                "enableCrossScopeValidation": {
                                    "type": "boolean",
                                    "default": true,
                                    "description": "Enable cross-scope validation"
                                },
                                "enableDuplicateDetection": {
                                    "type": "boolean",
                                    "default": true,
                                    "description": "Enable duplicate component detection"
                                },
                                "enableReferenceValidation": {
                                    "type": "boolean",
                                    "default": true,
                                    "description": "Enable component reference validation"
                                }
                            }
                        }
                    }
                },
                "performance": {
                    "type": "object",
                    "properties": {
                        "maxFiles": {
                            "type": "number",
                            "default": 1000,
                            "minimum": 10,
                            "description": "Maximum number of files to process in workspace"
                        },
                        "chunkSize": {
                            "type": "number",
                            "default": 50,
                            "minimum": 5,
                            "description": "Number of files to process in each chunk"
                        },
                        "enableCaching": {
                            "type": "boolean",
                            "default": true,
                            "description": "Enable caching for better performance"
                        },
                        "optimizedParsing": {
                            "type": "boolean",
                            "default": true,
                            "description": "Use optimized parsing algorithms"
                        }
                    }
                },
                "symbols": {
                    "type": "object",
                    "properties": {
                        "enableFuzzySearch": {
                            "type": "boolean",
                            "default": true,
                            "description": "Enable fuzzy matching for symbol search"
                        },
                        "enableHierarchy": {
                            "type": "boolean",
                            "default": true,
                            "description": "Show component hierarchy in outline"
                        },
                        "maxSymbolResults": {
                            "type": "number",
                            "default": 150,
                            "minimum": 10,
                            "description": "Maximum number of symbol search results"
                        },
                        "enableRelationships": {
                            "type": "boolean",
                            "default": true,
                            "description": "Analyze component relationships"
                        }
                    }
                },
                "semanticTokens": {
                    "type": "object",
                    "properties": {
                        "enabled": {
                            "type": "boolean",
                            "default": true,
                            "description": "Enable semantic tokens (syntax highlighting)"
                        }
                    }
                }
            }
        }
    }
};