import {
  TextDocuments,
  TextDocument,
  Connection,
  Range
} from "vscode-languageserver/node";
import * as utils from "./utils";
import * as path from 'path';
import { getPerformanceManager } from "./performance";
import type { ComponentLabelMap } from "./utils";

// Re-export the ComponentLabelMap from utils for consistency
export type { ComponentLabelMap };

/**
 * Workspace component scanning service
 * Centralizes the logic for discovering components across all workspace files
 */
export class WorkspaceComponentService {
  private connection?: Connection;
  private cachedComponents: Record<string, any> | null = null;
  private cacheTimestamp = 0;
  private readonly CACHE_DURATION = 30000; // 30 seconds

  constructor(connection?: Connection) {
    this.connection = connection;
  }

  /**
   * Get all workspace documents (opened + workspace files)
   * Prioritizes opened documents to include unsaved changes
   * When no workspace folders are configured, scans directory of opened files
   */
  async getAllWorkspaceDocuments(
    documents: TextDocuments<TextDocument>,
    workspaceFolders: string[]
  ): Promise<TextDocument[]> {
    const performanceManager = getPerformanceManager(this.connection);

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
      const alloyFiles = await performanceManager.lazyLoadWorkspaceFiles(
        foldersToScan,
        [] // No priority files
      );

      // Create TextDocument objects for workspace files not already opened
      const workspaceDocuments: TextDocument[] = [];

      for (const filePath of alloyFiles) {
        const uri = `file://${filePath}`;

        // Skip if already opened - we want to use the opened document with unsaved changes
        if (documents.get(uri)) {
          continue;
        }

        try {
          const { content } = await performanceManager.getCachedFileContent(filePath);
          const document = TextDocument.create(uri, 'alloy', 1, content);
          workspaceDocuments.push(document);
        } catch (error) {
          console.warn(`Error reading workspace file ${filePath}: ${error}`);
        }
      }

      // Return opened documents first (with unsaved changes), then workspace documents from cache
      return [...openedDocs, ...workspaceDocuments];
    } catch (error) {
      console.warn(`Error getting workspace documents: ${error}`);
      return openedDocs; // Fallback to opened documents only
    }
  }

  /**
   * Create a workspace-wide component label map from all documents
   */
  createWorkspaceComponentLabelMap(allDocuments: TextDocument[]): ComponentLabelMap {
    const workspaceComponentLabelMap: ComponentLabelMap = {};

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
  async getWorkspaceDiagnosticsData(
    documents: TextDocuments<TextDocument>,
    workspaceFolders: string[]
  ): Promise<{
    allDocuments: TextDocument[];
    componentLabelMap: ComponentLabelMap;
  }> {
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
  async getAllWorkspaceComponents(
    documents: TextDocuments<TextDocument>,
    workspaceFolders: string[]
  ): Promise<Record<string, any>> {
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
            const builtinData: any = builtinComponents[componentType];
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
            } else {
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
          } else {
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
    } catch (error) {
      console.warn('Error scanning workspace for components:', error);
      // Fallback to opened documents only
      return utils.getAllAvailableComponents(undefined, documents);
    }
  }

  /**
   * Get cached workspace components (synchronous)
   * Returns cached results if available and not expired, otherwise falls back to opened documents
   */
  getCachedWorkspaceComponents(
    documents: TextDocuments<TextDocument>
  ): Record<string, any> {
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
  clearCache(): void {
    this.cachedComponents = null;
    this.cacheTimestamp = 0;
  }
}

// Export singleton instance
export const workspaceComponentService = new WorkspaceComponentService();