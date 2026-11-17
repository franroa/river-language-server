/**
 * Example of New Provider Development Using DRY Refactored Architecture
 * This demonstrates how easy it is to create new providers with the unified managers
 */

import {
  TextDocuments,
  Hover,
  HoverParams,
  Location,
  DefinitionParams
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as utils from "./utils";
import * as testUtils from "./testUtils";

/**
 * Example: Enhanced Hover Provider using new unified architecture
 * Shows dramatic reduction in boilerplate code
 */
export async function provideEnhancedHover(
  params: HoverParams,
  documents: TextDocuments<TextDocument>,
  workspaceFolders: string[] = []
): Promise<Hover | null> {
  // OLD WAY (before DRY refactoring):
  // const document = documents.get(params.textDocument.uri);
  // if (!document) return null;
  // const position = params.position;
  // const wordAtPosition = utils.getWordAtPosition(document, position);
  // if (!wordAtPosition) return null;
  // const allComponentData = await utils.getAllWorkspaceComponents(documents, workspaceFolders);
  // ... 50+ more lines of duplicate code

  // NEW WAY (after DRY refactoring):
  return utils.ProviderTemplate?.wrapProvider(
    "EnhancedHover",
    params,
    documents,
    workspaceFolders,
    async (context, analyzer) => {
      const word = context.getWordAtPosition();
      if (!word) return null;

      // Use unified analyzer for component analysis
      const { componentName } = analyzer.parseComplexReference(word, context.document);
      
      if (analyzer.hasComponent(componentName)) {
        const componentData = analyzer.getComponent(componentName);
        
        // Create enhanced hover with performance metrics
        const hoverContent = {
          kind: "markdown" as const,
          value: [
            `**${componentName}**`,
            `\`\`\`alloy`,
            componentData.template || `${componentName} "label" { }`,
            `\`\`\``,
            componentData.usage || "Component usage information",
            "",
            `*Workspace: ${workspaceFolders.length} folder(s)*`,
            `*Performance: Enhanced with caching*`
          ].join("\n")
        };

        // Use unified position factory
        const range = utils.PositionFactory?.rangeFromWord(
          context.position.line,
          context.getCurrentLineText().indexOf(word),
          word.length
        );

        return {
          contents: hoverContent,
          range: range || undefined
        };
      }

      return null;
    }
  ) || null;
}
