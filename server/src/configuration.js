"use strict";
/**
 * Configuration management for the Alloy Language Server
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONFIGURATION_SCHEMA = exports.configManager = exports.ConfigurationManager = void 0;
const node_1 = require("vscode-languageserver/node");
/**
 * Configuration manager for the Language Server
 */
class ConfigurationManager {
    constructor() {
        this.connection = null;
        this.hasConfigurationCapability = false;
        this.currentConfig = this.getDefaultConfiguration();
    }
    /**
     * Initialize configuration management
     */
    async initialize(connection, hasConfigurationCapability) {
        this.connection = connection;
        this.hasConfigurationCapability = hasConfigurationCapability;
        if (hasConfigurationCapability) {
            // Register for configuration changes
            connection.client.register(node_1.DidChangeConfigurationNotification.type, undefined);
            // Load initial configuration
            await this.updateConfiguration();
            // Listen for configuration changes
            connection.onDidChangeConfiguration(async (change) => {
                if (this.hasConfigurationCapability) {
                    // Update configuration
                    await this.updateConfiguration();
                }
                else {
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
    getConfiguration() {
        return { ...this.currentConfig };
    }
    /**
     * Get configuration section
     */
    getDiagnosticsConfig() {
        return { ...this.currentConfig.diagnostics };
    }
    getPerformanceConfig() {
        return { ...this.currentConfig.performance };
    }
    getSymbolsConfig() {
        return { ...this.currentConfig.symbols };
    }
    getCompletionConfig() {
        return { ...this.currentConfig.completion };
    }
    /**
     * Update configuration from client
     */
    async updateConfiguration() {
        if (!this.connection || !this.hasConfigurationCapability) {
            return;
        }
        try {
            const result = await this.connection.workspace.getConfiguration('alloyLsp');
            this.connection.console.log(`Received configuration from client: ${JSON.stringify(result, null, 2)}`);
            this.currentConfig = { ...this.getDefaultConfiguration(), ...result };
            this.connection.console.log(`Final merged configuration: ${JSON.stringify(this.currentConfig, null, 2)}`);
        }
        catch (error) {
            this.connection?.console.warn(`Failed to fetch configuration: ${error}`);
        }
    }
    /**
     * Get default configuration
     */
    getDefaultConfiguration() {
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
    logConfiguration() {
        if (!this.connection)
            return;
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
    isDiagnosticEnabled(type) {
        return this.currentConfig.diagnostics.enabled &&
            this.currentConfig.diagnostics.severity[type] !== 'off';
    }
    /**
     * Get diagnostic severity level
     */
    getDiagnosticSeverity(type) {
        return this.currentConfig.diagnostics.severity[type];
    }
    /**
     * Check if validation type is enabled
     */
    isValidationEnabled(type) {
        return this.currentConfig.diagnostics.enabled &&
            this.currentConfig.diagnostics.validation[type];
    }
    /**
     * Check if a file should be included in diagnostics based on patterns
     */
    shouldIncludeFile(filePath) {
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
    getDiagnosticsLimits() {
        return {
            perFile: this.currentConfig.diagnostics.filtering.maxDiagnosticsPerFile,
            total: this.currentConfig.diagnostics.filtering.maxDiagnosticsTotal
        };
    }
    /**
     * Get throttle settings
     */
    getThrottleSettings() {
        return { ...this.currentConfig.diagnostics.throttle };
    }
    /**
     * Simple glob pattern matching (basic implementation)
     */
    matchesPattern(filePath, pattern) {
        // Convert glob pattern to regex
        const regexPattern = pattern
            .replace(/\*\*/g, '.*') // ** matches any number of path segments
            .replace(/\*/g, '[^/]*') // * matches any characters except /
            .replace(/\?/g, '[^/]'); // ? matches any single character except /
        const regex = new RegExp(`^${regexPattern}$`);
        return regex.test(filePath);
    }
    /**
     * Check if semantic tokens are enabled
     */
    isSemanticTokensEnabled() {
        return this.currentConfig.semanticTokens.enabled;
    }
    /**
     * Check if code lens is enabled
     */
    isCodeLensEnabled() {
        return this.currentConfig.codeLens.enabled;
    }
    /**
     * Get code lens configuration
     */
    getCodeLensConfig() {
        return this.currentConfig.codeLens;
    }
}
exports.ConfigurationManager = ConfigurationManager;
// Global configuration manager instance
exports.configManager = new ConfigurationManager();
/**
 * Configuration schema for VS Code settings
 */
exports.CONFIGURATION_SCHEMA = {
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
