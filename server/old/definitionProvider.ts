import {
  TextDocuments,
  Location,
  DefinitionParams,
  Position,
  Range,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as path from 'path';
import * as fs from 'fs';

/**
 * Provides go-to-definition functionality for Alloy component references.
 * 
 * When a user places their cursor on a component reference like:
 * `forward_to = [prometheus.remote_write.default.receiver]`
 * 
 * This function will find the definition of that component:
 * `prometheus.remote_write "default" { ... }`
 * 
 * It searches first in the current document, then in other .alloy files 
 * in the same folder.
 */
export function provideDefinition(
  params: DefinitionParams,
  documents: TextDocuments<TextDocument>
): Location[] | null {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return null;
  }

  const position = params.position;
  const text = document.getText();
  
  // Get the word at the cursor position
  const componentReference = getComponentReferenceAtPosition(text, position);
  if (!componentReference) {
    return null;
  }

  // Find the definition of this component
  return findComponentDefinition(componentReference, document, documents);
}

function getComponentReferenceAtPosition(text: string, position: Position): ComponentReference | null {
  const lines = text.split('\n');
  if (position.line >= lines.length) {
    return null;
  }

  const line = lines[position.line];
  const character = position.character;
  
  // Check if we're on a component reference pattern like prometheus.remote_write.label
  // This regex matches component references with optional .receiver suffix
  const componentRefRegex = /([a-zA-Z0-9_]+\.[a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)(?:\.receiver)?/g;
  let match;
  
  while ((match = componentRefRegex.exec(line)) !== null) {
    const matchStart = match.index;
    const matchEnd = match.index + match[0].length;
    
    // Check if cursor is within this match
    if (character >= matchStart && character <= matchEnd) {
      const componentType = match[1]; // e.g., "prometheus.remote_write"
      const componentLabel = match[2]; // e.g., "default"
      
      return {
        componentType,
        componentLabel,
        range: {
          start: { line: position.line, character: matchStart },
          end: { line: position.line, character: matchEnd }
        }
      };
    }
  }

  return null;
}

interface ComponentReference {
  componentType: string; // e.g., "prometheus.remote_write" 
  componentLabel: string; // e.g., "default"
  range: Range;
}

function findComponentDefinition(
  componentRef: ComponentReference,
  currentDocument: TextDocument,
  documents: TextDocuments<TextDocument>
): Location[] | null {
  // First search in the current document
  const currentLocation = findComponentInDocument(componentRef, currentDocument);
  if (currentLocation) {
    return [currentLocation];
  }

  // Then search in other documents in the same folder
  return findComponentInWorkspace(componentRef, currentDocument, documents);
}

function findComponentInDocument(
  componentRef: ComponentReference,
  document: TextDocument
): Location | null {
  const text = document.getText();

  // Look for component definitions like: prometheus.remote_write "default" {
  const definitionRegex = new RegExp(
    `^\\s*${escapeRegex(componentRef.componentType)}\\s+"${escapeRegex(componentRef.componentLabel)}"\\s*\\{`,
    'gm'
  );

  let match;
  while ((match = definitionRegex.exec(text)) !== null) {
    const startOffset = match.index;
    const startPos = document.positionAt(startOffset);
    const endPos = document.positionAt(startOffset + match[0].length);
    
    return {
      uri: document.uri,
      range: {
        start: startPos,
        end: endPos
      }
    };
  }

  return null;
}

function findComponentInWorkspace(
  componentRef: ComponentReference,
  currentDocument: TextDocument,
  documents: TextDocuments<TextDocument>
): Location[] | null {
  // Get the folder path of the current document
  if (!currentDocument.uri.startsWith('file://')) {
    return null;
  }

  const currentFilePath = decodeURIComponent(currentDocument.uri.replace('file://', ''));
  const folderPath = path.dirname(currentFilePath);

  try {
    // Read all .alloy files in the same folder
    const files = fs.readdirSync(folderPath);
    const alloyFiles = files.filter((file: string) => file.endsWith('.alloy'));

    for (const fileName of alloyFiles) {
      const filePath = path.join(folderPath, fileName);
      const uri = `file://${filePath}`;
      
      // Skip the current document (already checked)
      if (uri === currentDocument.uri) {
        continue;
      }

      let document: TextDocument;
      
      // Check if document is already open
      const openDocument = documents.get(uri);
      if (openDocument) {
        document = openDocument;
      } else {
        // Read file from filesystem
        try {
          const fileContent = fs.readFileSync(filePath, 'utf8');
          // Create a temporary TextDocument for position calculations
          document = TextDocument.create(uri, 'alloy', 1, fileContent);
        } catch (readError) {
          continue; // Skip files that can't be read
        }
      }

      // Search for the component definition in this document
      const location = findComponentInDocument(componentRef, document);
      if (location) {
        return [location];
      }
    }
  } catch (error) {
    // If we can't read the folder, return null
    console.error(`Error searching workspace for component definition:`, error);
    return null;
  }

  return null;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}