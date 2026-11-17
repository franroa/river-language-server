import {
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
  TextDocumentPositionParams,
  TextDocuments,
  TextEdit,
  Position,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as utils from "./utils";
import { alloyParser } from "./parser";
import * as TypeInference from "./typeInference";

/**
 * Calculate the first valid insertion position for arguments within a block
 */
function calculateFirstArgumentPosition(content: string, position: Position): Position {
  const lines = content.split('\n');

  // Find the current block's opening brace
  let currentLine = position.line;
  let braceDepth = 0;

  // Go backwards to find the opening brace of the current block
  while (currentLine >= 0) {
    const line = lines[currentLine];

    // Count braces to find the block boundary
    const openBraces = (line.match(/\{/g) || []).length;
    const closeBraces = (line.match(/\}/g) || []).length;
    braceDepth += openBraces - closeBraces;

    // If we found the opening brace of our current block
    if (braceDepth === 1 && openBraces > 0) {
      // Find the next non-empty, non-comment line after the opening brace
      let insertLine = currentLine + 1;
      while (insertLine < lines.length) {
        const nextLine = lines[insertLine];
        const nextTrimmed = nextLine.trim();

        // Skip comments and empty lines
        if (nextTrimmed === '' || nextTrimmed.startsWith('//')) {
          insertLine++;
          continue;
        }

        // If we hit another block or closing brace, insert before it
        if (nextTrimmed.includes('{') || nextTrimmed.includes('}')) {
          return Position.create(insertLine, 0);
        }

        // Found a valid insertion point
        return Position.create(insertLine, 0);
      }

      // If no valid line found, insert at the end of the block
      return Position.create(currentLine + 1, 0);
    }

    currentLine--;
  }

  // Fallback: insert at current position
  return Position.create(position.line, position.character);
}

// Config blocks data is now handled by unified ConfigDataManager in utils.ts


function provideAllComponentsCompletion(
  allComponentData: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  content: string,
  position: Position,
  document?: TextDocument,
  documents?: TextDocuments<TextDocument>,
): CompletionItem[] {
  const mainLines = content.split("\n");
  if (position.line >= mainLines.length) {
    return [];
  }

  const mainLine = mainLines[position.line];
  const mainTextBeforeCursor = mainLine.substring(0, position.character);
  const mainCurrentWord = utils.getCurrentWord(mainTextBeforeCursor);

  // Check if we should provide component completion
  const shouldProvideCompletion = (() => {
    // Always provide at line start or after whitespace
    const isAtLineStart = /^\s*$/.test(mainTextBeforeCursor);
    const isAfterWhitespace = /\s$/.test(mainTextBeforeCursor);

    if (isAtLineStart || isAfterWhitespace) {
      return true;
    }
    // Provide completion if current word is a prefix of any component
    if (mainCurrentWord) {
      for (const componentName of Object.keys(allComponentData)) {
        if (componentName.startsWith(mainCurrentWord)) {
          return true;
        }
      }
    }
    // Provide completion if we're typing and the last character is a trigger
    const lastChar = mainTextBeforeCursor.slice(-1);
    const triggerChars = Array.from(new Set(Object.keys(allComponentData).join("").split("").concat(["."])));
    if (triggerChars.includes(lastChar)) {
      return true;
    }
    return false;
  })();

  if (!shouldProvideCompletion) {
    return [];
  }

  // Include declared components from workspace if documents are provided
  let availableComponents = allComponentData;
  if (documents) {
    availableComponents = utils.getCachedWorkspaceComponentsFromService(documents);
  } else if (document) {
    // Note: getAllAvailableComponents returns a Promise, but we need sync operation here
    // This fallback just uses the provided allComponentData
    availableComponents = allComponentData;
  }

  // Create completion items for all available components
  const completions: CompletionItem[] = [];
  for (const [componentName, componentData] of Object.entries(availableComponents)) {
    const completionItem: CompletionItem = {
      label: componentName,
      kind: CompletionItemKind.Class,
      detail: `${componentName} component`,
      documentation: {
        kind: "markdown",
        value: (componentData as any).usage,
      },
      insertText: (componentData as any).template || componentName,
      insertTextFormat: InsertTextFormat.Snippet,
      filterText: componentName,
      sortText: "0001", // High priority
    };
    completions.push(completionItem);
  }

  return completions;
}

function getDeclareCompletion(currentWord: string): CompletionItem[] {
  if (!currentWord || 'declare'.startsWith(currentWord.toLowerCase())) {
    const configBlockData = utils.ConfigDataManager.getConfigBlockData();
    const declareInfo = configBlockData['declare'];
    
    if (declareInfo) {
      return [{
        label: 'declare',
        kind: CompletionItemKind.Keyword,
        detail: 'declare config block',
        documentation: {
          kind: "markdown",
          value: declareInfo.usage || 'Declare a custom component',
        },
        insertText: 'declare "${1:component_name}" {\n  $0\n}',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: "0000", // Very high priority
      }];
    }
  }
  
  return [];
}

function getArgumentExportCompletions(currentWord: string): CompletionItem[] {
  const completions: CompletionItem[] = [];
  const configBlockData = utils.ConfigDataManager.getConfigBlockData();
  
  const blocks = ['argument', 'export'];
  
  for (const blockName of blocks) {
    if ((!currentWord || blockName.startsWith(currentWord.toLowerCase())) && configBlockData[blockName]) {
      const blockInfo = configBlockData[blockName];
      completions.push({
        label: blockName,
        kind: CompletionItemKind.Keyword,
        detail: `${blockName} config block`,
        documentation: {
          kind: "markdown",
          value: blockInfo.usage || `${blockName} configuration block`,
        },
        insertText: `${blockName} "\${1:name}" {\n  $0\n}`,
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: "0000", // Very high priority
      });
    }
  }
  
  return completions;
}

function getDeclareBlockArgumentsCompletion(
  content: string,
  position: Position,
  currentWord: string,
  declareBlock: utils.ParsedConfigBlock
): CompletionItem[] {
  const completions: CompletionItem[] = [];
  
  if (!declareBlock) {
    return completions;
  }

  // Find all argument declarations in the declare block
  const argumentNames: string[] = [];
  
  // Parse the declare block content to find argument declarations
  const lines = content.split('\n');
  const startLine = declareBlock.startLine || 0;
  const endLine = declareBlock.endLine || lines.length - 1;
  
  for (let i = startLine; i <= endLine; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Look for argument declarations: argument "name" {
    const argumentMatch = trimmed.match(/^argument\s+"([^"]+)"\s*\{/);
    if (argumentMatch) {
      argumentNames.push(argumentMatch[1]);
    }
  }
  
  // Create completions for argument.name.value
  const filterByWord = (label: string) =>
    !currentWord || label.toLowerCase().startsWith(currentWord.toLowerCase());
  
  for (const argName of argumentNames) {
    const fullArgumentRef = `argument.${argName}.value`;
    
    // Show completion if:
    // 1. User typed "argument" and we want to show all arguments
    // 2. User typed "argument." and we want to show all argument names
    // 3. User started typing an argument name
    if (currentWord === 'argument' || 
        currentWord === 'argument.' || 
        filterByWord(fullArgumentRef)) {
      
      completions.push({
        label: fullArgumentRef,
        kind: CompletionItemKind.Property,
        detail: "Argument reference",
        documentation: {
          kind: "markdown",
          value: `Reference to argument ${argName} defined in this declare block`,
        },
        insertText: fullArgumentRef,
        sortText: "0001", // High priority
        filterText: fullArgumentRef, // This helps with fuzzy matching
      });
    }
  }
  
  return completions;
}

function getComponentReferenceCompletions(
  content: string,
  position: Position,
  currentWord: string,
  allComponentData: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  documents?: TextDocuments<TextDocument>,
  document?: TextDocument
): CompletionItem[] {
  const completions: CompletionItem[] = [];
  
  // Skip if the current word is very short to avoid too many suggestions
  if (currentWord.length < 2) {
    return completions;
  }
  
  // Get the expected type for type-aware completion
  let expectedType: string | null = null;
  if (document) {
    expectedType = getExpectedTypeAtPosition(document, position);
  }
  
  // 1. Get all component instances from workspace (HIGH PRIORITY)
  const allInstances = getAllComponentInstances(content, documents, allComponentData);
  
  // Filter instances that match the current word being typed
  for (const instance of allInstances) {
    const fullReference = `${instance.componentType}.${instance.label}`;
    
    // Check if this instance matches what the user is typing
    if (fullReference.toLowerCase().startsWith(currentWord.toLowerCase())) {
      completions.push({
        label: fullReference,
        kind: CompletionItemKind.Variable, // Variable icon for instances
        detail: `${instance.componentType} instance (existing)`,
        documentation: {
          kind: "markdown",
          value: `Reference to existing ${instance.componentType} instance "${instance.label}"`,
        },
        insertText: fullReference,
        sortText: "0001", // High priority for existing instances
        filterText: fullReference,
      });
      
      // Add property completions for this instance using existing logic
      const componentData = allComponentData[instance.componentType];
      if (componentData) {
        // Get exported fields using the same logic as diagnostics
        let exportedFields: any = null;
        if (componentData.lsp_structure && componentData.lsp_structure.exported_fields) {
          exportedFields = componentData.lsp_structure.exported_fields;
        } else if (componentData.exported_fields) {
          exportedFields = componentData.exported_fields;
        }
        
        if (exportedFields) {
          // Handle both object format (lsp_structure) and array format (exported_fields)
          const fieldsToProcess = Array.isArray(exportedFields) ? exportedFields : Object.entries(exportedFields);
          
          for (const field of fieldsToProcess) {
            let fieldName: string;
            let fieldType: string;
            let fieldDescription: string;
            
            if (Array.isArray(exportedFields)) {
              // Array format: {name, type, description}
              fieldName = field.name;
              fieldType = field.type;
              fieldDescription = field.description || '';
            } else {
              // Object format: {fieldName: {type, description}}
              fieldName = field[0];
              fieldType = field[1].type;
              fieldDescription = field[1].description || '';
            }
            
            const fullReferenceWithProp = `${fullReference}.${fieldName}`;
            if (fullReferenceWithProp.toLowerCase().startsWith(currentWord.toLowerCase())) {
              // Type filtering: only show if compatible with expected type
              const showProperty = !expectedType || isTypeCompatible(fieldType, expectedType);
              
              if (showProperty) {
                completions.push({
                  label: fullReferenceWithProp,
                  kind: CompletionItemKind.Property,
                  detail: `${fieldType} (${instance.componentType} export)`,
                  documentation: {
                    kind: "markdown",
                    value: fieldDescription || `${fieldName} property of ${instance.componentType} instance "${instance.label}"`,
                  },
                  insertText: fullReferenceWithProp,
                  sortText: "0002", // High priority for properties of existing instances
                  filterText: fullReferenceWithProp,
                });
              }
            }
          }
        }
      }
    }
  }
  
  // 2. Add available component types for creating new components (LOWER PRIORITY)
  // Only show in contexts where component creation makes sense (not in value assignments)
  const isValueContext = isInValueAssignmentContext(content, position);
  if (!isValueContext && allComponentData) {
    for (const [componentType, componentInfo] of Object.entries(allComponentData)) {
      // Check if this component type matches what the user is typing
      if (componentType.toLowerCase().startsWith(currentWord.toLowerCase())) {
        const componentData = componentInfo as any;
        
        // Create a template for the component with placeholder
        const template = `${componentType} "\${1:label}" {\n  $0\n}`;
        
        completions.push({
          label: componentType,
          kind: CompletionItemKind.Class, // Class icon for component types
          detail: `${componentType} component type`,
          documentation: {
            kind: "markdown",
            value: componentData?.usage || `Create a new ${componentType} component`,
          },
          insertText: template,
          insertTextFormat: InsertTextFormat.Snippet,
          sortText: "0010", // Lower priority for component types
          filterText: componentType,
        });
      }
    }
  }
  
  return completions;
}

function getAllComponentInstances(
  content: string,
  documents?: TextDocuments<TextDocument>,
  allComponentData?: any // eslint-disable-line @typescript-eslint/no-explicit-any
): {componentType: string; label: string; line: number; uri?: string}[] {
  const instances: {componentType: string; label: string; line: number; uri?: string}[] = [];
  const seenInstances = new Set<string>(); // Avoid duplicates
  
  const searchInContent = (searchContent: string, sourceUri?: string) => {
    const lines = searchContent.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      // Skip comments and empty lines
      if (trimmed.startsWith('//') || trimmed === '') {
        continue;
      }
      
      // Look for component declarations: component.type "label" {
      const componentMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_.]*)\s+"([^"]+)"\s*\{/);
      if (componentMatch) {
        const componentType = componentMatch[1];
        const label = componentMatch[2];
        const instanceKey = `${componentType}.${label}`;
        
        // Only include if it's a known component type (if we have component data)
        if (!allComponentData || allComponentData[componentType]) {
          if (!seenInstances.has(instanceKey)) {
            seenInstances.add(instanceKey);
            instances.push({
              componentType: componentType,
              label: label,
              line: i,
              uri: sourceUri
            });
          }
        }
      }
    }
  };
  
  // Search in current document first
  searchInContent(content);
  
  // Also search in other documents if available
  if (documents) {
    documents.all().forEach(doc => {
      const docContent = doc.getText();
      // Simple check to avoid searching current document again
      if (docContent !== content) {
        searchInContent(docContent, doc.uri);
      }
    });
  }
  
  return instances;
}



function getConfigBlockSpecificCompletions(
  configBlockType: 'declare' | 'argument' | 'export' | 'foreach' | 'http' | 'import.file' | 'import.git' | 'import.http' | 'import.string' | 'livedebugging' | 'livelogging' | 'logging' | 'remotecfg' | 'tracing',
  currentWord: string,
): CompletionItem[] {
  const completions: CompletionItem[] = [];
  const configBlockData = utils.ConfigDataManager.getConfigBlockData();
  
  if (!configBlockData[configBlockType]) {
    return completions;
  }
  
  const blockInfo = configBlockData[configBlockType];
  const filterByWord = (label: string) =>
    !currentWord || label.toLowerCase().startsWith(currentWord.toLowerCase());
  
    // Add arguments for the config block
    if (blockInfo.lsp_structure && blockInfo.lsp_structure.arguments) {
      for (const [argName, argInfo] of Object.entries(blockInfo.lsp_structure.arguments)) {
        if (filterByWord(argName)) {
          const argDetail = argInfo as any;
          const isRequired = argDetail.required || false;

          completions.push({
            label: argName,
            kind: CompletionItemKind.Property,
            detail: `${argDetail.type || 'unknown'}${isRequired ? " (required)" : ""}`,
            documentation: {
              kind: "markdown",
              value: argDetail.description || `Configure ${argName} setting`,
            },
            insertText: `${argName} = `,
            sortText: isRequired ? "0001" : "0002",
          });
        }
      }
    }
  
  return completions;
}

function getBlockSpecificCompletions(
  content: string,
  position: Position,
  blockPath: string[],
  componentData: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  currentWord: string,
  componentName?: string,
  currentLineText?: string,
): CompletionItem[] {
  const completions: CompletionItem[] = [];
  const blockStructure = utils.getBlockStructure(componentName);

  if (!blockStructure) {
    return completions;
  }

  // Filter completions based on current word being typed
  const filterByWord = (label: string) =>
    !currentWord || label.toLowerCase().startsWith(currentWord.toLowerCase());

  // Check if we're on a block declaration line by looking at the current line
  const isOnBlockDeclaration = currentLineText && currentLineText.trim().match(/^([^\s"]+)(?:\s+"[^"]*")?\s*\{/);
  const currentBlockName = isOnBlockDeclaration ? isOnBlockDeclaration[1] : null;

  // Navigate to current block in structure to get arguments and nested blocks
  let currentBlock = blockStructure;

  // Handle the case where we're at the root level (component level)
  if (blockPath.length === 0 || (blockPath.length === 1 && blockPath[0] === componentName)) {
    // At root level, show component arguments first
    if (componentData.lsp_structure.arguments && typeof componentData.lsp_structure.arguments === 'object') {
      for (const [argName, argInfo] of Object.entries(componentData.lsp_structure.arguments)) {
        if (filterByWord(argName)) {
          const argDetail = argInfo as any;
          const isRequired = argDetail.required || false;

          // Calculate insertion position for first argument in block
          const insertPosition = calculateFirstArgumentPosition(content, position);

          completions.push({
            label: argName,
            kind: CompletionItemKind.Property,
            detail: `${argDetail.type || 'unknown'}${isRequired ? " (required)" : ""}`,
            documentation: {
              kind: "markdown",
              value: argDetail.description || `Configure ${argName} setting`,
            },
            textEdit: TextEdit.insert(insertPosition, `${argName} = `),
            sortText: isRequired ? "0001" : "0002",
          });
        }
      }
    }

    // Then show top-level blocks
    for (const blockName of Object.keys(blockStructure)) {
      // Don't show the current block if we're on its declaration line
      if (currentBlockName === blockName) {
        continue;
      }

      if (filterByWord(blockName)) {
        const blockInfo = blockStructure[blockName];
        const isRequired = componentData.lsp_structure.required_blocks?.includes(blockName) || blockInfo?.required;

        completions.push({
          label: blockName,
          kind: CompletionItemKind.Class,
          detail: `${blockName} block${isRequired ? " (required)" : ""}`,
          documentation: {
            kind: "markdown",
            value: blockInfo?.description || `Configure ${blockName} settings`,
          },
          insertText: `${blockName} {\n  $0\n}`,
          insertTextFormat: InsertTextFormat.Snippet,
          sortText: isRequired ? "0001" : "0002",
        });
      }
    }
    return completions;
  }

  // Find the current block by following the path
  let pathToFollow = blockPath.slice(); // Copy the path
  if (pathToFollow[0] === componentName) {
    pathToFollow = pathToFollow.slice(1); // Remove component name from path
  }

  for (const pathSegment of pathToFollow) {
    // First check if we can find it directly in currentBlock
    if (currentBlock[pathSegment]) {
      currentBlock = currentBlock[pathSegment];
    }
    // If not found directly, check in children
    else if (currentBlock.children && currentBlock.children[pathSegment]) {
      currentBlock = currentBlock.children[pathSegment];
    }
    else {
      // Block not found in structure, return empty
      return completions;
    }
  }

  // Now we're at the current block level
  // Add argument completions for current block
  if (currentBlock.arguments && Array.isArray(currentBlock.arguments)) {
    for (const arg of currentBlock.arguments) {
      if (filterByWord(arg.name)) {
        // Calculate insertion position for first argument in block
        const insertPosition = calculateFirstArgumentPosition(content, position);

        const completion: CompletionItem = {
          label: arg.name,
          kind: CompletionItemKind.Property,
          detail: `${arg.type}${arg.required ? " (required)" : ""}`,
          documentation: {
            kind: "markdown",
            value:
              arg.description +
              (arg.default ? `\n\n**Default:** ${arg.default}` : ""),
          },
          textEdit: TextEdit.insert(insertPosition, `${arg.name} = `),
          sortText: arg.required ? "0001" : "0002",
        };
        completions.push(completion);
      }
    }
  }

  // Add nested block completions
  if (currentBlock.children && typeof currentBlock.children === 'object') {
    for (const [childName, childInfo] of Object.entries(currentBlock.children)) {
      if (filterByWord(childName)) {
        const isRequired = componentData.lsp_structure.required_blocks?.includes(childName) ||
                          (childInfo as any)?.required;

        const completion: CompletionItem = {
          label: childName,
          kind: CompletionItemKind.Class,
          detail: `${childName} block${isRequired ? " (required)" : ""}`,
          documentation: {
            kind: "markdown",
            value: (childInfo as any)?.description || `Configure ${childName} settings`,
          },
          insertText: `${childName} {\n  $0\n}`,
          insertTextFormat: InsertTextFormat.Snippet,
          sortText: isRequired ? "0001" : "0002",
        };
        completions.push(completion);
      }
    }
  }

  // Handle nested_blocks array if it exists
  if (currentBlock.nested_blocks && Array.isArray(currentBlock.nested_blocks)) {
    for (const nestedBlock of currentBlock.nested_blocks) {
      if (filterByWord(nestedBlock.block)) {
        const completion: CompletionItem = {
          label: nestedBlock.block,
          kind: CompletionItemKind.Class,
          detail: `${nestedBlock.block} block${nestedBlock.required ? " (required)" : ""}`,
          documentation: {
            kind: "markdown",
            value: nestedBlock.description || `Configure ${nestedBlock.block} settings`,
          },
          insertText: `${nestedBlock.block} {\n  $0\n}`,
          insertTextFormat: InsertTextFormat.Snippet,
          sortText: nestedBlock.required ? "0001" : "0002",
        };
        completions.push(completion);
      }
    }
  }

  return completions;
}

function getExpectedTypeAtPosition(
  document: TextDocument,
  position: Position
): string | null {
  const lines = document.getText().split('\n');
  const currentLine = lines[position.line] || '';
  
  // Look for assignment pattern: argument_name = [cursor_here]
  let assignmentMatch = currentLine.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*/);
  let parameterName = '';
  
  if (assignmentMatch) {
    parameterName = assignmentMatch[1];
  } else {
    // Look backwards for array assignment pattern: argument_name = [cursor_here
    for (let i = position.line; i >= Math.max(0, position.line - 5); i--) {
      const line = lines[i] || '';
      const lineAssignmentMatch = line.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*\[/);
      if (lineAssignmentMatch) {
        // Check if we're inside the array (no closing bracket yet)
        const textFromAssignment = lines.slice(i, position.line + 1).join('\n');
        const openBrackets = (textFromAssignment.match(/\[/g) || []).length;
        const closeBrackets = (textFromAssignment.match(/\]/g) || []).length;
        
        if (openBrackets > closeBrackets) {
          parameterName = lineAssignmentMatch[1];
          break;
        }
      }
    }
  }
  
  if (parameterName) {
    // Use the existing type inference system
    return TypeInference.getExpectedParameterType(document, position.line, parameterName);
  }
  
  return null;
}



function isTypeCompatible(sourceType: string, expectedType: string): boolean {
  // Direct match
  if (sourceType === expectedType) {
    return true;
  }
  
  // Extract the core type from complex expected types
  const coreExpectedType = extractCoreType(expectedType);
  
  // Check if source type matches the core expected type
  if (sourceType === coreExpectedType) {
    return true;
  }
  
  // Handle some common type equivalences
  const typeEquivalences: Record<string, string[]> = {
    'MetricsReceiver': ['otelcol.Consumer'],
    'LogsReceiver': ['otelcol.Consumer'],
    'TracesReceiver': ['otelcol.Consumer'],
  };
  
  if (typeEquivalences[coreExpectedType]?.includes(sourceType)) {
    return true;
  }
  
  if (typeEquivalences[sourceType]?.includes(coreExpectedType)) {
    return true;
  }
  
  return false;
}

function extractCoreType(type: string): string {
  // Remove list() wrapper: list(MetricsReceiver) -> MetricsReceiver
  let coreType = type.replace(/^list\((.+)\)$/, '$1');
  
  // Remove map() wrapper: map(string) -> string
  coreType = coreType.replace(/^map\((.+)\)$/, '$1');
  
  // Remove nested wrappers: list(map(string)) -> string
  coreType = coreType.replace(/^list\(map\((.+)\)\)$/, '$1');
  
  // Remove other common patterns
  coreType = coreType.replace(/^optional\((.+)\)$/, '$1');
  
  return coreType;
}

function isInValueAssignmentContext(content: string, position: Position): boolean {
  const lines = content.split('\n');
  const currentLine = lines[position.line] || '';
  const textBeforeCursor = currentLine.substring(0, position.character);
  
  // Check if we're after an equals sign or inside brackets/parentheses
  return textBeforeCursor.includes('=') || 
         textBeforeCursor.includes('[') || 
         textBeforeCursor.includes('(');
}

function isInsideComponentInDeclareBlock(
  content: string,
  position: Position,
  componentName?: string | null
): boolean {
  if (!componentName) {
    return false;
  }
  
  const lines = content.split('\n');
  let braceDepth = 0;
  let inDeclareBlock = false;
  let foundComponent = false;
  
  for (let i = 0; i <= position.line; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Count braces to track nesting
    const openBraces = (line.match(/\{/g) || []).length;
    const closeBraces = (line.match(/\}/g) || []).length;
    
    // Check if we enter a declare block
    if (trimmed.match(/^declare\s+"[^"]*"\s*\{/)) {
      inDeclareBlock = true;
      braceDepth = 1; // Reset depth to declare level
      foundComponent = false;
      continue;
    }
    
    // If we're in a declare block, check for component declaration
    if (inDeclareBlock && trimmed.startsWith(componentName)) {
      foundComponent = true;
      // Don't increment depth here since we want to check if we're INSIDE the component
    }
    
    // Update brace depth
    braceDepth += openBraces - closeBraces;
    
    // If we're at the target position
    if (i === position.line) {
      // We're inside a component in declare block if:
      // 1. We found the component declaration
      // 2. We're still inside nested braces (depth > 1, since 1 is declare level)
      return inDeclareBlock && foundComponent && braceDepth > 1;
    }
    
    // If braces close back to 0, we're out of the declare block
    if (braceDepth <= 0) {
      inDeclareBlock = false;
      foundComponent = false;
    }
  }
  
  return false;
}

export function provideCompletions(
  textDocumentPosition: TextDocumentPositionParams,
  documents: TextDocuments<TextDocument>,
): CompletionItem[] {
  const document = documents.get(textDocumentPosition.textDocument.uri);
  if (!document) {
    return [];
  }

  const position = textDocumentPosition.position;
  const content = document.getText();

  // Get all component data including declared components
  const currentDocument = documents.get(textDocumentPosition.textDocument.uri);
  const allComponentData = utils.getCachedWorkspaceComponents(documents);
  if (Object.keys(allComponentData).length === 0) {
    // Fallback to builtin components only
    const builtinComponents = utils.getAllComponentData();
    if (Object.keys(builtinComponents).length === 0) {
      return [];
    }
    Object.assign(allComponentData, builtinComponents);
  }

  // Check if we're inside a config block (declare, argument, export)
  const configBlock = alloyParser.findConfigBlockAtPosition(content, position);
  
  // Check if we're inside a regular component
  const currentComponent = utils.findComponentAtPosition(content, position, documents);
  const componentData = currentComponent ? allComponentData[currentComponent] : null;

  // Get current context for completion filtering
  const allLines = content.split("\n");
  const currentLine = allLines[position.line] || "";
  const textBeforeCursor = currentLine.substring(0, position.character);
  const currentWord = utils.getCurrentWord(textBeforeCursor);

  // Case 1: Inside a declare block
  if (configBlock && configBlock.type === 'declare') {
    // Check if we're directly inside the declare block or inside a component within the declare block
    const insideComponentInDeclare = isInsideComponentInDeclareBlock(content, position, currentComponent);

     if (insideComponentInDeclare && componentData) {
       // We're inside a component within a declare block - show component-specific child blocks and arguments
       const blockPosition = utils.findBlockAtPosition(content, position);
       let currentBlockPath = blockPosition ? blockPosition.blockPath : [];

       // Normalize the block path to be relative to the current component
       // Find and remove the declare block and component name from the path
       let normalizedPath = [...currentBlockPath];

       // Remove 'declare' if it exists at the beginning
       if (normalizedPath.length > 0 && normalizedPath[0] === 'declare') {
         normalizedPath = normalizedPath.slice(1);
       }

        // Find and remove the component name from the path
        if (currentComponent) {
          const componentIndex = normalizedPath.indexOf(currentComponent);
          if (componentIndex !== -1) {
            // Remove everything up to and including the component name
            normalizedPath = normalizedPath.slice(componentIndex + 1);
          }
        }

       const isEmptyLine = currentLine.trim() === '';
       const effectiveBlockPath = isEmptyLine && normalizedPath.length === 0 ? [] : normalizedPath;

        const blockCompletions = getBlockSpecificCompletions(
          content,
          position,
          effectiveBlockPath,
          componentData,
          currentWord,
          currentComponent || undefined,
          currentLine,
        );
        
        // Add argument completions when typing "argument" or "argument."
        if (currentWord === 'argument' || currentWord.startsWith('argument.')) {
          const argumentCompletions = getDeclareBlockArgumentsCompletion(content, position, currentWord, configBlock);
          blockCompletions.push(...argumentCompletions);
        }
        
        // Add component reference completions for any word that could be a component reference
        if (currentWord && currentWord.length >= 2 && !currentWord.startsWith('argument.')) {
          const referenceCompletions = getComponentReferenceCompletions(content, position, currentWord, allComponentData, documents, document);
          blockCompletions.push(...referenceCompletions);
        }
        
      if (blockCompletions.length > 0) {
        return blockCompletions;
      }
    } else {
      // We're directly inside the declare block at root level - show all possible components + argument/export + component references
      const componentCompletions = provideAllComponentsCompletion(allComponentData, content, position, currentDocument, documents);
      const argumentExportCompletions = getArgumentExportCompletions(currentWord);
      
      // Also add component reference completions if typing a component prefix
      const referenceCompletions: CompletionItem[] = [];
      if (currentWord && currentWord.length >= 2) {
        const componentReferenceCompletions = getComponentReferenceCompletions(content, position, currentWord, allComponentData, documents, document);
        referenceCompletions.push(...componentReferenceCompletions);
      }

      return [...componentCompletions, ...argumentExportCompletions, ...referenceCompletions];
    }
  }

  // Case 2: Inside config block - show their specific completions
  if (configBlock) {
    return getConfigBlockSpecificCompletions(configBlock.type, currentWord);
  }

  // Case 3: Inside a regular component block (outside declare) - show component-specific child blocks and arguments
  const blockPosition = utils.findBlockAtPosition(content, position);
  let currentBlockPath = blockPosition ? blockPosition.blockPath : [];
  const inComponentBlock = currentComponent ? utils.isInsideComponentBlock(content, position, currentComponent) : false;

  if (inComponentBlock && componentData) {
    // Normalize the block path to be relative to the current component
    // Remove the component name from the path if it's the first element
    if (currentBlockPath.length > 0 && currentBlockPath[0] === currentComponent) {
      currentBlockPath = currentBlockPath.slice(1); // Remove component name
    }

    // Inside any component (whether in declare or not) - show child blocks and arguments for that component
    const isEmptyLine = currentLine.trim() === '';
    const effectiveBlockPath = isEmptyLine && currentBlockPath.length === 0 ? [] : currentBlockPath;

    const blockCompletions = getBlockSpecificCompletions(
      content,
      position,
      effectiveBlockPath,
      componentData,
      currentWord,
      currentComponent || undefined,
      currentLine,
    );
    
    // Add component reference completions for any word that could be a component reference
    if (currentWord && currentWord.length >= 2) {
      const referenceCompletions = getComponentReferenceCompletions(content, position, currentWord, allComponentData, documents);
      blockCompletions.push(...referenceCompletions);
    }
    
    if (blockCompletions.length > 0) {
      return blockCompletions;
    }
  }

  // Case 4: Universal fallback - provide appropriate completions based on context
  const universalCompletions: CompletionItem[] = [];
  
  if (currentWord && currentWord.length > 0) {
    // Check if we're in a value context (assignment, array, etc.)
    const lines = content.split('\n');
    const currentLine = lines[position.line] || '';
    const textBeforeCursor = currentLine.substring(0, position.character);
    
    // Context detection
    const isInValueContext = textBeforeCursor.includes('=') || textBeforeCursor.includes('[') || textBeforeCursor.includes('(');
    const isAtLineStart = /^\s*$/.test(textBeforeCursor.replace(currentWord, '').trim());
    
    if (isInValueContext) {
      // In value context: prioritize component references (existing instances)
      const referenceCompletions = getComponentReferenceCompletions(content, position, currentWord, allComponentData, documents);
      universalCompletions.push(...referenceCompletions);
    } else if (isAtLineStart) {
      // At line start: show component declarations for creating new components
      const componentCompletions = provideAllComponentsCompletion(allComponentData, content, position, currentDocument, documents);
      const declareCompletion = getDeclareCompletion(currentWord);
      universalCompletions.push(...componentCompletions, ...declareCompletion);
    } else {
      // Mixed context: show both, but prioritize based on context
      const referenceCompletions = getComponentReferenceCompletions(content, position, currentWord, allComponentData, documents);
      const componentCompletions = provideAllComponentsCompletion(allComponentData, content, position, currentDocument, documents);
      const declareCompletion = getDeclareCompletion(currentWord);
      
      universalCompletions.push(...referenceCompletions, ...componentCompletions, ...declareCompletion);
    }
  } else {
    // No current word, show all available component declarations
    const componentCompletions = provideAllComponentsCompletion(allComponentData, content, position, currentDocument, documents);
    const declareCompletion = getDeclareCompletion(currentWord);
    universalCompletions.push(...componentCompletions, ...declareCompletion);
  }
  
  return universalCompletions;
}
