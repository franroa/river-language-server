import {
  TextDocuments,
  Location,
  LocationLink,
  Definition,
  TypeDefinitionParams
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { BaseProvider } from "./baseProvider";

/**
 * Provides type definition functionality for Alloy components
 * Different from regular definition - this navigates to the type definition rather than usage
 */
export class TypeDefinitionProvider extends BaseProvider {
  constructor(documents: TextDocuments<TextDocument>) {
    super(documents);
  }

  /**
   * Provide type definition for symbol at position
   */
  async provideTypeDefinition(
    params: TypeDefinitionParams,
    workspaceFolders: string[] = []
  ): Promise<Definition | LocationLink[] | null> {
    return this.handleProviderError(
      await this.getTypeDefinitionImpl(params, workspaceFolders),
      'provideTypeDefinition',
      null
    );
  }

  private async getTypeDefinitionImpl(
    params: TypeDefinitionParams,
    workspaceFolders: string[]
  ): Promise<Definition | LocationLink[] | null> {
    const context = this.initializeContext(params);
    if (!context) return null;

    const { wordInfo } = context;

    if (!wordInfo || !wordInfo.word) return null;

    // Get component data
    const componentDataResult = await this.getComponentData(workspaceFolders);
    if (!componentDataResult.success) return null;

    const { allComponentData } = componentDataResult;

    // Check if this is a component reference
    if (!this.isComponentReference(wordInfo.word, allComponentData)) {
      return null;
    }

    const parsed = this.parseComponentReference(wordInfo.word, allComponentData);
    if (!parsed || !parsed.isValid) return null;

    // For type definition, we want to navigate to the component type definition
    // rather than a specific instance
    return this.findTypeDefinition(parsed.componentType, allComponentData, workspaceFolders);
  }

  private async findTypeDefinition(
    componentType: string,
    allComponentData: Record<string, any>,
    workspaceFolders: string[]
  ): Promise<Definition | LocationLink[] | null> {
    const componentInfo = allComponentData[componentType];
    if (!componentInfo) return null;

    // If it's a declared component, find the declare block
    if (componentInfo.isDeclared) {
      return this.findDeclareBlockDefinition(componentType, workspaceFolders);
    }

    // For built-in components, try to find documentation or schema files
    return this.findBuiltInTypeDefinition(componentType, componentInfo);
  }

  private async findDeclareBlockDefinition(
    componentType: string,
    workspaceFolders: string[]
  ): Promise<Definition | LocationLink[] | null> {
    const locations: Location[] = [];

    // Search all documents for declare blocks of this type
    for (const document of this.documents.all()) {
      const text = document.getText();
      const lines = text.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Look for declare blocks: declare "componentType" {
        const declareMatch = trimmed.match(/^declare\s+"([^"]+)"\s*\{/);
        if (declareMatch && declareMatch[1] === componentType) {
          const startPos = line.indexOf('declare');
          const endPos = line.indexOf(declareMatch[1]) + declareMatch[1].length;

          locations.push({
            uri: document.uri,
            range: {
              start: { line: i, character: startPos },
              end: { line: i, character: endPos }
            }
          });
        }
      }
    }

    // Also search workspace files if not found in open documents
    if (locations.length === 0 && workspaceFolders.length > 0) {
      const fs = require('fs');
      const path = require('path');
      const glob = require('glob');

      for (const workspaceFolder of workspaceFolders) {
        try {
          const alloyFiles = glob.sync('**/*.alloy', { cwd: workspaceFolder });
          
          for (const file of alloyFiles) {
            const filePath = path.join(workspaceFolder, file);
            const uri = `file://${filePath}`;
            
            // Skip if already processed
            if (this.documents.get(uri)) continue;

            try {
              const content = fs.readFileSync(filePath, 'utf-8');
              const lines = content.split('\n');

              for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const trimmed = line.trim();

                const declareMatch = trimmed.match(/^declare\s+"([^"]+)"\s*\{/);
                if (declareMatch && declareMatch[1] === componentType) {
                  const startPos = line.indexOf('declare');
                  const endPos = line.indexOf(declareMatch[1]) + declareMatch[1].length;

                  locations.push({
                    uri,
                    range: {
                      start: { line: i, character: startPos },
                      end: { line: i, character: endPos }
                    }
                  });
                }
              }
            } catch (error) {
              console.warn(`Error reading file ${filePath}: ${error}`);
            }
          }
        } catch (error) {
          console.warn(`Error searching workspace folder ${workspaceFolder}: ${error}`);
        }
      }
    }

    return locations.length > 0 ? locations : null;
  }

  private async findBuiltInTypeDefinition(
    componentType: string,
    componentInfo: any
  ): Promise<Definition | LocationLink[] | null> {
    // For built-in components, we can provide a virtual type definition
    // This could point to documentation, schema files, or component definition files

    const locations: LocationLink[] = [];

    // Try to find component definition files in the components directory
    const fs = require('fs');
    const path = require('path');
    
    const componentsPath = path.join(__dirname, '..', '..', 'components');
    if (fs.existsSync(componentsPath)) {
      const componentFile = path.join(componentsPath, `${componentType}.json`);
      if (fs.existsSync(componentFile)) {
        const uri = `file://${componentFile}`;
        
        locations.push({
          targetUri: uri,
          targetRange: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 }
          },
          targetSelectionRange: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 }
          }
        });
      }
    }

    // If we have documentation URL, could create a virtual document
    if (componentInfo.documentation) {
      // For now, just return the existing locations
      // In the future, we could create virtual documents for external docs
    }

    return locations.length > 0 ? locations : null;
  }
}

/**
 * Main entry point for type definition requests
 */
export async function provideTypeDefinition(
  params: TypeDefinitionParams,
  documents: TextDocuments<TextDocument>,
  workspaceFolders: string[] = []
): Promise<Definition | LocationLink[] | null> {
  const provider = new TypeDefinitionProvider(documents);
  return provider.provideTypeDefinition(params, workspaceFolders);
}