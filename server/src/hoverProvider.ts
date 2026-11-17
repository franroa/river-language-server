import {
  Hover,
  HoverParams,
  MarkupContent,
  MarkupKind,
  TextDocuments,
  Range,
  Position,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as utils from "./utils";

// Word detection is now handled by unified utils.getWordAtPosition

/**
 * Get hover information for a component
 */
function getComponentHoverInfo(componentName: string, allComponentData: any): MarkupContent | null {
  const componentData = allComponentData[componentName];

  if (!componentData) {
    return null;
  }

  let content = `**${componentName}**\n\n`;

  if (componentData.usage) {
    content += `**Usage:**\n\`\`\`alloy\n${componentData.usage}\n\`\`\`\n\n`;
  }



  // Add arguments information
  if (componentData.lsp_structure && componentData.lsp_structure.arguments) {
    const args = Object.entries(componentData.lsp_structure.arguments);
    if (args.length > 0) {
      content += `**Arguments:**\n`;
      for (const [argName, argInfo] of args) {
        const arg = argInfo as any;
        content += `- \`${argName}\`: ${arg.description || 'No description'}\n`;
        if (arg.type) {
          content += `  - Type: \`${arg.type}\`\n`;
        }
        if (arg.required !== undefined) {
          content += `  - Required: ${arg.required ? 'Yes' : 'No'}\n`;
        }
        if (arg.default && arg.default !== '') {
          content += `  - Default: \`${arg.default}\`\n`;
        }
        content += '\n';
      }
    }
  }

  // Add blocks information
  if (componentData.lsp_structure && componentData.lsp_structure.blocks) {
    const blocks = Object.entries(componentData.lsp_structure.blocks);
    if (blocks.length > 0) {
      content += `**Blocks:**\n`;
      for (const [blockName, blockInfo] of blocks) {
        const block = blockInfo as any;
        content += `- \`${blockName}\`: ${block.description || 'No description'}\n`;
        if (block.required !== undefined) {
          content += `  - Required: ${block.required ? 'Yes' : 'No'}\n`;
        }
      }
      content += '\n';
    }
  }

  return {
    kind: MarkupKind.Markdown,
    value: content.trim()
  };
}

/**
 * Get hover information for a declared argument
 */
function getArgumentHoverInfo(argumentName: string, document: TextDocument): MarkupContent | null {
  const configBlocks = utils.parseConfigBlocks(document);

  for (const configBlock of configBlocks) {
    if (configBlock.type === 'declare' && configBlock.blocks) {
      for (const block of configBlock.blocks) {
        if (block.name === 'argument' && block.label === argumentName) {
          let content = `**Argument: ${argumentName}**\n\n`;

          // Add comment if available
          if (block.args && block.args.comment) {
            content += `*${block.args.comment.value}*\n\n`;
          }

          // Add optional information
          if (block.args && block.args.optional) {
            const isOptional = block.args.optional.value.toLowerCase() === 'true';
            content += `**Optional:** ${isOptional ? 'Yes' : 'No'}\n\n`;
          }

          // Add default value if available
          if (block.args && block.args.default) {
            content += `**Default:** \`${block.args.default.value}\`\n\n`;
          }

          return {
            kind: MarkupKind.Markdown,
            value: content.trim()
          };
        }
      }
    }
  }

  return null;
}

/**
 * Get hover information for a declared component
 */
function getDeclaredComponentHoverInfo(componentName: string, document: TextDocument): MarkupContent | null {
  const declaredComponents = utils.getDeclaredComponents(document);
  const componentData = declaredComponents[componentName];

  if (!componentData) {
    return null;
  }

  let content = `**Declared Component: ${componentName}**\n\n`;
  content += `*Custom component declared in this document*\n\n`;

  // Add arguments information
  const declareStructure = utils.extractDeclareStructure(componentData);
  if (declareStructure.arguments && Object.keys(declareStructure.arguments).length > 0) {
    content += `**Arguments:**\n`;
    for (const [argName, argInfo] of Object.entries(declareStructure.arguments)) {
      const arg = argInfo as any;
      content += `- \`${argName}\`: ${arg.description || 'No description'}\n`;
      if (arg.required !== undefined) {
        content += `  - Required: ${arg.required}\n`;
      }
    }
    content += '\n';
  }

  // Add blocks information
  if (declareStructure.blocks && Object.keys(declareStructure.blocks).length > 0) {
    content += `**Blocks:**\n`;
    for (const blockName of Object.keys(declareStructure.blocks)) {
      content += `- \`${blockName}\`\n`;
    }
    content += '\n';
  }

  return {
    kind: MarkupKind.Markdown,
    value: content.trim()
  };
}

/**
 * Get the range for the hover (the word under cursor)
 */
// Range calculation is now handled by unified utils.findWordRange

export function provideHover(
  params: HoverParams,
  documents: TextDocuments<TextDocument>
): Hover | null {
  // Use unified context manager for common initialization
  const context = utils.ProviderContext.create(params, documents);
  if (!context) {
    return null;
  }

  const wordAtPosition = context.getWordAtPosition();
  if (!wordAtPosition) {
    return null;
  }

  // Get all available components including declared ones
  // Use direct component parser loading to ensure components are always available
  const allComponentData = utils.getAllComponentData();

  // Parse complex references like "otelcol.processor.transform.default.input"
  let componentName = wordAtPosition;

  if (wordAtPosition.includes('.')) {
    const parts = wordAtPosition.split('.');
    if (parts.length >= 2) {
      // For component names like "prometheus.scrape", keep the full name
      componentName = wordAtPosition;

      // Try to find the longest matching component name
      for (let i = parts.length; i >= 1; i--) {
        const potentialComponent = parts.slice(0, i).join('.');
        if (allComponentData[potentialComponent] || utils.isDeclaredComponent(context.document, potentialComponent)) {
          componentName = potentialComponent;
          break;
        }
      }
    }
  }

  let hoverContent: MarkupContent | null = null;
  let hoverRange: Range | null = null;

  // Check if this is a declared argument
  if (utils.isDeclaredArgument(context.document, wordAtPosition)) {
    hoverContent = getArgumentHoverInfo(wordAtPosition, context.document);
    const wordRange = utils.findWordRange(context.document, context.position, wordAtPosition);
    hoverRange = Range.create(
      Position.create(wordRange.start.line, wordRange.start.character),
      Position.create(wordRange.end.line, wordRange.end.character)
    );
  }
  // Check if this is a declared component
  else if (utils.isDeclaredComponent(context.document, componentName)) {
    hoverContent = getDeclaredComponentHoverInfo(componentName, context.document);
    const wordRange = utils.findWordRange(context.document, context.position, componentName);
    hoverRange = Range.create(
      Position.create(wordRange.start.line, wordRange.start.character),
      Position.create(wordRange.end.line, wordRange.end.character)
    );
  }
  // Check if this is a regular component
  else {
    const componentHoverInfo = getComponentHoverInfo(componentName, allComponentData);
    if (componentHoverInfo) {
      hoverContent = componentHoverInfo;
      const wordRange = utils.findWordRange(context.document, context.position, wordAtPosition);
      hoverRange = Range.create(
        Position.create(wordRange.start.line, wordRange.start.character),
        Position.create(wordRange.end.line, wordRange.end.character)
      );
    }
  }

  if (hoverContent) {
    const result: Hover = {
      contents: hoverContent
    };
    if (hoverRange) {
      result.range = hoverRange;
    }
    return result;
  }

  return null;
}