import { TextDocuments, TextDocumentPositionParams } from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { DocumentUtils, ErrorHandler, ValidationUtils } from "./commonUtils";
import { workspaceComponentService } from "./workspaceComponentService";

/**
 * Context information extracted from document and position
 */
export interface ProviderContext {
  document: TextDocument;
  position: TextDocumentPositionParams['position'];
  wordInfo: { word: string; range: any } | null;
  lineText: string;
  lineIndex: number;
}

/**
 * Component data retrieval result
 */
export interface ComponentDataResult {
  allComponentData: Record<string, any>;
  success: boolean;
  fromCache: boolean;
}

/**
 * Base class for all language server providers
 * Centralizes common initialization, validation, and component data retrieval logic
 */
export abstract class BaseProvider {
  protected documents: TextDocuments<TextDocument>;

  constructor(documents: TextDocuments<TextDocument>) {
    this.documents = documents;
  }

  /**
   * Common context initialization used by all providers
   * Replaces the repeated document/position validation in each provider
   */
  protected initializeContext(params: TextDocumentPositionParams): ProviderContext | null {
    return ErrorHandler.safeExecute(() => {
      // Validate input parameters
      if (!ValidationUtils.validatePositionParams(params)) {
        return null;
      }

      const document = this.documents.get(params.textDocument.uri);
      if (!document) {
        return null;
      }

      // Validate position is within document bounds
      if (!DocumentUtils.isValidPosition(document, params.position)) {
        return null;
      }

      // Get word at position
      const wordInfo = DocumentUtils.getWordAtPosition(document, params.position);

      // Get line text for context
      const lineText = document.getText({
        start: { line: params.position.line, character: 0 },
        end: { line: params.position.line, character: Number.MAX_SAFE_INTEGER }
      });

      return {
        document,
        position: params.position,
        wordInfo,
        lineText,
        lineIndex: params.position.line
      };
    }, 'initializeContext', null);
  }

  /**
   * Centralized component data retrieval with fallback logic
   * Replaces the duplicated component data retrieval in each provider
   */
  protected async getComponentData(workspaceFolders: string[] = []): Promise<ComponentDataResult> {
    return ErrorHandler.safeExecuteAsync(async () => {
      try {
        // Try to get current workspace components
        const workspaceComponents = await workspaceComponentService.getAllWorkspaceComponents(this.documents, workspaceFolders);
        if (workspaceComponents && Object.keys(workspaceComponents).length > 0) {
          return {
            allComponentData: workspaceComponents,
            success: true,
            fromCache: false
          };
        }
       } catch (error) {
         // Silently handle workspace component loading errors
       }

      // Fallback to cached components
      try {
        const cachedComponents = this.loadCachedComponents();
        return {
          allComponentData: cachedComponents,
          success: true,
          fromCache: true
        };
       } catch (fallbackError) {
         return {
           allComponentData: {},
           success: false,
           fromCache: false
         };
       }
    }, 'getComponentData', {
      allComponentData: {},
      success: false,
      fromCache: false
    });
  }

  /**
   * Load cached component data as fallback
   */
  private loadCachedComponents(): Record<string, any> {
    const fs = require('fs');
    const path = require('path');
    
    // Try to load from components directory
    const componentsPath = path.join(__dirname, '..', '..', 'components');
    const allComponents: Record<string, any> = {};

    if (fs.existsSync(componentsPath)) {
      const files = fs.readdirSync(componentsPath);
      for (const file of files) {
        if (file.endsWith('.json') && file !== 'config_blocks_data.json') {
          try {
            const filePath = path.join(componentsPath, file);
            const componentData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            if (componentData.name) {
              allComponents[componentData.name] = componentData;
            }
           } catch (error) {
             // Silently handle component file loading errors
           }
        }
      }
    }

    return allComponents;
  }

  /**
   * Common error handling for provider methods
   */
  protected handleProviderError<T>(error: any, context: string, fallbackValue: T): T {
    return ErrorHandler.logError(`${this.constructor.name}.${context}`, error, fallbackValue);
  }

  /**
   * Check if a word at position is a valid component reference
   */
  protected isComponentReference(word: string, allComponentData: Record<string, any>): boolean {
    if (!word || !allComponentData) return false;

    const parts = word.split('.');
    if (parts.length < 2) return false;

    // Check for built-in component types
    for (let i = 0; i < parts.length - 1; i++) {
      const possibleType = parts.slice(0, i + 1).join('.');
      if (allComponentData[possibleType]) {
        return true;
      }
    }

    // Check for declared components
    if (parts.length >= 2 && allComponentData[parts[0]] && allComponentData[parts[0]].isDeclared) {
      return true;
    }

    return false;
  }

  /**
   * Parse component reference into its parts
   */
  protected parseComponentReference(reference: string, allComponentData: Record<string, any>): {
    componentType: string;
    componentLabel: string;
    property?: string;
    isValid: boolean;
  } | null {
    const parts = reference.split('.');
    if (parts.length < 2) return null;

    // Check for declared component: main.eu.export_name
    if (parts.length >= 2 && allComponentData[parts[0]] && allComponentData[parts[0]].isDeclared) {
      return {
        componentType: parts[0],
        componentLabel: parts[1],
        property: parts.length > 2 ? parts.slice(2).join('.') : undefined,
        isValid: true
      };
    }

    // Check for built-in component: component.type.label.property
    for (let i = 0; i < parts.length - 1; i++) {
      const possibleType = parts.slice(0, i + 1).join('.');
      if (allComponentData[possibleType]) {
        return {
          componentType: possibleType,
          componentLabel: parts[i + 1],
          property: parts.length > (i + 2) ? parts.slice(i + 2).join('.') : undefined,
          isValid: true
        };
      }
    }

    return {
      componentType: '',
      componentLabel: '',
      property: undefined,
      isValid: false
    };
  }

  /**
   * Get workspace folder path from document URI
   */
  protected getWorkspaceFolder(documentUri: string): string | null {
    return ErrorHandler.safeExecute(() => {
      if (documentUri.startsWith('file://')) {
        const filePath = documentUri.substring(7);
        const path = require('path');
        return path.dirname(filePath);
      }
      return null;
    }, 'getWorkspaceFolder', null);
  }

  /**
   * Check if line text contains a component declaration
   */
  protected isComponentDeclaration(lineText: string): boolean {
    const trimmed = lineText.trim();
    const componentDeclMatch = trimmed.match(/^[a-zA-Z_.][a-zA-Z0-9_.]*\s+"[^"]*"(\s*\{|\s*$)/);
    return !!componentDeclMatch;
  }

  /**
   * Check if position is inside quotes
   */
  protected isInsideQuotes(text: string, position: number): boolean {
    let quoteCount = 0;
    for (let i = 0; i < position; i++) {
      if (text[i] === '"' && (i === 0 || text[i - 1] !== '\\')) {
        quoteCount++;
      }
    }
    return quoteCount % 2 === 1;
  }

  /**
   * Check if position is inside a comment
   */
  protected isInsideComment(lineText: string, position: number): boolean {
    const beforePosition = lineText.substring(0, position);
    const commentStart = beforePosition.indexOf('//');
    return commentStart !== -1;
  }
}