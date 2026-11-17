"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prepareRename = prepareRename;
exports.provideRename = provideRename;
const node_1 = require("vscode-languageserver/node");
const utils = require("./utils");
/**
 * Find the word/reference under the cursor position
 * Also determines which part of a dotted reference the cursor is on
 */
function getWordAtPosition(document, position) {
    const line = document.getText(node_1.Range.create(node_1.Position.create(position.line, 0), node_1.Position.create(position.line + 1, 0)));
    const character = position.character;
    if (character >= line.length)
        return null;
    // Find word boundaries for component references (including dots and underscores)
    let start = character;
    let end = character;
    // Move start backwards to find the beginning of the word/reference
    while (start > 0 && /[a-zA-Z0-9_.]/.test(line[start - 1])) {
        start--;
    }
    // Move end forwards to find the end of the word/reference
    while (end < line.length && /[a-zA-Z0-9_.]/.test(line[end])) {
        end++;
    }
    if (start === end)
        return null;
    const word = line.substring(start, end);
    const range = node_1.Range.create(node_1.Position.create(position.line, start), node_1.Position.create(position.line, end));
    // For dotted references, determine which part the cursor is on
    let cursorPart;
    let cursorPartRange;
    if (word.includes('.')) {
        const parts = word.split('.');
        let currentPos = start;
        for (const part of parts) {
            const partStart = currentPos;
            const partEnd = currentPos + part.length;
            if (character >= partStart && character <= partEnd) {
                cursorPart = part;
                cursorPartRange = node_1.Range.create(node_1.Position.create(position.line, partStart), node_1.Position.create(position.line, partEnd));
                break;
            }
            currentPos = partEnd + 1; // +1 for the dot
        }
    }
    return { word, range, cursorPart, cursorPartRange };
}
/**
 * Check if a position is renameable (component labels, declare block names, argument names)
 */
function isRenameableSymbol(document, position) {
    try {
        const content = document.getText();
        const lines = content.split('\n');
        if (position.line < 0 || position.line >= lines.length)
            return null;
        const currentLine = lines[position.line];
        if (!currentLine || position.character < 0 || position.character >= currentLine.length)
            return null;
        // Check for component label in quotes: component_name "label" {
        const componentLabelMatch = currentLine.match(/^(\s*)([a-zA-Z_.][a-zA-Z0-9_.]*)\s+"([^"]+)"\s*\{/);
        if (componentLabelMatch) {
            const label = componentLabelMatch[3];
            // Find the exact position of the quoted label in the line
            const quotePattern = `"${label}"`;
            const quoteIndex = currentLine.indexOf(quotePattern);
            if (quoteIndex !== -1) {
                const labelStart = quoteIndex;
                const labelEnd = quoteIndex + quotePattern.length;
                if (position.character >= labelStart && position.character <= labelEnd) {
                    return {
                        type: 'component-label',
                        name: label,
                        range: node_1.Range.create(node_1.Position.create(position.line, quoteIndex + 1), // +1 to skip opening quote
                        node_1.Position.create(position.line, quoteIndex + label.length + 1) // +1 for opening quote
                        )
                    };
                }
            }
        }
        // Check for declare block name: declare "component_name" {
        const declareMatch = currentLine.match(/^(\s*)declare\s+"([^"]+)"\s*\{/);
        if (declareMatch) {
            const indentation = declareMatch[1];
            const declareName = declareMatch[2];
            // Find the exact position of the quoted string in the line
            const quotePattern = `"${declareName}"`;
            const quoteIndex = currentLine.indexOf(quotePattern);
            if (quoteIndex !== -1) {
                const declareStart = quoteIndex;
                const declareEnd = quoteIndex + quotePattern.length;
                // Check if cursor is within the declare keyword or quoted name
                const declareKeywordStart = indentation.length;
                const declareKeywordEnd = declareKeywordStart + 7; // length of "declare"
                if ((position.character >= declareKeywordStart && position.character <= declareKeywordEnd) ||
                    (position.character >= declareStart && position.character <= declareEnd)) {
                    return {
                        type: 'declare-name',
                        name: declareName,
                        range: node_1.Range.create(node_1.Position.create(position.line, quoteIndex + 1), // +1 to skip opening quote
                        node_1.Position.create(position.line, quoteIndex + declareName.length + 1) // +1 for opening quote
                        )
                    };
                }
            }
        }
        // Check for argument declaration: argument "argument_name" {
        const argumentMatch = currentLine.match(/^(\s*)argument\s+"([^"]+)"\s*\{/);
        if (argumentMatch) {
            const indentation = argumentMatch[1];
            const argumentName = argumentMatch[2];
            // Find the exact position of the quoted string in the line
            const quotePattern = `"${argumentName}"`;
            const quoteIndex = currentLine.indexOf(quotePattern);
            if (quoteIndex !== -1) {
                // Check if cursor is within the argument keyword or quoted name
                const argKeywordStart = indentation.length;
                const argKeywordEnd = argKeywordStart + 8; // length of "argument"
                const argStart = quoteIndex;
                const argEnd = quoteIndex + quotePattern.length;
                if ((position.character >= argKeywordStart && position.character <= argKeywordEnd) ||
                    (position.character >= argStart && position.character <= argEnd)) {
                    return {
                        type: 'argument-name',
                        name: argumentName,
                        range: node_1.Range.create(node_1.Position.create(position.line, quoteIndex + 1), // +1 to skip opening quote
                        node_1.Position.create(position.line, quoteIndex + argumentName.length + 1) // +1 for opening quote
                        )
                    };
                }
            }
        }
        return null;
    }
    catch (error) {
        return null;
    }
}
/**
 * Find the scope (declare block name) for a given position in the document
 */
function findScopeAtPosition(document, position) {
    const configBlocks = utils.parseConfigBlocks(document);
    
    for (const block of configBlocks) {
        if (block.type === 'declare' && block.label) {
            // Check if position is within this declare block
            if (position.line >= block.range.start.line && position.line <= block.range.end.line) {
                return block.label;
            }
        }
    }
    
    return 'root'; // Default to root scope
}

/**
 * Find all references to a component label across the document, filtered by scope
 */
function findComponentLabelReferences(document, componentName, labelName, targetScope) {
    const allComponentData = utils.getCachedWorkspaceComponents({ all: () => [document] });
    
    // Get all component declarations from the document
    const allComponentDeclarations = utils.getAllComponentDeclarations(document);
    const references = [];
    
    // Find component declarations with this label in the same scope
    for (const decl of allComponentDeclarations) {
        if (decl.componentType === componentName && decl.label === labelName) {
            // Only include declarations from the same scope
            const declScope = decl.scope || 'root';
            if (!targetScope || declScope === targetScope) {
                references.push(node_1.Range.create(
                    node_1.Position.create(decl.line, decl.range.label.start),
                    node_1.Position.create(decl.line, decl.range.label.end)
                ));
            }
        }
    }

    // Find all component references using the centralized function
    const allReferences = utils.findAllComponentReferences(document, allComponentData);
    for (const ref of allReferences) {
        if (ref.component === componentName && ref.label && ref.label === labelName) {
            // Only include references from the same scope
            const refScope = ref.scope || 'root';
            if (!targetScope || refScope === targetScope) {
                // Add the label part of the reference
                const labelStart = ref.range.start.character + ref.component.length + 1; // +1 for the dot
                const labelEnd = labelStart + ref.label.length;
                references.push(node_1.Range.create(
                    node_1.Position.create(ref.range.start.line, labelStart),
                    node_1.Position.create(ref.range.start.line, labelEnd)
                ));
            }
        }
    }

    return references;
}
/**
 * Find all references to a declared component name
 */
function findDeclareNameReferences(document, declareName) {
    const content = document.getText();
    const lines = content.split('\n');
    const references = [];
    // Safety limit to prevent excessive processing
    const maxLines = Math.min(lines.length, 10000);
    for (let i = 0; i < maxLines; i++) {
        const line = lines[i];
        // Find declare declaration
        const declareDeclarationRegex = new RegExp(`^(\\s*)declare\\s+"${declareName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*\\{`);
        const declMatch = line.match(declareDeclarationRegex);
        if (declMatch) {
            const indentation = declMatch[1];
            const declareStart = indentation.length + 'declare '.length + 1; // +1 for opening quote
            references.push(node_1.Range.create(node_1.Position.create(i, declareStart), node_1.Position.create(i, declareStart + declareName.length)));
        }
        // Find component usage of declared component
        // Use simpler regex to avoid catastrophic backtracking
        const simpleUsagePattern = `^(\\s*)${declareName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s`;
        if (line.match(new RegExp(simpleUsagePattern))) {
            // Verify this is actually a component usage by checking for opening brace
            if (line.includes('{')) {
                const indentMatch = line.match(/^(\s*)/);
                if (indentMatch) {
                    const indentation = indentMatch[1];
                    const componentStart = indentation.length;
                    references.push(node_1.Range.create(node_1.Position.create(i, componentStart), node_1.Position.create(i, componentStart + declareName.length)));
                }
            }
        }
        // Find references in component outputs/inputs (like my_component.output)
        // Use safer approach without global regex exec loop
        const declareDeclarationRegex2 = new RegExp(`^(\\s*)declare\\s+"${declareName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*\\{`);
        const isDeclareMatch = line.match(declareDeclarationRegex2);
        const isUsageMatch = line.match(new RegExp(simpleUsagePattern));
        if (!isDeclareMatch && !isUsageMatch) {
            // Look for the component name as a word boundary
            const escapedName = declareName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const wordBoundaryRegex = new RegExp(`\\b${escapedName}\\b`);
            const match = line.match(wordBoundaryRegex);
            if (match) {
                const matchIndex = line.indexOf(declareName);
                if (matchIndex !== -1) {
                    references.push(node_1.Range.create(node_1.Position.create(i, matchIndex), node_1.Position.create(i, matchIndex + declareName.length)));
                }
            }
        }
    }
    return references;
}
/**
 * Find all references to an argument name within declare blocks
 */
function findArgumentNameReferences(document, argumentName) {
    const content = document.getText();
    const lines = content.split('\n');
    const references = [];
    // First, find which declare block contains this argument
    const configBlocks = utils.parseConfigBlocks(document);
    let parentDeclareBlock = null;
    for (const configBlock of configBlocks) {
        if (configBlock.type === 'declare' && configBlock.blocks) {
            for (const block of configBlock.blocks) {
                if (block.name === 'argument' && block.label === argumentName) {
                    parentDeclareBlock = configBlock;
                    break;
                }
            }
            if (parentDeclareBlock)
                break;
        }
    }
    if (!parentDeclareBlock)
        return references;
    // Safety limit to prevent excessive processing
    const maxLines = Math.min(lines.length, 10000);
    for (let i = 0; i < maxLines; i++) {
        const line = lines[i];
        // Find argument declaration: argument "argument_name" {
        const argumentDeclarationRegex = new RegExp(`^(\\s*)argument\\s+"${argumentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*\\{`);
        const argMatch = line.match(argumentDeclarationRegex);
        if (argMatch) {
            const indentation = argMatch[1];
            const argStart = indentation.length + 'argument '.length + 1; // +1 for opening quote
            references.push(node_1.Range.create(node_1.Position.create(i, argStart), node_1.Position.create(i, argStart + argumentName.length)));
        }
        // Find argument usage as var.argument_name or just argument_name
        // Use safer approach to avoid infinite loops
        if (!line.match(argumentDeclarationRegex)) {
            // Look for var.argumentName pattern
            const varPattern = `var.${argumentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`;
            let varIndex = line.indexOf(varPattern);
            if (varIndex !== -1) {
                const argIndex = varIndex + 4; // +4 to skip "var."
                references.push(node_1.Range.create(node_1.Position.create(i, argIndex), node_1.Position.create(i, argIndex + argumentName.length)));
            }
            // Look for standalone argument name (but not inside var.argumentName)
            const escapedArgName = argumentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const standaloneRegex = new RegExp(`\\b${escapedArgName}\\b`);
            const standaloneMatch = line.match(standaloneRegex);
            if (standaloneMatch && !line.includes(`var.${argumentName}`)) {
                const argIndex = line.indexOf(argumentName);
                if (argIndex !== -1) {
                    references.push(node_1.Range.create(node_1.Position.create(i, argIndex), node_1.Position.create(i, argIndex + argumentName.length)));
                }
            }
        }
    }
    return references;
}
function prepareRename(params, documents) {
    try {
        const document = documents.get(params.textDocument.uri);
        if (!document) {
            return null;
        }
        const renameInfo = isRenameableSymbol(document, params.position);
        if (!renameInfo || !renameInfo.type || !renameInfo.name || !renameInfo.range) {
            return null;
        }
        // Validate that the range is valid
        const range = renameInfo.range;
        if (range.start.line < 0 || range.start.character < 0 ||
            range.end.line < 0 || range.end.character < 0) {
            return null;
        }
        // Ensure range ordering is correct
        if (range.end.line < range.start.line ||
            (range.end.line === range.start.line && range.end.character < range.start.character)) {
            return null;
        }
        // Validate range is within document bounds
        const lineCount = document.lineCount;
        if (range.start.line >= lineCount || range.end.line >= lineCount) {
            return null;
        }
        // Basic validation - ensure range is reasonable
        if (range.start.character < 0 || range.end.character < 0 ||
            range.start.character >= range.end.character) {
            return null;
        }
        return {
            range: renameInfo.range,
            placeholder: renameInfo.name
        };
    }
    catch (error) {
        // Return null to indicate rename not possible
        return null;
    }
}
function provideRename(params, documents) {
    try {
        const document = documents.get(params.textDocument.uri);
        if (!document) {
            return null;
        }
        // Validate parameters
        if (!params.newName || !params.newName.trim()) {
            return null;
        }
        const renameInfo = isRenameableSymbol(document, params.position);
        if (!renameInfo || !renameInfo.type || !renameInfo.name) {
            return null;
        }
        const changes = {};
        let references = [];
        switch (renameInfo.type) {
            case 'component-label':
                // Find the component name for this label
                const content = document.getText();
                const componentName = utils.findComponentAtPosition(content, params.position);
                if (componentName) {
                    // Determine the scope of the component being renamed
                    const targetScope = findScopeAtPosition(document, params.position);
                    references = findComponentLabelReferences(document, componentName, renameInfo.name, targetScope);
                }
                break;
            case 'declare-name':
                references = findDeclareNameReferences(document, renameInfo.name);
                break;
            case 'argument-name':
                references = findArgumentNameReferences(document, renameInfo.name);
                break;
            case 'component-reference':
                // For component references like "otelcol.processor.transform.default.input", 
                // we need to find the component name and label
                const wordAtPos = getWordAtPosition(document, params.position);
                if (wordAtPos) {
                    const parts = wordAtPos.word.split('.');
                    if (parts.length >= 2) {
                        const allComponents = utils.getAllAvailableComponents(document);
                        const componentNames = Object.keys(allComponents).sort((a, b) => b.length - a.length);
                        for (const compName of componentNames) {
                            if (wordAtPos.word.startsWith(compName + '.')) {
                                const remaining = wordAtPos.word.substring(compName.length + 1);
                                const remainingParts = remaining.split('.');
                                if (remainingParts.length >= 1) {
                                    // The first part after the component name is the label
                                    const labelPart = remainingParts[0];
                                    // Only rename if cursor is on the label part
                                    if (wordAtPos.cursorPart === labelPart) {
                                        const targetScope = findScopeAtPosition(document, params.position);
                                        references = findComponentLabelReferences(document, compName, labelPart, targetScope);
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
                break;
            default:
                return null;
        }
        if (references.length === 0) {
            return null;
        }
        // Validate all ranges before creating text edits
        const validReferences = references.filter(range => range.start.line >= 0 && range.start.character >= 0 &&
            range.end.line >= 0 && range.end.character >= 0 &&
            range.end.line >= range.start.line &&
            (range.end.line > range.start.line || range.end.character >= range.start.character));
        if (validReferences.length === 0) {
            return null;
        }
        // Safety limit to prevent excessive edits
        const maxReferences = Math.min(validReferences.length, 1000);
        const limitedReferences = validReferences.slice(0, maxReferences);
        // Note: Limited references for performance if needed
        // Create text edits for all valid references
        const textEdits = limitedReferences.map(range => node_1.TextEdit.replace(range, params.newName.trim()));
        if (textEdits.length === 0) {
            return null;
        }
        changes[document.uri] = textEdits;
        // Final validation of the WorkspaceEdit
        const workspaceEdit = { changes };
        // Ensure we have at least one change
        if (!workspaceEdit.changes || Object.keys(workspaceEdit.changes).length === 0) {
            return null;
        }
        // Ensure all changes have valid text edits
        for (const edits of Object.values(workspaceEdit.changes)) {
            if (!edits || edits.length === 0) {
                return null;
            }
            // Validate each text edit
            for (const edit of edits) {
                if (!edit.range || !edit.hasOwnProperty('newText')) {
                    return null;
                }
                // Ensure newText is a string
                if (typeof edit.newText !== 'string') {
                    return null;
                }
                // Ensure range has proper structure
                const r = edit.range;
                if (!r.start || !r.end ||
                    typeof r.start.line !== 'number' || typeof r.start.character !== 'number' ||
                    typeof r.end.line !== 'number' || typeof r.end.character !== 'number') {
                    return null;
                }
            }
        }
        return workspaceEdit;
    }
    catch (error) {
        // Return null to indicate rename failed
        return null;
    }
}
