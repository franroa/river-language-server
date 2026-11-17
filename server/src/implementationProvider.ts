import {
  ImplementationParams,
  Location,
  TextDocuments,
  Range,
  Position,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as utils from "./utils";

// Word detection is now handled by unified utils.getWordAtPosition

/**
 * Find all implementations of a declared component
 */
function findComponentImplementations(
  documents: TextDocuments<TextDocument>,
  componentName: string
): Location[] {
  const implementations: Location[] = [];

  for (const document of documents.all()) {
    const content = document.getText();
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip comments and empty lines
      if (trimmed.startsWith('//') || trimmed === '') {
        continue;
      }

      // Match component declarations that implement the declared component
      const componentMatch = trimmed.match(/^([a-zA-Z_.][a-zA-Z0-9_.]*)\s*(?:"([^"]*)")?\s*\{/);
      if (componentMatch) {
        const declaredComponent = componentMatch[1];

        // Check if this component matches the declared component name
        if (declaredComponent === componentName) {
          const startChar = line.indexOf(declaredComponent);
          const endChar = startChar + declaredComponent.length;

          implementations.push(Location.create(
            document.uri,
            Range.create(
              Position.create(i, startChar),
              Position.create(i, endChar)
            )
          ));
        }
      }
    }
  }

  return implementations;
}

/**
 * Find the declare block that defines a component interface
 */
function findDeclareBlockDefinition(
  documents: TextDocuments<TextDocument>,
  componentName: string
): Location | null {
  for (const document of documents.all()) {
    const content = document.getText();
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip comments and empty lines
      if (trimmed.startsWith('//') || trimmed === '') {
        continue;
      }

      // Match declare blocks: declare "component_name" {
      const declareMatch = trimmed.match(/^declare\s+"([^"]+)"\s*\{/);
      if (declareMatch) {
        const declaredComponent = declareMatch[1];

        // Check if this matches what we're looking for
        if (declaredComponent === componentName) {
          const labelStart = line.indexOf(`"${declaredComponent}"`);
          const labelEnd = labelStart + declaredComponent.length + 2; // +2 for quotes

          return Location.create(
            document.uri,
            Range.create(
              Position.create(i, labelStart),
              Position.create(i, labelEnd)
            )
          );
        }
      }
    }
  }

  return null;
}

/**
 * Check if a word is a declared argument in the document
 */
function isDeclaredArgument(document: TextDocument, argumentName: string): boolean {
  const configBlocks = utils.parseConfigBlocks(document);

  for (const configBlock of configBlocks) {
    if (configBlock.type === 'declare' && configBlock.blocks) {
      for (const block of configBlock.blocks) {
        if (block.name === 'argument' && block.label === argumentName) {
          return true;
        }
      }
    }
  }

  return false;
}

export async function provideImplementation(
  params: ImplementationParams,
  documents: TextDocuments<TextDocument>
): Promise<Location[] | Location | null> {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return null;
  }

  const position = params.position;
  const wordAtPosition = utils.getWordAtPosition(document, position);

  if (!wordAtPosition) {
    return null;
  }

  const allComponentData = await utils.getAllAvailableComponents(document);

  // Check if this is a declared component
  if (utils.isDeclaredComponent(document, wordAtPosition)) {
    // When on a declare block, go-to-implementation should find all implementations/usages
    return findComponentImplementations(documents, wordAtPosition);
  }

  // Check if this is a component name that has a declare block
  if (allComponentData[wordAtPosition]) {
    // When on a component usage, go-to-implementation should find the declare block (interface)
    const declareDefinition = findDeclareBlockDefinition(documents, wordAtPosition);
    if (declareDefinition) {
      return declareDefinition;
    }
  }

  // Check if we're on a component declaration with a label
  const line = document.getText(Range.create(
    Position.create(position.line, 0),
    Position.create(position.line + 1, 0)
  ));

  const componentMatch = line.trim().match(/^([a-zA-Z_.][a-zA-Z0-9_.]*)\s*(?:"([^"]*)")?\s*\{/);
  if (componentMatch) {
    const componentName = componentMatch[1];

    // Check if cursor is on the component name
    const componentStart = line.indexOf(componentName);
    const componentEnd = componentStart + componentName.length;

    if (position.character >= componentStart && position.character <= componentEnd) {
      // If this component has a declare block, go to it
      const declareDefinition = findDeclareBlockDefinition(documents, componentName);
      if (declareDefinition) {
        return declareDefinition;
      }
    }
  }

  // For declared arguments, go-to-implementation should find the argument definition
  // (which is the same as the declaration since arguments don't have separate implementations)
  if (isDeclaredArgument(document, wordAtPosition)) {
    // Find the argument declaration
    const configBlocks = utils.parseConfigBlocks(document);
    for (const configBlock of configBlocks) {
      if (configBlock.type === 'declare' && configBlock.blocks) {
        for (const block of configBlock.blocks) {
          if (block.name === 'argument' && block.label === wordAtPosition) {
            return Location.create(
              document.uri,
              block.range
            );
          }
        }
      }
    }
  }
  return null;
}