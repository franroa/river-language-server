import {
  CompletionItem,
  TextDocumentPositionParams,
  TextDocuments,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { componentSnippets, allBlockProperties, allNestedBlockProperties } from "./componentData";
import { findParentBlockType, findNestedBlockContext } from "./utils";

export function provideCompletions(
  textDocumentPosition: TextDocumentPositionParams,
  documents: TextDocuments<TextDocument>
): CompletionItem[] {
  const document = documents.get(textDocumentPosition.textDocument.uri);
  if (!document) return [];

  const text = document.getText();
  const offset = document.offsetAt(textDocumentPosition.position);

  // First, check if we're in a nested block context
  const nestedContext = findNestedBlockContext(text, offset);
  if (nestedContext && allNestedBlockProperties[nestedContext.component]?.[nestedContext.block]) {
    return allNestedBlockProperties[nestedContext.component][nestedContext.block];
  }

  // Fall back to regular block properties
  const parentBlockType = findParentBlockType(text, offset);
  if (parentBlockType && allBlockProperties[parentBlockType]) {
    return allBlockProperties[parentBlockType];
  }

  return componentSnippets;
}