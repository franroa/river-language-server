import {
  CodeAction,
  CodeActionKind,
  CodeActionParams,
  Diagnostic,
  TextEdit,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { TextDocuments } from "vscode-languageserver/node";
import { allBlockProperties, allBlockCompletions } from "./componentData";
import { getBlockContent } from "./utils";

export function provideCodeActions(
  params: CodeActionParams,
  documents: TextDocuments<TextDocument>,
): CodeAction[] {
  const { textDocument, context } = params;
  const document = documents.get(textDocument.uri);
  
  if (!document) {
    return [];
  }

  const codeActions: CodeAction[] = [];
  
  // Filter diagnostics to only those we can handle
  const missingAttributeDiagnostics = context.diagnostics.filter(
    (diagnostic) => 
      diagnostic.source === "Alloy Linter" && 
      diagnostic.code === "missing-required-attribute"
  );

  const missingBlockDiagnostics = context.diagnostics.filter(
    (diagnostic) => 
      diagnostic.source === "Alloy Linter" && 
      diagnostic.code === "missing-required-block"
  );

  const missingMapCommaDiagnostics = context.diagnostics.filter(
    (diagnostic) => 
      diagnostic.source === "Alloy Linter" && 
      (diagnostic.code === "missing-map-comma" || diagnostic.code === "missing-map-property-comma")
  );

  const unknownBlockDiagnostics = context.diagnostics.filter(
    (diagnostic) => 
      diagnostic.source === "Alloy Linter" && 
      diagnostic.code === "unknown-block"
  );

  const duplicateBlockDiagnostics = context.diagnostics.filter(
    (diagnostic) => 
      diagnostic.source === "Alloy Linter" && 
      (diagnostic.code === "duplicate-component-block" || 
       diagnostic.code === "folder-duplicate-component-block" ||
       diagnostic.code === "workspace-duplicate-component-block")
  );

  // Group diagnostics by component type to handle multiple missing items together
  const diagnosticsByComponent = new Map<string, { attributes: Diagnostic[], blocks: Diagnostic[] }>();

  // Group missing attribute diagnostics
  for (const diagnostic of missingAttributeDiagnostics) {
    const componentType = extractComponentTypeFromDiagnostic(diagnostic);
    if (componentType) {
      if (!diagnosticsByComponent.has(componentType)) {
        diagnosticsByComponent.set(componentType, { attributes: [], blocks: [] });
      }
      diagnosticsByComponent.get(componentType)!.attributes.push(diagnostic);
    }
  }

  // Group missing block diagnostics
  for (const diagnostic of missingBlockDiagnostics) {
    const componentType = extractComponentTypeFromDiagnostic(diagnostic);
    if (componentType) {
      if (!diagnosticsByComponent.has(componentType)) {
        diagnosticsByComponent.set(componentType, { attributes: [], blocks: [] });
      }
      diagnosticsByComponent.get(componentType)!.blocks.push(diagnostic);
    }
  }

  // Create comprehensive code actions for each component
  for (const [componentType, groupedDiagnostics] of diagnosticsByComponent) {
    const { attributes, blocks } = groupedDiagnostics;

    // If component has both missing attributes and blocks, create a combined action
    if (attributes.length > 0 && blocks.length > 0) {
      const combinedAction = createAddAllMissingItemsAction(document, attributes, blocks, componentType);
      if (combinedAction) {
        codeActions.push(combinedAction);
        continue; // Skip individual actions for this component
      }
    }

    // Create individual actions for attributes
    if (attributes.length > 1) {
      const bulkAttributeAction = createAddAllMissingAttributesAction(document, attributes, componentType);
      if (bulkAttributeAction) {
        codeActions.push(bulkAttributeAction);
      }
    } else {
      for (const diagnostic of attributes) {
        const action = createAddMissingAttributeAction(document, diagnostic);
        if (action) {
          codeActions.push(action);
        }
      }
    }

    // Create individual actions for blocks
    for (const diagnostic of blocks) {
      const action = createAddMissingBlockAction(document, diagnostic);
      if (action) {
        codeActions.push(action);
      }
    }
  }

  // Add code actions for missing map commas
  for (const diagnostic of missingMapCommaDiagnostics) {
    const action = createAddMapCommaAction(document, diagnostic);
    if (action) {
      codeActions.push(action);
    }
  }

  // Add code actions for unknown blocks
  for (const diagnostic of unknownBlockDiagnostics) {
    const action = createRemoveUnknownBlockAction(document, diagnostic);
    if (action) {
      codeActions.push(action);
    }
  }

  // Add code actions for duplicate blocks
  for (const diagnostic of duplicateBlockDiagnostics) {
    // Add remove action
    const removeAction = createRemoveDuplicateBlockAction(document, diagnostic);
    if (removeAction) {
      codeActions.push(removeAction);
    }

    // Add rename action
    const renameAction = createRenameDuplicateBlockAction(document, diagnostic);
    if (renameAction) {
      codeActions.push(renameAction);
    }
  }

  return codeActions;
}

function extractComponentTypeFromDiagnostic(diagnostic: Diagnostic): string | null {
  // Try to extract from message first
  const messageMatch = diagnostic.message.match(/bloque "([^"]+)"/);
  if (messageMatch) {
    return messageMatch[1];
  }

  // Try to extract from data
  const data = diagnostic.data as any;
  if (data?.componentType) {
    return data.componentType;
  }

  return null;
}

function createAddAllMissingItemsAction(
  document: TextDocument,
  attributeDiagnostics: Diagnostic[],
  blockDiagnostics: Diagnostic[],
  componentType: string
): CodeAction | null {
  if (attributeDiagnostics.length === 0 && blockDiagnostics.length === 0) {
    return null;
  }

  const text = document.getText();
  const firstDiagnostic = attributeDiagnostics[0] || blockDiagnostics[0];
  const blockStartPos = document.offsetAt(firstDiagnostic.range.start);

  const openBraceIndex = text.indexOf("{", blockStartPos);
  if (openBraceIndex === -1) {
    return null;
  }

  const blockResult = getBlockContent(text, openBraceIndex + 1);
  if (!blockResult) {
    return null;
  }

  const insertPosition = document.positionAt(blockResult.endIndex);

  // Extract missing attributes
  const missingAttributes = attributeDiagnostics.map(d => {
    const match = d.message.match(/atributo requerido "([^"]+)"/);
    return match ? match[1] : null;
  }).filter(attr => attr !== null) as string[];

  // Extract missing blocks
  const missingBlocks = blockDiagnostics.map(d => {
    const data = d.data as any;
    return data?.missingBlock || null;
  }).filter(block => block !== null) as string[];

  // Generate all snippets
  const snippets: string[] = [];

  // Add attributes first
  for (const attr of missingAttributes) {
    const snippet = generateAttributeSnippet(attr, componentType);
    if (snippet) {
      snippets.push(`  ${snippet}`);
    }
  }

  // Add blocks after attributes
  for (const block of missingBlocks) {
    const snippet = generateBlockSnippet(block, componentType);
    if (snippet) {
      snippets.push(`  ${snippet}`);
    }
  }

  if (snippets.length === 0) {
    return null;
  }

  const newText = '\n' + snippets.join('\n');

  const edit: TextEdit = {
    range: {
      start: insertPosition,
      end: insertPosition,
    },
    newText,
  };

  const allDiagnostics = [...attributeDiagnostics, ...blockDiagnostics];
  const action: CodeAction = {
    title: `Add all missing required items (${missingAttributes.length} attributes, ${missingBlocks.length} blocks)`,
    kind: CodeActionKind.QuickFix,
    diagnostics: allDiagnostics,
    edit: {
      changes: {
        [document.uri]: [edit],
      },
    },
  };

  return action;
}

function createAddMissingAttributeAction(
  document: TextDocument,
  diagnostic: Diagnostic
): CodeAction | null {
  // Parse the diagnostic message to extract component type and missing attribute
  const message = diagnostic.message;
  const componentTypeMatch = message.match(/bloque "([^"]+)"/);
  const missingAttrMatch = message.match(/atributo requerido "([^"]+)"/);
  
  if (!componentTypeMatch || !missingAttrMatch) {
    return null;
  }

  const componentType = componentTypeMatch[1];
  const missingAttribute = missingAttrMatch[1];

  // Find the block's closing position to insert the missing attribute
  const text = document.getText();
  const blockStartPos = document.offsetAt(diagnostic.range.start);
  
  // Find the opening brace of this block
  const blockHeaderMatch = text.substring(0, blockStartPos + 200).match(
    new RegExp(`${componentType.replace('.', '\\.')}(?:\\s+"[^"]*")?\\s*\\{`)
  );
  
  if (!blockHeaderMatch) {
    return null;
  }

  const openBraceIndex = text.indexOf("{", blockStartPos);
  if (openBraceIndex === -1) {
    return null;
  }

  // Get block content to determine insertion point
  const blockResult = getBlockContent(text, openBraceIndex + 1);
  if (!blockResult) {
    return null;
  }

  // Calculate insertion position (end of block content, before closing brace)
  const insertPosition = document.positionAt(blockResult.endIndex);
  
  // Generate appropriate snippet for the missing attribute
  const attributeSnippet = generateAttributeSnippet(missingAttribute, componentType);
  
  // Create the text edit
  const edit: TextEdit = {
    range: {
      start: insertPosition,
      end: insertPosition,
    },
    newText: `\n  ${attributeSnippet}`,
  };

  // Create the code action
  const action: CodeAction = {
    title: `Add missing "${missingAttribute}" attribute`,
    kind: CodeActionKind.QuickFix,
    diagnostics: [diagnostic],
    edit: {
      changes: {
        [document.uri]: [edit],
      },
    },
  };

  return action;
}

function generateAttributeSnippet(attribute: string, componentType: string): string {
  // Get block properties for this component type to determine the appropriate snippet
  const blockProps = allBlockProperties[componentType] || [];

  // Find the property definition for this attribute
  const propDefinition = blockProps.find(prop => prop.label === attribute);

  if (propDefinition && propDefinition.insertText) {
    // Clean up snippet placeholders for code actions - replace with actual values
    let snippet = propDefinition.insertText;

    // Replace ${1:/* values */} placeholders with appropriate default values for code actions
    snippet = snippet.replace(/\$\{\d+:\/\* values \*\/\}/g, ''); // Empty array for forward_to
    snippet = snippet.replace(/\$\{\d+:([^}]*)\}/g, '$1'); // Keep other placeholder content

    // Remove any remaining ${...} placeholders
    snippet = snippet.replace(/\$\{\d+\}/g, '');

    return snippet;
  }

  // Generate a basic snippet based on common patterns
  switch (attribute) {
    case "targets":
      return 'targets = []';
    case "endpoint":
    case "url":
      return `${attribute} = ""`;
    case "username":
    case "password":
      return `${attribute} = ""`;
    case "metric":
      return `${attribute} {\n  }\n`;
    default:
      // Default to string value for unknown attributes
      return `${attribute} = ""`;
  }
}

export function createAddAllMissingAttributesAction(
  document: TextDocument,
  diagnostics: Diagnostic[],
  componentType: string
): CodeAction | null {
  const missingAttributes = diagnostics
    .filter(d => d.message.includes(`bloque "${componentType}"`))
    .map(d => {
      const match = d.message.match(/atributo requerido "([^"]+)"/);
      return match ? match[1] : null;
    })
    .filter(attr => attr !== null) as string[];

  if (missingAttributes.length <= 1) {
    return null;
  }

  const text = document.getText();
  const firstDiagnostic = diagnostics[0];
  const blockStartPos = document.offsetAt(firstDiagnostic.range.start);
  
  const openBraceIndex = text.indexOf("{", blockStartPos);
  if (openBraceIndex === -1) {
    return null;
  }

  const blockResult = getBlockContent(text, openBraceIndex + 1);
  if (!blockResult) {
    return null;
  }

  const insertPosition = document.positionAt(blockResult.endIndex);
  
  // Generate snippets for all missing attributes
  const attributeSnippets = missingAttributes.map(attr => 
    `  ${generateAttributeSnippet(attr, componentType)}`
  ).join('\n');

  const edit: TextEdit = {
    range: {
      start: insertPosition,
      end: insertPosition,
    },
    newText: `\n${attributeSnippets}`,
  };

  const action: CodeAction = {
    title: `Add all missing required attributes (${missingAttributes.length})`,
    kind: CodeActionKind.QuickFix,
    diagnostics: diagnostics,
    edit: {
      changes: {
        [document.uri]: [edit],
      },
    },
  };

  return action;
}

function createAddMissingBlockAction(
  document: TextDocument,
  diagnostic: Diagnostic
): CodeAction | null {
  // Extract component type and missing block from diagnostic data
  const data = diagnostic.data as any;
  const componentType = data?.componentType;
  const missingBlock = data?.missingBlock;
  
  if (!componentType || !missingBlock) {
    return null;
  }

  // Find the block's closing position to insert the missing block
  const text = document.getText();
  const blockStartPos = document.offsetAt(diagnostic.range.start);
  
  // Find the opening brace of this block
  const blockHeaderMatch = text.substring(0, blockStartPos + 200).match(
    new RegExp(`${componentType.replace('.', '\\.')}(?:\\s+"[^"]*")?\\s*\\{`)
  );
  
  if (!blockHeaderMatch) {
    return null;
  }

  const openBraceIndex = text.indexOf("{", blockStartPos);
  if (openBraceIndex === -1) {
    return null;
  }

  // Get block content to determine insertion point
  const blockResult = getBlockContent(text, openBraceIndex + 1);
  if (!blockResult) {
    return null;
  }

  // Calculate insertion position (end of block content, before closing brace)
  const insertPosition = document.positionAt(blockResult.endIndex);
  
  // Generate appropriate snippet for the missing block
  const blockSnippet = generateBlockSnippet(missingBlock, componentType);
  
  if (!blockSnippet) {
    return null;
  }
  
  // Create the text edit
  const edit: TextEdit = {
    range: {
      start: insertPosition,
      end: insertPosition,
    },
    newText: `\n  ${blockSnippet}`,
  };

  // Create the code action
  const action: CodeAction = {
    title: `Add missing "${missingBlock}" block`,
    kind: CodeActionKind.QuickFix,
    diagnostics: [diagnostic],
    edit: {
      changes: {
        [document.uri]: [edit],
      },
    },
  };

  return action;
}

function generateBlockSnippet(blockName: string, componentType: string): string | null {
  // Get block completions for this component type
  const blockCompletions = allBlockCompletions[componentType];

  if (!blockCompletions) {
    return null;
  }

  // Find the specific block completion for this block name
  const blockCompletion = blockCompletions.find(
    (completion: any) => completion.label === blockName
  );

  if (!blockCompletion || !blockCompletion.insertText) {
    // Fallback to a basic block structure
    return `${blockName} {\n    \n  }`;
  }

  // Clean up the completion text to remove snippet placeholders for code action
  let blockText = blockCompletion.insertText;

  // Replace ${1:...} placeholders with the content inside
  blockText = blockText.replace(/\$\{\d+:([^}]*)\}/g, '$1');

  // Remove any remaining ${...} placeholders
  blockText = blockText.replace(/\$\{\d+\}/g, '');

  // Replace tabs with spaces for consistent indentation
  blockText = blockText.replace(/\t/g, '  ');

  // Ensure proper indentation for nested content
  const lines = blockText.split('\n');
  const indentedLines = lines.map((line, index) => {
    if (index === 0) return line; // First line (block declaration) stays as is
    if (line.trim() === '') return ''; // Empty lines stay empty
    return '  ' + line; // Add 2 spaces indentation to content
  });

  return indentedLines.join('\n');
}

function createAddMapCommaAction(
  document: TextDocument,
  diagnostic: Diagnostic
): CodeAction | null {
  const data = diagnostic.data as any;
  
  // Handle both old and new diagnostic data formats
  const propertyName = data?.propertyName || data?.propertyKey;
  const mapPropertyName = data?.mapPropertyName;
  const commaInsertPosition = data?.commaInsertPosition;
  
  if (!propertyName || !commaInsertPosition) {
    return null;
  }

  // Create the text edit to insert a comma
  const edit: TextEdit = {
    range: {
      start: {
        line: commaInsertPosition.line,
        character: commaInsertPosition.character
      },
      end: {
        line: commaInsertPosition.line,
        character: commaInsertPosition.character
      },
    },
    newText: ',',
  };

  // Create the code action with better title
  const title = mapPropertyName 
    ? `Add missing comma after property "${propertyName}" in map "${mapPropertyName}"`
    : `Add missing comma after map property "${propertyName}"`;

  const action: CodeAction = {
    title,
    kind: CodeActionKind.QuickFix,
    diagnostics: [diagnostic],
    edit: {
      changes: {
        [document.uri]: [edit],
      },
    },
  };

  return action;
}

function createRemoveUnknownBlockAction(
  document: TextDocument,
  diagnostic: Diagnostic
): CodeAction | null {
  const data = diagnostic.data as any;
  const unknownBlock = data?.unknownBlock;
  const componentType = data?.componentType;
  
  if (!unknownBlock || !componentType) {
    return null;
  }

  const text = document.getText();
  const blockStartPos = document.offsetAt(diagnostic.range.start);
  
  // Find the complete block including its content and closing brace
  const openBraceIndex = text.indexOf("{", blockStartPos);
  if (openBraceIndex === -1) {
    return null;
  }

  const blockResult = getBlockContent(text, openBraceIndex + 1);
  if (!blockResult) {
    return null;
  }

  // Calculate the full block range from the start of the block name to after the closing brace
  const blockNameStart = blockStartPos;
  const blockEnd = blockResult.endIndex + 1; // +1 to include the closing brace
  
  // Include any trailing newline if present
  const endIndex = (text[blockEnd] === '\n') ? blockEnd + 1 : blockEnd;

  const startPos = document.positionAt(blockNameStart);
  const endPos = document.positionAt(endIndex);

  // Create the text edit to remove the entire block
  const edit: TextEdit = {
    range: {
      start: startPos,
      end: endPos,
    },
    newText: '',
  };

  // Create the code action
  const action: CodeAction = {
    title: `Remove unknown block "${unknownBlock}"`,
    kind: CodeActionKind.QuickFix,
    diagnostics: [diagnostic],
    edit: {
      changes: {
        [document.uri]: [edit],
      },
    },
  };

  return action;
}

function createRemoveDuplicateBlockAction(
  document: TextDocument,
  diagnostic: Diagnostic
): CodeAction | null {
  const data = diagnostic.data as any;
  const componentType = data?.componentType;
  const componentLabel = data?.componentLabel;
  
  // Handle different diagnostic formats
  let blockStartPos: number;
  
  if (data?.duplicateIndex !== undefined) {
    // Old format with duplicateIndex
    blockStartPos = data.duplicateIndex;
  } else {
    // New format - use the diagnostic range
    blockStartPos = document.offsetAt(diagnostic.range.start);
  }

  if (!componentType || !componentLabel || blockStartPos === undefined) {
    return null;
  }

  const text = document.getText();

  // Find the complete duplicate block including its content and closing brace
  const openBraceIndex = text.indexOf("{", blockStartPos);
  if (openBraceIndex === -1) {
    return null;
  }

  const blockResult = getBlockContent(text, openBraceIndex + 1);
  if (!blockResult) {
    return null;
  }

  // Find the actual start of the block line (including any leading whitespace)
  let lineStart = blockStartPos;
  while (lineStart > 0 && text[lineStart - 1] !== '\n') {
    lineStart--;
  }

  // Calculate the full block range from the start of the line to after the closing brace
  const blockEnd = blockResult.endIndex + 1; // +1 to include the closing brace

  // Include any trailing newline if present
  let endIndex = blockEnd;
  if (text[blockEnd] === '\n') {
    endIndex = blockEnd + 1;
  }

  const startPos = document.positionAt(lineStart);
  const endPos = document.positionAt(endIndex);

  // Create the text edit to remove the entire duplicate block
  const edit: TextEdit = {
    range: {
      start: startPos,
      end: endPos,
    },
    newText: '',
  };

  // Create the code action
  const action: CodeAction = {
    title: `Remove duplicate block "${componentType}" "${componentLabel}"`,
    kind: CodeActionKind.QuickFix,
    diagnostics: [diagnostic],
    edit: {
      changes: {
        [document.uri]: [edit],
      },
    },
  };

  return action;
}

function createRenameDuplicateBlockAction(
  document: TextDocument,
  diagnostic: Diagnostic
): CodeAction | null {
  const data = diagnostic.data as any;
  const componentType = data?.componentType;
  const componentLabel = data?.componentLabel;
  
  // Handle different diagnostic formats
  let blockStartPos: number;
  
  if (data?.duplicateIndex !== undefined) {
    // Old format with duplicateIndex
    blockStartPos = data.duplicateIndex;
  } else {
    // New format - use the diagnostic range
    blockStartPos = document.offsetAt(diagnostic.range.start);
  }

  if (!componentType || !componentLabel || blockStartPos === undefined) {
    return null;
  }

  const text = document.getText();

  // Find the block header to locate the label
  const blockHeaderRegex = new RegExp(`${componentType.replace('.', '\\.')}\\s+"${componentLabel.replace(/"/g, '\\"')}"\\s*\\{`);
  const blockHeaderMatch = blockHeaderRegex.exec(text.substring(blockStartPos));

  if (!blockHeaderMatch) {
    return null;
  }

  // Calculate the position of the label within the block header
  const labelStartOffset = blockStartPos + blockHeaderMatch[0].indexOf(`"${componentLabel}"`);
  const labelEndOffset = labelStartOffset + componentLabel.length + 2; // +2 for quotes

  // Generate a new unique label
  const newLabel = generateUniqueLabel(text, componentType, componentLabel);

  if (newLabel === componentLabel) {
    // No unique label could be generated
    return null;
  }

  // Create the text edit to replace the old label with the new one
  const edit: TextEdit = {
    range: {
      start: document.positionAt(labelStartOffset),
      end: document.positionAt(labelEndOffset),
    },
    newText: `"${newLabel}"`,
  };

  // Create the code action
  const action: CodeAction = {
    title: `Rename duplicate block to "${componentType}" "${newLabel}"`,
    kind: CodeActionKind.QuickFix,
    diagnostics: [diagnostic],
    edit: {
      changes: {
        [document.uri]: [edit],
      },
    },
  };

  return action;
}

function generateUniqueLabel(text: string, componentType: string, originalLabel: string): string {
  // Find all existing labels for this component type
  const labelRegex = new RegExp(`${componentType.replace('.', '\\.')}\\s+"([^"]*)"`, 'g');
  const existingLabels: Set<string> = new Set();

  let match;
  while ((match = labelRegex.exec(text)) !== null) {
    existingLabels.add(match[1]);
  }

  // Try incremental suffixes until we find a unique label
  let counter = 2;
  let newLabel = `${originalLabel}_${counter}`;

  while (existingLabels.has(newLabel)) {
    counter++;
    newLabel = `${originalLabel}_${counter}`;

    // Prevent infinite loop - limit to 100 attempts
    if (counter > 100) {
      return originalLabel; // Return original if we can't find unique
    }
  }

  return newLabel;
}
