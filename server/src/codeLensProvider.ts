import {
  TextDocuments,
  CodeLens,
  CodeLensParams,
  Command,
  Range
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { BaseProvider } from "./baseProvider";
import { configManager } from "./configuration";
import * as utils from "./utils";

/**
 * Provides code lens functionality for Alloy components
 * Shows reference counts, quick actions, and validation status above component blocks
 */
export class CodeLensProvider extends BaseProvider {
  constructor(documents: TextDocuments<TextDocument>) {
    super(documents);
  }

  /**
   * Provide code lenses for the document
   */
  provideCodeLenses(
    params: CodeLensParams,
    workspaceFolders: string[] = []
  ): CodeLens[] {
    try {
      if (!params?.textDocument?.uri) {
        return [];
      }

      if (!configManager.isCodeLensEnabled()) {
        return [];
      }

      const document = this.documents.get(params.textDocument.uri);
      if (!document) {
        return [];
      }

    const codeLenses: CodeLens[] = [];
    const text = document.getText();
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (!line || line.startsWith('//')) {
        continue;
      }

      // Check for declare blocks
      if (line.startsWith('declare ')) {
        const match = line.match(/^declare\s+"([^"]+)"/);
        if (match) {
          const [, declareType] = match;
          const usagesCount = this.countDeclareUsages(declareType);
        const lens: CodeLens = {
          range: {
            start: { line: i, character: 0 },
            end: { line: i, character: lines[i].length }
          },
          command: {
            title: usagesCount > 0 ? 
              `🔧 ${usagesCount} usages` : 
              "🔧 Declare Block",
            command: 'alloy.showDeclareUsages',
            arguments: [declareType]
          }
        };
        codeLenses.push(lens);
        }
        continue;
      }

      // Check for components (prometheus, loki, otelcol, etc.)
      const componentMatch = line.match(/^((?:prometheus|loki|otelcol)\.\w+(?:\.\w+)*)\s+"([^"]+)"/);
      if (componentMatch) {
        const [, componentType, componentLabel] = componentMatch;
        const referencesCount = this.countSimpleReferences(componentType, componentLabel);
        
        let emoji = "🔧";
        let description = "Component";
        
        if (componentType.startsWith('prometheus.')) {
          emoji = "📊";
          description = "Prometheus";
        } else if (componentType.startsWith('loki.')) {
          emoji = "📝";
          description = "Loki";
        } else if (componentType.startsWith('otelcol.')) {
          emoji = "🔬";
          description = "OpenTelemetry";
        }

        const lens: CodeLens = {
          range: {
            start: { line: i, character: 0 },
            end: { line: i, character: lines[i].length }
          },
          command: {
            title: referencesCount > 0 ? 
              `${emoji} ${referencesCount} references` : 
              `${emoji} ${description} Component`,
            command: 'alloy.showComponentHelp',
            arguments: [componentType]
          }
        };
        codeLenses.push(lens);
      }
    }

      return codeLenses;
    } catch (error) {
      console.error(`[CodeLens] Error: ${error}`);
      return [];
    }
  }

  private countSimpleReferences(componentType: string, componentLabel: string): number {
    try {
      let count = 0;
      const referencePattern = new RegExp(`\\b${componentType.replace(/\./g, '\\.')}\\.${componentLabel}\\b`, 'g');

      for (const document of this.documents.all()) {
        try {
          const text = document.getText();
          const matches = text.match(referencePattern);
          if (matches) {
            count += matches.length;
          }
        } catch (docError) {
          // Skip this document
        }
      }
      return count;
    } catch (error) {
      return 0;
    }
  }

  private countDeclareUsages(declareType: string): number {
    try {
      let count = 0;
      const usagePattern = new RegExp(`\\b${declareType}\\.[a-zA-Z0-9_]+`, 'g');

      for (const document of this.documents.all()) {
        try {
          const text = document.getText();
          const matches = text.match(usagePattern);
          if (matches) {
            count += matches.length;
          }
        } catch (docError) {
          // Skip this document
        }
      }
      return count;
    } catch (error) {
      return 0;
    }
  }














}

/**
 * Main entry point for code lens requests
 */
export function provideCodeLenses(
  params: CodeLensParams,
  documents: TextDocuments<TextDocument>,
  workspaceFolders: string[] = []
): CodeLens[] {
  try {
    const provider = new CodeLensProvider(documents);
    return provider.provideCodeLenses(params, workspaceFolders);
  } catch (error) {
    console.error(`[CodeLens] Provider error: ${error}`);
    return [];
  }
}

/**
 * Resolve code lens (optional - used for performance optimization)
 */
export function resolveCodeLens(codeLens: CodeLens): CodeLens {
  // All data is resolved immediately in provideCodeLenses
  return codeLens;
}