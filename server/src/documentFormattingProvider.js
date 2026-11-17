"use strict";
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (
          !desc ||
          ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)
        ) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k];
            },
          };
        }
        Object.defineProperty(o, k2, desc);
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
      });
var __setModuleDefault =
  (this && this.__setModuleDefault) ||
  (Object.create
    ? function (o, v) {
        Object.defineProperty(o, "default", { enumerable: true, value: v });
      }
    : function (o, v) {
        o["default"] = v;
      });
var __importStar =
  (this && this.__importStar) ||
  (function () {
    var ownKeys = function (o) {
      ownKeys =
        Object.getOwnPropertyNames ||
        function (o) {
          var ar = [];
          for (var k in o)
            if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
          return ar;
        };
      return ownKeys(o);
    };
    return function (mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null)
        for (var k = ownKeys(mod), i = 0; i < k.length; i++)
          if (k[i] !== "default") __createBinding(result, mod, k[i]);
      __setModuleDefault(result, mod);
      return result;
    };
  })();
Object.defineProperty(exports, "__esModule", { value: true });
exports.addCommasToMapElements = addCommasToMapElements;
exports.provideDocumentFormatting = provideDocumentFormatting;
const node_1 = require("vscode-languageserver/node");
const utils = __importStar(require("./utils"));
/**
 * Add commas to the end of map elements in Alloy configuration files
 */
function addCommasToMapElements(content) {
  const lines = content.split("\n");
  const result = [];
  // Stack to track nested contexts
  const contextStack = [];
  let braceDepth = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    // Skip empty lines and comments
    if (
      trimmed === "" ||
      trimmed.startsWith("//") ||
      trimmed.startsWith("/*")
    ) {
      result.push(line);
      continue;
    }
    // Count braces and brackets to track depth
    const openCurlyBraces = (line.match(/\{/g) || []).length;
    const closeCurlyBraces = (line.match(/\}/g) || []).length;
    const openSquareBrackets = (line.match(/\[/g) || []).length;
    const closeSquareBrackets = (line.match(/\]/g) || []).length;
    // Handle opening contexts
    if (trimmed.includes("= [") && !trimmed.includes("]")) {
      // Entering array context
      contextStack.push({ type: "array", depth: braceDepth });
    } else if (trimmed === "{") {
      // Entering object context (standalone opening brace)
      contextStack.push({ type: "object", depth: braceDepth });
    } else if (
      trimmed.includes("{") &&
      !trimmed.includes("= {") &&
      !trimmed.includes("}")
    ) {
      // Entering block context (like prometheus.scrape "name" {)
      contextStack.push({ type: "block", depth: braceDepth });
    }
    // Update depth after processing opening contexts
    braceDepth += openCurlyBraces - closeCurlyBraces;
    // Handle closing contexts
    if (trimmed === "}" || trimmed === "]") {
      // Remove context when we exit
      while (
        contextStack.length > 0 &&
        contextStack[contextStack.length - 1].depth >= braceDepth
      ) {
        contextStack.pop();
      }
    }
    // Check if we're currently in an object context
    const inObjectContext = contextStack.some((ctx) => ctx.type === "object");
    // If we're in an object context, check if this line needs a comma
    if (
      inObjectContext &&
      trimmed !== "}" &&
      !trimmed.endsWith(",") &&
      !trimmed.endsWith("{")
    ) {
      // Check if this is a key-value assignment
      if (trimmed.includes("=")) {
        // Look ahead to see if the next non-empty, non-comment line is a closing brace
        let nextLineIndex = i + 1;
        let nextNonEmptyLine = "";
        while (nextLineIndex < lines.length) {
          const nextLine = lines[nextLineIndex].trim();
          if (
            nextLine !== "" &&
            !nextLine.startsWith("//") &&
            !nextLine.startsWith("/*")
          ) {
            nextNonEmptyLine = nextLine;
            break;
          }
          nextLineIndex++;
        }
        // Add comma if next line is not a closing brace
        if (nextNonEmptyLine !== "}") {
          result.push(line + ",");
        } else {
          result.push(line);
        }
      } else {
        result.push(line);
      }
    } else {
      result.push(line);
    }
  }
  return result.join("\n");
}
function provideDocumentFormatting(params, documents) {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return null;
  }
  try {
    const content = document.getText();
    const formattedContent = addCommasToMapElements(content);
    // Create edit for the entire document if there are changes
    const edits = [];
    if (formattedContent !== content) {
      const lines = content.split("\n");
      edits.push({
        range: node_1.Range.create(
          node_1.Position.create(0, 0),
          node_1.Position.create(
            lines.length - 1,
            lines[lines.length - 1]?.length || 0,
          ),
        ),
        newText: formattedContent,
      });
    }
    return edits;
  } catch (error) {
    utils.ErrorHandler?.handleProviderError("DocumentFormatting", error);
    return null;
  }
}
