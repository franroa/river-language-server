"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.provideCompletions = provideCompletions;
var node_1 = require("vscode-languageserver/node");
var utils_1 = require("./utils");
var parser_1 = require("./parser");
function provideAllComponentsCompletion(allComponentData, content, position) {
    var mainLines = content.split("\n");
    if (position.line >= mainLines.length) {
        return [];
    }
    var mainLine = mainLines[position.line];
    var mainTextBeforeCursor = mainLine.substring(0, position.character);
    var mainCurrentWord = parser_1.alloyParser.getCurrentWord(mainTextBeforeCursor);
    // Check if we should provide component completion
    var shouldProvideCompletion = (function () {
        // Always provide at line start or after whitespace
        var isAtLineStart = /^\s*$/.test(mainTextBeforeCursor);
        var isAfterWhitespace = /\s$/.test(mainTextBeforeCursor);
        if (isAtLineStart || isAfterWhitespace) {
            return true;
        }
        // Provide completion if current word is a prefix of any component
        if (mainCurrentWord) {
            for (var _i = 0, _a = Object.keys(allComponentData); _i < _a.length; _i++) {
                var componentName = _a[_i];
                if (componentName.startsWith(mainCurrentWord)) {
                    return true;
                }
            }
        }
        // Provide completion if we're typing and the last character is a trigger
        var lastChar = mainTextBeforeCursor.slice(-1);
        var triggerChars = __spreadArray([], new Set(Object.keys(allComponentData).join("").split("").concat(["."])), true);
        if (triggerChars.includes(lastChar)) {
            return true;
        }
        return false;
    })();
    if (!shouldProvideCompletion) {
        return [];
    }
    // Create completion items for all available components
    var completions = [];
    for (var _i = 0, _a = Object.entries(allComponentData); _i < _a.length; _i++) {
        var _b = _a[_i], componentName = _b[0], componentData = _b[1];
        var completionItem = {
            label: componentName,
            kind: node_1.CompletionItemKind.Class,
            detail: "".concat(componentName, " component"),
            documentation: {
                kind: "markdown",
                value: componentData.usage,
            },
            insertText: componentData.template || componentName,
            insertTextFormat: node_1.InsertTextFormat.Snippet,
            filterText: componentName,
            sortText: "0001", // High priority
        };
        completions.push(completionItem);
    }
    return completions;
}
function getBlockSpecificCompletions(blockPath, componentData, currentWord, componentName, currentLine) {
    var _a, _b;
    var completions = [];
    var blockStructure = utils_1.componentParser.getBlockStructure(componentName);
    if (!blockStructure) {
        return completions;
    }
    // Filter completions based on current word being typed
    var filterByWord = function (label) {
        return !currentWord || label.toLowerCase().startsWith(currentWord.toLowerCase());
    };
    // Check if we're on a block declaration line
    var isOnBlockDeclaration = currentLine && currentLine.trim().match(/^([^\s"]+)(?:\s+"[^"]*")?\s*\{/);
    var currentBlockName = isOnBlockDeclaration ? isOnBlockDeclaration[1] : null;
    // Navigate to current block in structure to get arguments and nested blocks
    var currentBlock = blockStructure;
    // Handle the case where we're at the root level (component level)
    if (blockPath.length === 0 || (blockPath.length === 1 && blockPath[0] === componentName)) {
        // At root level, show top-level blocks
        for (var _i = 0, _c = Object.keys(blockStructure); _i < _c.length; _i++) {
            var blockName = _c[_i];
            // Don't show the current block if we're on its declaration line
            if (currentBlockName === blockName) {
                continue;
            }
            if (filterByWord(blockName)) {
                var blockInfo = blockStructure[blockName];
                var isRequired = ((_a = componentData.lsp_structure.required_blocks) === null || _a === void 0 ? void 0 : _a.includes(blockName)) || (blockInfo === null || blockInfo === void 0 ? void 0 : blockInfo.required);
                completions.push({
                    label: blockName,
                    kind: node_1.CompletionItemKind.Class,
                    detail: "".concat(blockName, " block").concat(isRequired ? " (required)" : ""),
                    documentation: {
                        kind: "markdown",
                        value: (blockInfo === null || blockInfo === void 0 ? void 0 : blockInfo.description) || "Configure ".concat(blockName, " settings"),
                    },
                    insertText: "".concat(blockName, " {\n  $0\n}"),
                    insertTextFormat: node_1.InsertTextFormat.Snippet,
                    sortText: isRequired ? "0001" : "0002",
                });
            }
        }
        return completions;
    }
    // Find the current block by following the path
    var pathToFollow = blockPath.slice(); // Copy the path
    if (pathToFollow[0] === componentName) {
        pathToFollow = pathToFollow.slice(1); // Remove component name from path
    }
    for (var _d = 0, pathToFollow_1 = pathToFollow; _d < pathToFollow_1.length; _d++) {
        var pathSegment = pathToFollow_1[_d];
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
        for (var _e = 0, _f = currentBlock.arguments; _e < _f.length; _e++) {
            var arg = _f[_e];
            if (filterByWord(arg.name)) {
                var completion = {
                    label: arg.name,
                    kind: node_1.CompletionItemKind.Property,
                    detail: "".concat(arg.type).concat(arg.required ? " (required)" : ""),
                    documentation: {
                        kind: "markdown",
                        value: arg.description +
                            (arg.default ? "\n\n**Default:** ".concat(arg.default) : ""),
                    },
                    insertText: "".concat(arg.name, " = "),
                    sortText: arg.required ? "0001" : "0002",
                };
                completions.push(completion);
            }
        }
    }
    // Add nested block completions
    if (currentBlock.children && typeof currentBlock.children === 'object') {
        for (var _g = 0, _h = Object.entries(currentBlock.children); _g < _h.length; _g++) {
            var _j = _h[_g], childName = _j[0], childInfo = _j[1];
            if (filterByWord(childName)) {
                var isRequired = ((_b = componentData.lsp_structure.required_blocks) === null || _b === void 0 ? void 0 : _b.includes(childName)) ||
                    (childInfo === null || childInfo === void 0 ? void 0 : childInfo.required);
                var completion = {
                    label: childName,
                    kind: node_1.CompletionItemKind.Class,
                    detail: "".concat(childName, " block").concat(isRequired ? " (required)" : ""),
                    documentation: {
                        kind: "markdown",
                        value: (childInfo === null || childInfo === void 0 ? void 0 : childInfo.description) || "Configure ".concat(childName, " settings"),
                    },
                    insertText: "".concat(childName, " {\n  $0\n}"),
                    insertTextFormat: node_1.InsertTextFormat.Snippet,
                    sortText: isRequired ? "0001" : "0002",
                };
                completions.push(completion);
            }
        }
    }
    // Handle nested_blocks array if it exists
    if (currentBlock.nested_blocks && Array.isArray(currentBlock.nested_blocks)) {
        for (var _k = 0, _l = currentBlock.nested_blocks; _k < _l.length; _k++) {
            var nestedBlock = _l[_k];
            if (filterByWord(nestedBlock.block)) {
                var completion = {
                    label: nestedBlock.block,
                    kind: node_1.CompletionItemKind.Class,
                    detail: "".concat(nestedBlock.block, " block").concat(nestedBlock.required ? " (required)" : ""),
                    documentation: {
                        kind: "markdown",
                        value: nestedBlock.description || "Configure ".concat(nestedBlock.block, " settings"),
                    },
                    insertText: "".concat(nestedBlock.block, " {\n  $0\n}"),
                    insertTextFormat: node_1.InsertTextFormat.Snippet,
                    sortText: nestedBlock.required ? "0001" : "0002",
                };
                completions.push(completion);
            }
        }
    }
    return completions;
}
function provideCompletions(textDocumentPosition, documents) {
    var document = documents.get(textDocumentPosition.textDocument.uri);
    if (!document) {
        return [];
    }
    var position = textDocumentPosition.position;
    var content = document.getText();
    // Get all component data
    var allComponentData = utils_1.componentParser.getAllComponentData();
    if (Object.keys(allComponentData).length === 0) {
        return [];
    }
    // Detect which component the cursor is currently inside
    var currentComponent = utils_1.componentParser.findComponentAtPosition(content, position);
    var componentData = currentComponent ? allComponentData[currentComponent] : null;
    // Check if we're inside a block context
    var allLines = content.split("\n");
    var currentLine = allLines[position.line] || "";
    var textBeforeCursor = currentLine.substring(0, position.character);
    var currentWord = parser_1.alloyParser.getCurrentWord(textBeforeCursor);
    // Use the existing findBlockAtPosition method from utils
    var blockPosition = utils_1.componentParser.findBlockAtPosition(content, position);
    var currentBlockPath = blockPosition ? blockPosition.blockPath : [];
    // Determine if we're inside a component block
    var inComponentBlock = currentComponent ? parser_1.alloyParser.isInsideComponentBlock(content, position, currentComponent) : false;
    // If we're inside a component block and have component data, show block-specific completions
    if (inComponentBlock && componentData) {
        // For empty lines, we should still show completions for the current block context
        // unless we're at the very beginning of the component
        var isEmptyLine = currentLine.trim() === '';
        var effectiveBlockPath = isEmptyLine && currentBlockPath.length === 0 ? [] : currentBlockPath;
        var blockCompletions = getBlockSpecificCompletions(effectiveBlockPath, componentData, currentWord, currentComponent || undefined, currentLine);
        if (blockCompletions.length > 0) {
            return blockCompletions;
        }
    }
    // Show all component completions
    return provideAllComponentsCompletion(allComponentData, content, position);
}
