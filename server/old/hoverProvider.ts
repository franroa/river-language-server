import {
  Hover,
  MarkupContent,
  TextDocumentPositionParams,
  TextDocuments,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { componentSnippets, allBlockProperties } from "./componentData";
import { findParentBlockType, findHoveredWord } from "./utils";

export function provideHover(
  textDocumentPosition: TextDocumentPositionParams,
  documents: TextDocuments<TextDocument>
): Hover | null {
  const document = documents.get(textDocumentPosition.textDocument.uri);
  if (!document) return null;

  const text = document.getText();
  const position = textDocumentPosition.position;
  const offset = document.offsetAt(position);
  const line = text.split("\n")[position.line];
  
  const hoveredWord = findHoveredWord(line, position.character);
  if (!hoveredWord) return null;

  const parentBlockType = findParentBlockType(text, offset);

  let foundItem;
  if (parentBlockType && allBlockProperties[parentBlockType]) {
    foundItem = allBlockProperties[parentBlockType].find(
      (prop) => prop.label === hoveredWord,
    );
  } else {
    foundItem = componentSnippets.find((comp) => comp.label === hoveredWord);
  }

  if (foundItem && foundItem.documentation && foundItem.detail) {
    const contents: MarkupContent = {
      kind: "markdown",
      value: [
        `**\`${foundItem.label}\`**`,
        "---",
        `*${foundItem.detail}*`,
        "---",
        typeof foundItem.documentation === "string"
          ? foundItem.documentation
          : foundItem.documentation.value,
      ].join("\n"),
    };
    return { contents };
  }

  return null;
}