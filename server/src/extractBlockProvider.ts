import {
  TextDocuments,
  CodeAction,
  CodeActionKind,
  CodeActionParams,
  Range,
  Position,
  TextEdit,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as utils from "./utils";
import { ComponentValidator } from "./componentValidator";

interface ComponentToExtract {
  name: string;
  label?: string;
  range: Range;
  content: string;
  parsedComponent: utils.ParsedComponent;
}

/**
 * Detect indentation style from document content
 */
function detectIndentationStyle(content: string): { size: number; usesTabs: boolean; indentString: string } {
  const lines = content.split('\n');
  const indentSizes: number[] = [];
  let tabCount = 0;
  let spaceCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && (trimmed.includes('=') || trimmed.includes('{') || trimmed.includes('}'))) {
      const leadingWhitespace = line.substring(0, line.length - line.trimStart().length);
      const indent = leadingWhitespace.length;
      
      if (indent > 0) {
        indentSizes.push(indent);
        
        // Count tabs vs spaces
        if (leadingWhitespace.includes('\t')) {
          tabCount++;
        } else {
          spaceCount++;
        }
      }
    }
  }

  const usesTabs = tabCount > spaceCount;

  if (indentSizes.length === 0) {
    return { size: 4, usesTabs: false, indentString: '    ' };
  }

  // Find the most common indentation size
  const indentCounts: { [key: number]: number } = {};
  for (const size of indentSizes) {
    indentCounts[size] = (indentCounts[size] || 0) + 1;
  }

  let mostCommonSize = 4;
  let maxCount = 0;
  for (const [size, count] of Object.entries(indentCounts)) {
    if (count > maxCount) {
      maxCount = count;
      mostCommonSize = parseInt(size);
    }
  }

  const indentString = usesTabs ? '\t'.repeat(mostCommonSize) : ' '.repeat(mostCommonSize);

  return { size: mostCommonSize, usesTabs, indentString };
}

/**
 * Find components that can be extracted from the selection
 */
function findComponentsInRange(document: TextDocument, range: Range): ComponentToExtract[] {
  const parsedComponents = utils.parseDocument(document);
  const components: ComponentToExtract[] = [];

  for (const component of parsedComponents) {
    // Check if component is within or overlaps the selection range
    // Component is selected if its range overlaps with the selection
    const isSelected = (
      (component.startLine >= range.start.line && component.startLine <= range.end.line) ||
      (component.endLine >= range.start.line && component.endLine <= range.end.line) ||
      (component.startLine <= range.start.line && component.endLine >= range.end.line)
    );

    if (isSelected) {
      // Extract the component content
      const componentContent = document.getText(component.range);

      components.push({
        name: component.name,
        label: component.label,
        range: component.range,
        content: componentContent,
        parsedComponent: component
      });
    }
  }

  return components;
}

/**
 * Extract required arguments from a component
 */
function extractRequiredArguments(component: utils.ParsedComponent): { name: string; type: string; description: string }[] {
  const componentData = ComponentValidator.getComponentInfo(component.name);

  if (!componentData || !componentData.lsp_structure || !componentData.lsp_structure.arguments) {
    return [];
  }

  const requiredArgs: { name: string; type: string; description: string }[] = [];
  const componentArgs = componentData.lsp_structure.arguments;

  // Find arguments that have actual values in the component
  for (const [argName, argInfo] of Object.entries(componentArgs)) {
    if (typeof argInfo === 'object' && argInfo !== null && 'type' in argInfo) {
      // Check if this argument has a value in the parsed component
      const hasValue = component.args && component.args[argName];
      if (hasValue) {
        requiredArgs.push({
          name: argName,
          type: (argInfo as any).type || 'string',
          description: (argInfo as any).description || `Argument ${argName}`
        });
      }
    }
  }

  return requiredArgs;
}

/**
 * Extract external component references from component content
 */
function extractExternalReferences(content: string): { reference: string; argName: string }[] {
  const references: { reference: string; argName: string }[] = [];

  // Match component references in brackets like [loki.write.default.receiver]
  const bracketRefRegex = /\[([a-zA-Z_][a-zA-Z0-9_.]*[a-zA-Z0-9_])\]/g;
  const bracketMatches = content.match(bracketRefRegex);

  if (bracketMatches) {
    for (const match of bracketMatches) {
      // Extract the reference from brackets
      const refMatch = match.match(/\[([a-zA-Z_][a-zA-Z0-9_.]*[a-zA-Z0-9_])\]/);
      if (refMatch) {
        const reference = refMatch[1];
        // Check if it looks like a component reference (contains dots and follows component naming pattern)
        if (reference.includes('.') && /^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(reference)) {
          // Convert to argument name (replace dots with underscores)
          const argName = reference.replace(/\./g, '_');
          references.push({ reference, argName });
        }
      }
    }
  }

  // Also match component references in assignment values like write_to = loki.write.default.receiver
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    // Only process lines that contain assignments
    if (trimmed.includes('=')) {
      // Extract the value part after the equals sign
      const equalsIndex = trimmed.indexOf('=');
      if (equalsIndex !== -1) {
        const valuePart = trimmed.substring(equalsIndex + 1).trim();

        // Match component references in the value
        const valueRefRegex = /\b([a-zA-Z_][a-zA-Z0-9_.]*[a-zA-Z0-9_])\b/g;
        const valueMatches = valuePart.match(valueRefRegex);

        if (valueMatches) {
          for (const match of valueMatches) {
            // Skip if it's a keyword or quoted string
            if (match === 'true' || match === 'false' || match === 'null' ||
                match.startsWith('"') || match.endsWith('"')) {
              continue;
            }

            // Check if it looks like a component reference (contains dots and doesn't contain path separators)
            if (match.includes('.') && !match.includes('/') && !match.includes('\\') &&
                /^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(match)) {
              // Convert to argument name (replace dots with underscores)
              const argName = match.replace(/\./g, '_');
              references.push({ reference: match, argName });
            }
          }
        }
      }
    }
  }

  // Remove duplicates
  const uniqueReferences = references.filter((ref, index, self) =>
    index === self.findIndex(r => r.reference === ref.reference)
  );

  return uniqueReferences;
}

/**
 * Generate a declare block from extracted components
 */
function generateDeclareBlock(
  components: ComponentToExtract[],
  declareName: string,
  indentString: string
): string {
  const lines: string[] = [];

  // Start declare block
  lines.push(`declare "${declareName}" {`);

  // Collect all arguments from all components
  const allArguments = new Set<string>();
  const argumentDetails: { [key: string]: { type: string; description: string } } = {};

  for (const component of components) {
    // Add component arguments
    const requiredArgs = extractRequiredArguments(component.parsedComponent);
    for (const arg of requiredArgs) {
      allArguments.add(arg.name);
      argumentDetails[arg.name] = { type: arg.type, description: arg.description };
    }

    // Add external reference arguments
    const externalRefs = extractExternalReferences(component.content);
    for (const ref of externalRefs) {
      allArguments.add(ref.argName);
      argumentDetails[ref.argName] = {
        type: 'string',
        description: `Reference to ${ref.reference}`
      };
    }
  }

  // Add argument declarations
  for (const argName of Array.from(allArguments).sort()) {
    const argDetail = argumentDetails[argName];
    lines.push(`${indentString}argument "${argName}" {`);
    lines.push(`${indentString}${indentString}optional = false`);
    lines.push(`${indentString}${indentString}type     = "${argDetail.type}"`);
    lines.push(`${indentString}${indentString}comment  = "${argDetail.description}"`);
    lines.push(`${indentString}}`);
    lines.push('');
  }

  // Add export block (components can export their outputs)
  lines.push(`${indentString}export "output" {`);
  lines.push(`${indentString}${indentString}// Add export configuration here`);
  lines.push(`${indentString}}`);
  lines.push('');

  // Add the component content (transformed to use arguments)
  for (const component of components) {
    const transformedContent = transformComponentForDeclare(component);
    const contentLines = transformedContent.split('\n');

    for (const line of contentLines) {
      if (line.trim()) {
        lines.push(`${indentString}${line}`);
      } else {
        lines.push('');
      }
    }

    if (components.indexOf(component) < components.length - 1) {
      lines.push('');
    }
  }

  // Close declare block
  lines.push('}');

  return lines.join('\n');
}

/**
 * Transform a component to use arguments instead of hardcoded values
 */
function transformComponentForDeclare(component: ComponentToExtract): string {
  let content = component.content;

  // Find all argument assignments and replace with var.argument_name
  const requiredArgs = extractRequiredArguments(component.parsedComponent);

  for (const arg of requiredArgs) {
    // Replace hardcoded values with var.argument_name references
    const argRegex = new RegExp(`(\\s+${arg.name}\\s*=\\s*)([^\\n]+)`, 'g');
    content = content.replace(argRegex, `$1var.${arg.name}`);
  }

  // Replace external references with argument calls
  const externalRefs = extractExternalReferences(component.content);
  for (const ref of externalRefs) {
    // Replace the reference with argument.argName.value
    const refRegex = new RegExp(`\\b${ref.reference}\\b`, 'g');
    content = content.replace(refRegex, `argument.${ref.argName}.value`);
  }

  return content;
}

/**
 * Generate usage example for the declared component
 */
function generateUsageExample(
  declareName: string, 
  components: ComponentToExtract[], 
  indentString: string
): string {
  const lines: string[] = [];
  
  // Create a usage example
  const exampleLabel = components.length === 1 && components[0].label 
    ? components[0].label 
    : 'example';
    
  lines.push(`${declareName} "${exampleLabel}" {`);
  
  // Add argument assignments based on the original component values
  const allArguments = new Set<string>();
  const argumentValues: { [key: string]: string } = {};

  for (const component of components) {
    // Add component arguments
    const requiredArgs = extractRequiredArguments(component.parsedComponent);
    for (const arg of requiredArgs) {
      allArguments.add(arg.name);
      // Try to get the original value from the component
      if (component.parsedComponent.args && component.parsedComponent.args[arg.name]) {
        argumentValues[arg.name] = component.parsedComponent.args[arg.name].value;
      } else {
        argumentValues[arg.name] = '""'; // Default empty value
      }
    }

    // Add external reference arguments
    const externalRefs = extractExternalReferences(component.content);
    for (const ref of externalRefs) {
      allArguments.add(ref.argName);
      argumentValues[ref.argName] = ref.reference; // Use the original reference as the default value (without quotes)
    }
  }

  // Add argument assignments
  for (const argName of Array.from(allArguments).sort()) {
    const value = argumentValues[argName];
    lines.push(`${indentString}${argName} = ${value}`);
  }
  
  lines.push('}');
  
  return lines.join('\n');
}

/**
 * Create a code action to extract components to a new declare block
 */
function createExtractToNewDeclareAction(
  document: TextDocument,
  components: ComponentToExtract[]
): CodeAction {
  const content = document.getText();
  const indentInfo = detectIndentationStyle(content);
  
  // Generate a name for the declare block based on component names
  const componentNames = components.map(c => c.name.split('.').pop() || c.name);
  const declareName = componentNames.length === 1 
    ? `my_${componentNames[0]}`
    : `my_${componentNames.join('_')}`;

  // Generate the declare block
  const declareBlock = generateDeclareBlock(components, declareName, indentInfo.indentString);
  
  // Generate usage example
  const usageExample = generateUsageExample(declareName, components, indentInfo.indentString);
  
  // Find a good position to insert the declare block (at the beginning of the document)
  const insertPosition = Position.create(0, 0);
  const declareWithNewlines = declareBlock + '\n\n';
  
  // Replace the original components with the usage example
  const replaceEdits: TextEdit[] = [];
  
  if (components.length === 1) {
    // Single component: replace directly
    replaceEdits.push(TextEdit.replace(components[0].range, usageExample));
  } else {
    // Multiple components: replace first, delete others
    replaceEdits.push(TextEdit.replace(components[0].range, usageExample));
    for (let i = 1; i < components.length; i++) {
      // Delete the component and any trailing newline
      const deleteRange = Range.create(
        components[i].range.start,
        Position.create(components[i].range.end.line + 1, 0)
      );
      replaceEdits.push(TextEdit.del(deleteRange));
    }
  }

  const codeAction: CodeAction = {
    title: `Extract to new declare block "${declareName}"`,
    kind: CodeActionKind.Refactor,
    edit: {
      changes: {
        [document.uri]: [
          TextEdit.insert(insertPosition, declareWithNewlines),
          ...replaceEdits
        ]
      }
    }
  };

  return codeAction;
}

/**
 * Create a code action to extract components to an existing declare block
 */
function createExtractToExistingDeclareAction(
  document: TextDocument,
  components: ComponentToExtract[],
  existingDeclare: utils.ParsedConfigBlock
): CodeAction {
  if (!existingDeclare.label) {
    throw new Error('Existing declare block must have a label');
  }

  const content = document.getText();
  const indentInfo = detectIndentationStyle(content);

  // Collect all new arguments that need to be added
  const newArguments = new Set<string>();
  const argumentDetails: { [key: string]: { type: string; description: string } } = {};
  const argumentValues: { [key: string]: string } = {};

  for (const component of components) {
    // Add component arguments
    const requiredArgs = extractRequiredArguments(component.parsedComponent);
    for (const arg of requiredArgs) {
      newArguments.add(arg.name);
      argumentDetails[arg.name] = { type: arg.type, description: arg.description };
      // Try to get the original value from the component
      if (component.parsedComponent.args && component.parsedComponent.args[arg.name]) {
        argumentValues[arg.name] = component.parsedComponent.args[arg.name].value;
      } else {
        argumentValues[arg.name] = '""'; // Default empty value
      }
    }

    // Add external reference arguments (only from the component being extracted)
    const externalRefs = extractExternalReferences(component.content);
    for (const ref of externalRefs) {
      newArguments.add(ref.argName);
      argumentDetails[ref.argName] = {
        type: 'string',
        description: `Reference to ${ref.reference}`
      };
      argumentValues[ref.argName] = ref.reference; // Use the original reference as the default value (without quotes)
    }
  }

  // Find where to insert new arguments (after existing arguments)
  let argumentInsertPosition: Position;
  const lines = content.split('\n');

  // Find the last argument in the declare block
  let lastArgLine = existingDeclare.startLine + 1; // Start after the declare line
  for (let i = existingDeclare.startLine + 1; i < existingDeclare.endLine; i++) {
    const line = lines[i].trim();
    if (line.startsWith('argument ')) {
      lastArgLine = i;
    } else if (line.startsWith('export ') || !line || line.startsWith('//')) {
      // Continue looking
    } else {
      // Found something that's not an argument, stop here
      break;
    }
  }

  // Insert new arguments after the last existing argument
  const argumentEdits: TextEdit[] = [];
  if (newArguments.size > 0) {
    const newArgLines: string[] = [];
    for (const argName of Array.from(newArguments).sort()) {
      const argDetail = argumentDetails[argName];
      newArgLines.push(`${indentInfo.indentString}argument "${argName}" {`);
      newArgLines.push(`${indentInfo.indentString}${indentInfo.indentString}optional = false`);
      newArgLines.push(`${indentInfo.indentString}${indentInfo.indentString}type     = "${argDetail.type}"`);
      newArgLines.push(`${indentInfo.indentString}${indentInfo.indentString}comment  = "${argDetail.description}"`);
      newArgLines.push(`${indentInfo.indentString}}`);
      newArgLines.push('');
    }

    argumentInsertPosition = Position.create(lastArgLine + 1, 0);
    argumentEdits.push(TextEdit.insert(argumentInsertPosition, newArgLines.join('\n')));
  }

  // Add the extracted components to the existing declare block
  const transformedComponents: string[] = [];
  for (const component of components) {
    const transformedContent = transformComponentForDeclare(component);
    transformedComponents.push(transformedContent);
  }

  // Find insertion point within the existing declare block (before the closing brace)
  const declareEndLine = existingDeclare.range.end.line;
  const insertPosition = Position.create(declareEndLine, 0);
  const componentContent = transformedComponents.join('\n\n');
  const contentWithIndent = componentContent.split('\n')
    .map(line => line.trim() ? `${indentInfo.indentString}${line}` : '')
    .join('\n') + '\n\n';

  // Find all existing usages of the declare block and update them
  const usageEdits: TextEdit[] = [];
  const declareName = existingDeclare.label;

  if (declareName) {
    // Find all usages of this declare block
    const content = document.getText();
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Match component declarations that use the declared component
      const componentMatch = trimmed.match(/^([a-zA-Z_.][a-zA-Z0-9_.]*)\s*(?:"([^"]*)")?\s*\{/);
      if (componentMatch) {
        const componentName = componentMatch[1];
        const componentLabel = componentMatch[2];

        // Check if this is a usage of our declare block (not the declare block definition itself)
        if (componentName === declareName && componentLabel && !trimmed.startsWith('declare')) {
          // Find the end of the argument list (before the closing brace of the usage)
          let usageEndLine = i;
          let braceCount = 0;
          let foundOpenBrace = false;

          for (let j = i; j < lines.length; j++) {
            const usageLine = lines[j];
            const openBraces = (usageLine.match(/\{/g) || []).length;
            const closeBraces = (usageLine.match(/\}/g) || []).length;

            if (openBraces > 0) foundOpenBrace = true;
            braceCount += openBraces - closeBraces;

            if (foundOpenBrace && braceCount === 0) {
              usageEndLine = j;
              break;
            }
          }

          // Find the last argument in this usage
          let lastArgLine = i;
          for (let j = i + 1; j < usageEndLine; j++) {
            const usageLine = lines[j].trim();
            if (usageLine.includes('=')) {
              lastArgLine = j;
            } else if (usageLine === '}' || usageLine === '') {
              break;
            }
          }

          // Add new arguments to this usage
          if (newArguments.size > 0) {
            const newArgLines: string[] = [];
            for (const argName of Array.from(newArguments).sort()) {
              const defaultValue = argumentValues[argName] || '""';
              newArgLines.push(`${indentInfo.indentString}${argName} = ${defaultValue}`);
            }

            const usageInsertPosition = Position.create(lastArgLine + 1, 0);
            usageEdits.push(TextEdit.insert(usageInsertPosition, newArgLines.join('\n') + '\n'));
          }
        }
      }
    }
  }

  // Remove the original components (don't replace with usage example)
  const replaceEdits: TextEdit[] = [];

  for (const component of components) {
    // Delete the component and any trailing newline
    const deleteRange = Range.create(
      component.range.start,
      Position.create(component.range.end.line + 1, 0)
    );
    replaceEdits.push(TextEdit.del(deleteRange));
  }

  const codeAction: CodeAction = {
    title: `Extract to existing declare block "${existingDeclare.label}"`,
    kind: CodeActionKind.Refactor,
    edit: {
      changes: {
        [document.uri]: [
          ...argumentEdits,
          TextEdit.insert(insertPosition, contentWithIndent),
          ...usageEdits,
          ...replaceEdits
        ]
      }
    }
  };

  return codeAction;
}

export function provideExtractActions(
  params: CodeActionParams,
  documents: TextDocuments<TextDocument>
): CodeAction[] {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }

  const codeActions: CodeAction[] = [];
  
  // Only provide extract actions if there's a selection
  const range = params.range;
  if (range.start.line === range.end.line && range.start.character === range.end.character) {
    return []; // No selection
  }

  // Find components in the selected range
  const components = findComponentsInRange(document, range);
  if (components.length === 0) {
    return [];
  }

  // Action 1: Extract to new declare block
  const extractToNewAction = createExtractToNewDeclareAction(document, components);
  codeActions.push(extractToNewAction);

  // Action 2: Extract to existing declare blocks from workspace
  const existingDeclareBlocks: utils.ParsedConfigBlock[] = [];

  // Collect declare blocks from all workspace documents
  for (const doc of documents.all()) {
    const configBlocks = utils.parseConfigBlocks(doc);
    const declareBlocks = configBlocks.filter(
      block => block.type === 'declare' && block.label
    );
    existingDeclareBlocks.push(...declareBlocks);
  }

  for (const declareBlock of existingDeclareBlocks) {
    const extractToExistingAction = createExtractToExistingDeclareAction(
      document,
      components,
      declareBlock
    );
    codeActions.push(extractToExistingAction);
  }

  return codeActions;
}