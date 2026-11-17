import {
  CodeAction,
  CodeActionKind,
  CodeActionParams,
  TextDocuments,
  Position,
  TextEdit,
  Diagnostic,
  DiagnosticSeverity,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as utils from "./utils";
import { provideExtractActions } from "./extractBlockProvider";

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

function createAddMissingBlockAction(
  diagnostic: Diagnostic,
  blockName: string,
  document: TextDocument,
  componentName: string,
  allComponentData: Record<string, any>
): CodeAction | null {
  const componentData = allComponentData[componentName];
  if (!componentData || !utils.hasValidComponentData(componentData)) {
    return null;
  }

  // Access block structure the same way as completion provider
  const blockStructure = componentData.lsp_structure.blocks;
  if (!blockStructure || !blockStructure[blockName]) {
    return null;
  }

  const blockInfo = blockStructure[blockName];

  // Use shared component detection
  const content = document.getText();
  const lines = content.split('\n');

  // Find the target component using shared utilities - use position-aware function
  const parsedComponents = utils.parseAllComponents(document);
  const targetComponent = utils.findParsedComponentAtPosition(parsedComponents, diagnostic.range.start);

  if (!targetComponent) {
    return null;
  }

  // Check if this is a single-line component
  const isSingleLineComponent = targetComponent.startLine === targetComponent.endLine;
  const componentLine = lines[targetComponent.startLine];
  
  let blockIndentation = '';
  let insertLine = targetComponent.endLine; // Default to before closing brace
  let lastBlockEndLine = -1;

  if (isSingleLineComponent) {
    // For single-line components like "component "label" { }", we need to:
    // 1. Convert it to multi-line format
    // 2. Insert the new block inside
    const indentInfo = detectIndentationStyle(content);
    const componentLeadingWhitespace = componentLine.substring(0, componentLine.length - componentLine.trimStart().length);
    blockIndentation = componentLeadingWhitespace + indentInfo.indentString;
    
    // Check if the single line has any content between braces
    const openBraceIndex = componentLine.indexOf('{');
    const closeBraceIndex = componentLine.lastIndexOf('}');
    const betweenBraces = componentLine.substring(openBraceIndex + 1, closeBraceIndex).trim();
    
    if (betweenBraces === '') {
      // Empty single-line component: "component "label" { }"
      // We'll replace the entire line to make it multi-line
      insertLine = targetComponent.startLine;
    } else {
      // Single-line component with content: "component "label" { arg = value }"
      // Insert after the opening brace on the same line, but this is complex
      // For now, treat it as multi-line and insert at the end
      insertLine = targetComponent.endLine;
    }
  } else {
    // Multi-line component - original logic
    // First pass: find existing blocks and their indentation
    for (let i = targetComponent.startLine + 1; i < targetComponent.endLine; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      // Skip empty lines and comments
      if (trimmed === '' || trimmed.startsWith('//')) {
        continue;
      }

      // Check if this line contains a block declaration
      const blockMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_.]*)\s*(?:"([^"]*)")?\s*\{/);
      if (blockMatch) {
        // Found an existing block, use its indentation if we haven't set it yet
        if (!blockIndentation) {
          blockIndentation = line.substring(0, line.length - line.trimStart().length);
        }
        
        // Find the end of this block by counting braces
        let blockEndLine = i;
        let braceCount = 1; // Start with 1 for the opening brace
        for (let j = i + 1; j < targetComponent.endLine; j++) {
          const blockLine = lines[j];
          const openBraces = (blockLine.match(/\{/g) || []).length;
          const closeBraces = (blockLine.match(/\}/g) || []).length;
          braceCount += openBraces - closeBraces;
          
          if (braceCount === 0) {
            blockEndLine = j;
            break;
          }
        }
        
        // Keep track of the last block's end line
        lastBlockEndLine = Math.max(lastBlockEndLine, blockEndLine);
        
        // Skip to after this block to avoid processing its contents
        i = blockEndLine;
      }
    }

    // If we found blocks, insert after the last one
    if (lastBlockEndLine > -1) {
      insertLine = lastBlockEndLine + 1;
    } else {
      // No existing blocks found, look for component-level arguments
      for (let i = targetComponent.startLine + 1; i < targetComponent.endLine; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        
        // Skip empty lines and comments
        if (trimmed === '' || trimmed.startsWith('//')) {
          continue;
        }

        // Check if this line contains a component-level argument
        if (trimmed.includes('=') && !trimmed.includes('{') && !trimmed.includes('}')) {
          // Found an argument, use its indentation if we haven't set it yet
          if (!blockIndentation) {
            blockIndentation = line.substring(0, line.length - line.trimStart().length);
          }
          insertLine = Math.max(insertLine, i + 1);
        }
      }
    }

    // If no existing blocks or arguments found, use default indentation
    if (!blockIndentation) {
      const indentInfo = detectIndentationStyle(content);
      const componentLeadingWhitespace = componentLine.substring(0, componentLine.length - componentLine.trimStart().length);
      blockIndentation = componentLeadingWhitespace + indentInfo.indentString;
      insertLine = targetComponent.endLine;
    }
  }

  const indentInfo = detectIndentationStyle(content);
  const innerIndentation = blockIndentation + indentInfo.indentString;

  // Create block with required arguments only
  let blockContent: string;
  
  if (blockInfo.arguments && Array.isArray(blockInfo.arguments)) {
    const requiredArgs = blockInfo.arguments.filter((arg: any) => arg.required);
    if (requiredArgs.length > 0) {
      const argsContent = requiredArgs.map((arg: any) => `${innerIndentation}${arg.name} = ""`).join('\n');
      blockContent = `${blockIndentation}${blockName} {\n${argsContent}\n${blockIndentation}}\n`;
    } else {
      // No required arguments, create empty block
      blockContent = `${blockIndentation}${blockName} {\n${blockIndentation}}\n`;
    }
  } else {
    // No argument info available, create empty block
    blockContent = `${blockIndentation}${blockName} {\n${blockIndentation}}\n`;
  }

  let textEdits: TextEdit[];

  if (isSingleLineComponent && insertLine === targetComponent.startLine) {
    // Special handling for single-line components
    // We need to replace the single line with a multi-line version
    const openBraceIndex = componentLine.indexOf('{');
    const closeBraceIndex = componentLine.lastIndexOf('}');
    const beforeBrace = componentLine.substring(0, openBraceIndex + 1); // includes opening brace
    const betweenBraces = componentLine.substring(openBraceIndex + 1, closeBraceIndex).trim();
    const afterBrace = componentLine.substring(closeBraceIndex); // includes closing brace
    
    const componentLeadingWhitespace = componentLine.substring(0, componentLine.length - componentLine.trimStart().length);
    
    if (betweenBraces === '') {
      // Empty single-line component: "component "label" { }"
      // Replace with multi-line version that includes the new block
      const newComponentContent = `${beforeBrace}\n${blockContent}${componentLeadingWhitespace}${afterBrace}`;
      
      textEdits = [
        TextEdit.replace(
          {
            start: Position.create(targetComponent.startLine, 0),
            end: Position.create(targetComponent.endLine, componentLine.length)
          },
          newComponentContent
        )
      ];
    } else {
      // Single-line component with existing content: "component "label" { arg = value }"
      // Convert to multi-line and add the new block
      const existingArgsIndentation = componentLeadingWhitespace + indentInfo.indentString;
      const newComponentContent = `${beforeBrace}\n${existingArgsIndentation}${betweenBraces}\n${blockContent}${componentLeadingWhitespace}${afterBrace}`;
      
      textEdits = [
        TextEdit.replace(
          {
            start: Position.create(targetComponent.startLine, 0),
            end: Position.create(targetComponent.endLine, componentLine.length)
          },
          newComponentContent
        )
      ];
    }
  } else {
    // Multi-line component - insert at the calculated position
    const insertPosition = Position.create(insertLine, 0);
    textEdits = [TextEdit.insert(insertPosition, blockContent)];
  }

  const codeAction: CodeAction = {
    title: `Add missing required block '${blockName}'`,
    kind: CodeActionKind.QuickFix,
    diagnostics: [diagnostic],
    edit: {
      changes: {
        [document.uri]: textEdits
      }
    }
  };

  return codeAction;
}

async function createAddMissingArgumentAction(
  diagnostic: Diagnostic,
  argName: string,
  blockPath: string[],
  document: TextDocument,
  documents: TextDocuments<TextDocument>
): Promise<CodeAction | null> {
  const content = document.getText();
  const lines = content.split('\n');

  // Use the same component detection logic as completion provider  
  const allComponentData = utils.getCachedWorkspaceComponents(documents);
  if (Object.keys(allComponentData).length === 0) {
    // Fallback to builtin components only
    const builtinComponents = utils.getAllComponentData();
    if (Object.keys(builtinComponents).length === 0) {
      return null;
    }
    Object.assign(allComponentData, builtinComponents);
  }

  const componentName = utils.findComponentAtPosition(content, diagnostic.range.start, documents);

  if (!componentName) {
    return null;
  }

  const componentData = allComponentData[componentName];
  if (!utils.hasValidComponentData(componentData)) {
    return null;
  }

  // Find the target block using shared utilities
  const parsedComponents = utils.parseAllComponents(document);
  const targetComponent = utils.findParsedComponentAtPosition(parsedComponents, diagnostic.range.start);

  if (!targetComponent) {
    return null;
  }

  let targetBlock: any = null;
  let target = targetComponent;

  // If we have a block path, find the specific block
  if (blockPath.length > 0) {
    // Remove component name from path if present
    const relativeBlockPath = blockPath[0] === componentName
      ? blockPath.slice(1)
      : blockPath;

    if (relativeBlockPath.length > 0) {
      targetBlock = utils.findBlockByPath(targetComponent.blocks, relativeBlockPath);
      if (targetBlock) {
        target = targetBlock;
      }
    }
  }

  const targetStartLine = target.startLine;
  const targetEndLine = target.endLine;

  // Detect indentation style from the document
  const indentInfo = detectIndentationStyle(content);

  // Calculate indentation based on existing arguments in the block
  let indentation = '';
  if (targetBlock) {
    // For nested blocks, find existing arguments to determine indentation
    for (let i = target.startLine + 1; i <= target.endLine; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (trimmed.includes('=') && !trimmed.includes('{') && !trimmed.includes('}')) {
        // Found an existing argument, use its exact indentation
        indentation = line.substring(0, line.length - line.trimStart().length);
        break;
      }
    }
    // If no existing arguments found, use base indentation + detected increment
    if (!indentation) {
      const targetStartLineContent = lines[target.startLine];
      const baseIndentation = targetStartLineContent.substring(0, targetStartLineContent.length - targetStartLineContent.trimStart().length);
      indentation = baseIndentation + indentInfo.indentString;
    }
  } else {
    // For component-level arguments
    const targetStartLineContent = lines[target.startLine];
    const baseIndentation = targetStartLineContent.substring(0, targetStartLineContent.length - targetStartLineContent.trimStart().length);
    indentation = baseIndentation + indentInfo.indentString;
  }

  // Find where to insert the argument within the target
  let insertLine = targetStartLine + 1;
  let foundExistingArg = false;

  // Special handling for single-line blocks
  const targetLine = lines[targetStartLine];
  const isSingleLineBlock = targetStartLine === targetEndLine &&
                          targetLine.includes('{') && targetLine.includes('}');

  if (isSingleLineBlock) {
    // For single-line blocks like "trace_statements { }", insert before the closing brace
    const closeBraceIndex = targetLine.lastIndexOf('}');
    if (closeBraceIndex > 0) {
      // Insert at the same line, before the closing brace
      insertLine = targetStartLine;
      // Check if there are already arguments in the single-line block
      const beforeCloseBrace = targetLine.substring(0, closeBraceIndex).trim();
      if (beforeCloseBrace.includes('=')) {
        foundExistingArg = true;
      }
    }
  } else {
    // Multi-line block logic - always insert arguments at the first position
    for (let i = targetStartLine + 1; i <= targetEndLine; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip empty lines and comments at the beginning
      if (trimmed === '' || trimmed.startsWith('//')) {
        continue;
      }

      // Found the first non-empty, non-comment line - insert before it
      insertLine = i;
      break;
    }
  }

  // If we didn't find a good insertion point, insert at the beginning of the block
  if (insertLine <= targetStartLine && !isSingleLineBlock) {
    insertLine = targetStartLine + 1;
  }

  let insertPosition: Position;
  let argText: string;

  if (isSingleLineBlock && insertLine === targetStartLine) {
    // For single-line blocks, insert inline before the closing brace
    const targetLine = lines[targetStartLine];
    const closeBraceIndex = targetLine.lastIndexOf('}');
    const beforeCloseBrace = targetLine.substring(0, closeBraceIndex).trim();

    if (foundExistingArg && beforeCloseBrace.includes('=')) {
      // If there are already arguments, add a space and the new argument
      insertPosition = Position.create(insertLine, closeBraceIndex - 1);
      argText = ` ${argName} = ""`;
    } else {
      // If no arguments yet, add the first argument
      const openBraceIndex = targetLine.indexOf('{');
      insertPosition = Position.create(insertLine, openBraceIndex + 1);
      argText = ` ${argName} = ""`;
    }
  } else {
    // Multi-line block insertion
    insertPosition = Position.create(insertLine, 0);
    argText = `${indentation}${argName} = ""\n`;
  }

  const codeAction: CodeAction = {
    title: `Add missing required argument '${argName}'`,
    kind: CodeActionKind.QuickFix,
    diagnostics: [diagnostic],
    edit: {
      changes: {
        [document.uri]: [
          TextEdit.insert(insertPosition, argText)
        ]
      }
    }
  };

  return codeAction;
}

function createWrapInListAction(
  diagnostic: Diagnostic,
  document: TextDocument
): CodeAction | null {
  const content = document.getText();
  const lines = content.split('\n');
  
  // Get the diagnostic range
  const startLine = diagnostic.range.start.line;
  const line = lines[startLine];
  
  // Find the parameter assignment
  const assignmentMatch = line.match(/^\s*(\w+)\s*=\s*(.+)$/);
  if (!assignmentMatch) {
    return null;
  }
  
  const parameterName = assignmentMatch[1];
  let value = assignmentMatch[2].trim();
  
  // Remove inline comments from the value
  const commentIndex = value.search(/\s*(\/\/|#)/);
  if (commentIndex !== -1) {
    value = value.substring(0, commentIndex).trim();
  }
  
  // Only handle string values (quoted strings)
  if (!(value.startsWith('"') && value.endsWith('"')) && 
      !(value.startsWith("'") && value.endsWith("'"))) {
    return null;
  }
  
  // Find the exact position of the value in the line
  const equalsIndex = line.indexOf('=');
  let valueStart = equalsIndex + 1;
  while (valueStart < line.length && line[valueStart] === ' ') {
    valueStart++;
  }
  
  // Find the end of the value (before any comment)
  let valueEnd = line.length;
  if (commentIndex !== -1) {
    const actualCommentIndex = line.indexOf(value) + value.length;
    valueEnd = actualCommentIndex;
  }
  
  // Create the wrapped value
  const wrappedValue = `[${value}]`;
  
  const codeAction: CodeAction = {
    title: `Wrap '${parameterName}' value in list brackets`,
    kind: CodeActionKind.QuickFix,
    diagnostics: [diagnostic],
    edit: {
      changes: {
        [document.uri]: [
          TextEdit.replace(
            {
              start: Position.create(startLine, valueStart),
              end: Position.create(startLine, valueEnd)
            },
            wrappedValue
          )
        ]
      }
    }
  };

  return codeAction;
}

/**
 * Create code actions for adding missing arguments in declare block instantiations
 */
async function createAddMissingDeclareBlockArgumentsActions(
  document: TextDocument,
  cursorPosition: Position,
  documents: TextDocuments<TextDocument>
): Promise<CodeAction[]> {
  const actions: CodeAction[] = [];
  const content = document.getText();
  const lines = content.split('\n');
  
  // Check if cursor is in a declare block instantiation
  const declareInstanceInfo = findDeclareBlockInstantiation(document, cursorPosition);
  if (!declareInstanceInfo) {
    return actions;
  }
  
  const { declareBlockName, instanceRange } = declareInstanceInfo;
  
  // Find the declare block definition to get required arguments
  const declareBlockArgs = findDeclareBlockArguments(document, declareBlockName, documents);
  if (!declareBlockArgs || declareBlockArgs.size === 0) {
    return actions;
  }
  
  // Get existing arguments in this instantiation
  const existingArgs = new Set<string>();
  for (let lineIndex = instanceRange.start.line; lineIndex <= instanceRange.end.line; lineIndex++) {
    const line = lines[lineIndex];
    const argMatch = line.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*=/);
    if (argMatch) {
      existingArgs.add(argMatch[1]);
    }
  }
  
  // Create code actions for missing required arguments
  for (const [argName, argInfo] of declareBlockArgs.entries()) {
    if (argInfo.required && !existingArgs.has(argName)) {
      const action = createAddMissingDeclareBlockArgumentAction(
        document,
        argName,
        argInfo,
        instanceRange,
        declareBlockName
      );
      if (action) {
        actions.push(action);
      }
    }
  }
  
  return actions;
}

/**
 * Find declare block instantiation at cursor position
 */
function findDeclareBlockInstantiation(
  document: TextDocument,
  position: Position
): { declareBlockName: string; instanceRange: { start: Position; end: Position } } | null {
  const content = document.getText();
  const lines = content.split('\n');
  
  // First, identify all possible declare block instantiations (excluding declare blocks and argument blocks)
  const instantiations: Array<{ declareBlockName: string; startLine: number; endLine: number }> = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check if this line starts a potential declare block instantiation
    const instanceMatch = line.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s+"([^"]+)"\s*{/);
    if (instanceMatch) {
      const potentialDeclareBlockName = instanceMatch[1];
      
      // Skip declare blocks themselves and argument/export blocks
      if (potentialDeclareBlockName === 'declare' || 
          potentialDeclareBlockName === 'argument' || 
          potentialDeclareBlockName === 'export') {
        continue;
      }
      
      // Only consider single-word names (not dotted component names like prometheus.scrape)
      if (!potentialDeclareBlockName.includes('.')) {
        // Check if this matches a declare block defined in the document
        if (isDeclareBlockDefined(document, potentialDeclareBlockName)) {
          // Find the end of this block
          let braceCount = 1;
          let endLine = i;
          
          for (let j = i + 1; j < lines.length; j++) {
            const nextLine = lines[j];
            for (const char of nextLine) {
              if (char === '{') braceCount++;
              if (char === '}') braceCount--;
            }
            
            if (braceCount === 0) {
              endLine = j;
              break;
            }
          }
          
          instantiations.push({
            declareBlockName: potentialDeclareBlockName,
            startLine: i,
            endLine: endLine
          });
        }
      }
    }
  }
  
  // Find which instantiation contains the cursor position
  for (const instantiation of instantiations) {
    if (position.line >= instantiation.startLine && position.line <= instantiation.endLine) {
      return {
        declareBlockName: instantiation.declareBlockName,
        instanceRange: {
          start: { line: instantiation.startLine, character: 0 },
          end: { line: instantiation.endLine, character: lines[instantiation.endLine].length }
        }
      };
    }
  }
  
  return null;
}

/**
 * Check if a declare block is defined in the document or workspace
 */
function isDeclareBlockDefined(document: TextDocument, declareBlockName: string): boolean {
  const content = document.getText();
  const lines = content.split('\n');
  
  for (const line of lines) {
    const declareMatch = line.match(/^\s*declare\s+"([^"]+)"\s*{/);
    if (declareMatch && declareMatch[1] === declareBlockName) {
      return true;
    }
  }
  
  return false;
}

/**
 * Find arguments defined in a declare block
 */
function findDeclareBlockArguments(
  document: TextDocument,
  declareBlockName: string,
  documents?: TextDocuments<TextDocument>
): Map<string, { required: boolean; type?: string; description?: string }> | null {
  const argumentsMap = new Map<string, { required: boolean; type?: string; description?: string }>();
  
  // First try to find in the current document
  const found = findDeclareBlockArgumentsInDocument(document, declareBlockName, argumentsMap);
  if (found) {
    return argumentsMap;
  }
  
  // If not found in current document, search in other documents
  if (documents) {
    for (const doc of documents.all()) {
      if (doc.uri !== document.uri) {
        const found = findDeclareBlockArgumentsInDocument(doc, declareBlockName, argumentsMap);
        if (found) {
          return argumentsMap;
        }
      }
    }
  }
  
  return argumentsMap.size > 0 ? argumentsMap : null;
}

/**
 * Find arguments in a specific document
 */
function findDeclareBlockArgumentsInDocument(
  document: TextDocument,
  declareBlockName: string,
  argumentsMap: Map<string, { required: boolean; type?: string; description?: string }>
): boolean {
  const content = document.getText();
  const lines = content.split('\n');
  
  let inDeclareBlock = false;
  let braceCount = 0;
  let found = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (!inDeclareBlock) {
      const declareMatch = line.match(/^\s*declare\s+"([^"]+)"\s*{/);
      if (declareMatch && declareMatch[1] === declareBlockName) {
        inDeclareBlock = true;
        braceCount = 1;
        found = true;
        continue;
      }
    } else {
      // Count braces
      for (const char of line) {
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
      }
      
      // Exit declare block
      if (braceCount === 0) {
        break;
      }
      
      // Parse argument declarations
      const argMatch = line.match(/^\s*argument\s+"([^"]+)"\s*{/);
      if (argMatch) {
        const argName = argMatch[1];
        
        // Look for optional/required settings in the next few lines
        let isRequired = true; // Default to required
        let argType = 'string'; // Default type
        let description = '';
        
        // Parse argument block content
        for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
          const argLine = lines[j];
          if (argLine.trim() === '}') break;
          
          if (argLine.includes('optional = true')) {
            isRequired = false;
          }
          if (argLine.includes('required = false')) {
            isRequired = false;
          }
          
          const commentMatch = argLine.match(/comment\s*=\s*"([^"]+)"/);
          if (commentMatch) {
            description = commentMatch[1];
          }
        }
        
        argumentsMap.set(argName, {
          required: isRequired,
          type: argType,
          description: description
        });
      }
    }
  }
  
  return found;
}

/**
 * Create code action for adding a missing declare block argument
 */
function createAddMissingDeclareBlockArgumentAction(
  document: TextDocument,
  argName: string,
  argInfo: { required: boolean; type?: string; description?: string },
  instanceRange: { start: Position; end: Position },
  declareBlockName: string
): CodeAction | null {
  const content = document.getText();
  const lines = content.split('\n');
  
  // Determine indentation from existing content
  const indentInfo = detectIndentationStyle(content);
  let indentation = indentInfo.indentString;
  
  // Find existing indentation in this instance
  for (let i = instanceRange.start.line + 1; i < instanceRange.end.line; i++) {
    const line = lines[i];
    if (line.trim() && line.includes('=')) {
      const leadingWhitespace = line.substring(0, line.length - line.trimStart().length);
      if (leadingWhitespace.length > 0) {
        indentation = leadingWhitespace;
        break;
      }
    }
  }
  
  // Find the best insertion point (before the closing brace)
  let insertLine = instanceRange.end.line;
  let insertPosition: Position;
  
  // Look for the last assignment line to insert after
  for (let i = instanceRange.end.line - 1; i > instanceRange.start.line; i--) {
    const line = lines[i];
    if (line.trim() && line.includes('=') && !line.trim().startsWith('//')) {
      insertLine = i + 1;
      break;
    }
  }
  
  // If no existing assignments, insert after the opening line
  if (insertLine === instanceRange.end.line) {
    insertLine = instanceRange.start.line + 1;
  }
  
  insertPosition = Position.create(insertLine, 0);
  
  // Generate appropriate default value based on argument type
  let defaultValue = '""'; // Default to empty string
  if (argInfo.type) {
    switch (argInfo.type) {
      case 'bool':
      case 'boolean':
        defaultValue = 'false';
        break;
      case 'number':
      case 'int':
      case 'integer':
        defaultValue = '0';
        break;
      case 'duration':
        defaultValue = '"5m"';
        break;
      case 'MetricsReceiver':
      case 'LogsReceiver':
      case 'TraceReceiver':
        defaultValue = '[]'; // Receiver types are typically arrays
        break;
    }
  }
  
  const argText = `${indentation}${argName} = ${defaultValue}\n`;
  
  const codeAction: CodeAction = {
    title: `Add missing argument '${argName}' to ${declareBlockName}`,
    kind: CodeActionKind.QuickFix,
    edit: {
      changes: {
        [document.uri]: [
          TextEdit.insert(insertPosition, argText)
        ]
      }
    }
  };
  
  return codeAction;
}

function createRemoveUnknownAction(
  diagnostic: Diagnostic,
  document: TextDocument
): CodeAction {
  const codeAction: CodeAction = {
    title: `Remove unknown ${diagnostic.message.includes('argument') ? 'argument' : 'block'}`,
    kind: CodeActionKind.QuickFix,
    diagnostics: [diagnostic],
    edit: {
      changes: {
        [document.uri]: [
          TextEdit.del(diagnostic.range)
        ]
      }
    }
  };

  return codeAction;
}

export async function provideCodeActions(
  params: CodeActionParams,
  documents: TextDocuments<TextDocument>
): Promise<CodeAction[]> {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }

  const codeActions: CodeAction[] = [];
  const content = document.getText();

  // Use the same component data source as completion provider
  const allComponentData = utils.getCachedWorkspaceComponents(documents);
  if (Object.keys(allComponentData).length === 0) {
    // Fallback to builtin components only
    const builtinComponents = utils.getAllComponentData();
    if (Object.keys(builtinComponents).length === 0) {
      return [];
    }
    Object.assign(allComponentData, builtinComponents);
  }

  // Add extract actions (refactoring actions)
  const extractActions = provideExtractActions(params, documents);
  codeActions.push(...extractActions);

  // Get diagnostics for this document
  const diagnostics = params.context.diagnostics;

  // PROACTIVE CODE ACTIONS: Check for missing required arguments at cursor position
  const cursorPosition = params.range.start;
  const componentName = utils.findComponentAtPosition(content, cursorPosition, documents);
  
  // Check for declare block instantiation (custom components)
  try {
    const declareBlockActions = await createAddMissingDeclareBlockArgumentsActions(document, cursorPosition, documents);
    codeActions.push(...declareBlockActions);
  } catch (error) {
    console.error(`[CodeAction] Error in declare block actions: ${error}`);
  }
  
  if (componentName) {
    const componentData = allComponentData[componentName];
    if (utils.hasValidComponentData(componentData)) {
      // Find the current component instance (including those inside declare blocks)
      const parsedComponents = utils.parseAllComponents(document);
      const currentComponent = utils.findParsedComponentAtPosition(parsedComponents, cursorPosition);
      
      if (currentComponent) {
        // Check for missing required arguments
        const requiredArgs = componentData.lsp_structure.arguments;
        if (requiredArgs) {
          // Get existing arguments in this component instance
          const existingArgs = new Set<string>();
          const lines = content.split('\n');
          
          // Parse arguments in this component instance
          for (let lineIndex = currentComponent.startLine; lineIndex <= currentComponent.endLine; lineIndex++) {
            const line = lines[lineIndex];
            const argMatch = line.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*=/);
            if (argMatch) {
              existingArgs.add(argMatch[1]);
            }
          }
          
          // Create code actions for missing required arguments
          for (const [argName, argInfo] of Object.entries(requiredArgs)) {
            if ((argInfo as any).required && !existingArgs.has(argName)) {
              // Create a synthetic diagnostic for the code action
              const syntheticDiagnostic: Diagnostic = {
                severity: DiagnosticSeverity.Error,
                range: {
                  start: { line: currentComponent.startLine, character: 0 },
                  end: { line: currentComponent.startLine, character: 1 }
                },
                message: `Missing required argument '${argName}' in ${componentName}`,
                source: "alloy-lsp"
              };
              
              const action = await createAddMissingArgumentAction(
                syntheticDiagnostic,
                argName,
                [], // Component-level argument
                document,
                documents
              );
              if (action) {
                // Remove diagnostic reference since this is a proactive action
                action.diagnostics = undefined;
                action.title = `Add required argument '${argName}'`;
                codeActions.push(action);
              }
            }
          }
        }
      }
    }
  }

  for (const diagnostic of diagnostics) {
    // Provide code actions for error and warning diagnostics
    if (diagnostic.severity !== DiagnosticSeverity.Error && 
        diagnostic.severity !== DiagnosticSeverity.Warning) {
      continue;
    }

    // Use the same component detection logic as completion provider
    const componentName = utils.findComponentAtPosition(content, diagnostic.range.start, documents);

    if (!componentName) {
      continue;
    }

    const componentData = allComponentData[componentName];
    if (!utils.hasValidComponentData(componentData)) {
      continue;
    }

    // Handle missing required block
    if (diagnostic.message.includes('Missing required block')) {
      const blockMatch = diagnostic.message.match(/Missing required block '([^']+)'/);
      if (blockMatch) {
        const blockName = blockMatch[1];
        const action = createAddMissingBlockAction(
          diagnostic,
          blockName,
          document,
          componentName,
          allComponentData
        );
        if (action) {
          codeActions.push(action);
        }
      }
    }

    // Handle missing required argument
    else if (diagnostic.message.includes('Missing required argument')) {
      const argMatch = diagnostic.message.match(/Missing required argument '([^']+)' in ([^\s]+)/);
      if (argMatch) {
        const argName = argMatch[1];
        const contextName = argMatch[2];

        // Parse the block path from the context name
        // Context name is a dotted path like "otelcol.processor.transform.trace_statements"
        const blockPath = contextName.split('.');

        // For component-level arguments, the path should be empty
        const finalBlockPath = contextName === 'component' ? [] : blockPath;

        const action = await createAddMissingArgumentAction(
          diagnostic,
          argName,
          finalBlockPath,
          document,
          documents
        );
        if (action) {
          codeActions.push(action);
        }
      }
    }

    // Handle type mismatch: string to list conversion
    else if (diagnostic.message.includes('Type mismatch') && 
             diagnostic.message.includes('expected \'list(') && 
             diagnostic.message.includes('but got \'string\'')) {
      const action = createWrapInListAction(diagnostic, document);
      if (action) {
        codeActions.push(action);
      }
    }

    // Handle unknown argument or block
    else if (diagnostic.message.includes('Unknown argument') ||
             diagnostic.message.includes('Unknown block')) {
      const action = createRemoveUnknownAction(diagnostic, document);
      codeActions.push(action);
    }
  }

  return codeActions;
}