import { TextDocument } from "vscode-languageserver-textdocument";
import { Range } from "vscode-languageserver/node";
import { RangeUtils, ErrorHandler } from "./commonUtils";

/**
 * Component reference match with parsing details
 */
export interface ComponentReferenceMatch {
  /** The line index where this reference was found */
  lineIndex: number;
  /** The character index where the match starts */
  matchIndex: number;
  /** The full matched text */
  matchedText: string;
  /** The parsed component type (e.g., "otelcol.processor.attributes") */
  componentType: string;
  /** The parsed component label (e.g., "default") */
  componentLabel: string;
  /** Additional property path if present (e.g., "input", "output.traces") */
  property?: string;
  /** Whether this reference was successfully parsed as a valid component reference */
  isValidReference: boolean;
  /** Range in the document where this reference appears */
  range: Range;
}

/**
 * Parsed component reference structure
 */
export interface ParsedComponentReference {
  componentType: string;
  componentLabel: string;
  property?: string;
  isValid: boolean;
  isDeclared: boolean;
}

/**
 * Component reference parsing utilities
 * Centralizes the complex component reference parsing logic used across providers
 */
export class ComponentReferenceParser {
  private static readonly COMPONENT_REFERENCE_PATTERN = /\b([a-zA-Z_][a-zA-Z0-9_.]*)\b/g;

  /**
   * Parse all component references in a document
   * Centralizes the component reference parsing logic used by all providers
   */
  static parseComponentReferencesInDocument(
    document: TextDocument, 
    allComponentData: Record<string, any>
  ): ComponentReferenceMatch[] {
    return ErrorHandler.safeExecute(() => {
      const matches: ComponentReferenceMatch[] = [];
      const content = document.getText();
      const lines = content.split('\n');

      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        const pattern = new RegExp(this.COMPONENT_REFERENCE_PATTERN);
        let match;

        while ((match = pattern.exec(line)) !== null) {
          const potentialRef = match[1];
          
          // Skip if inside quotes, comments, or component declarations
          if (this.shouldSkipMatch(line, match.index, potentialRef)) {
            continue;
          }

          const parsed = this.parseComponentReference(potentialRef, allComponentData);
          
          matches.push({
            lineIndex,
            matchIndex: match.index,
            matchedText: potentialRef,
            componentType: parsed.componentType,
            componentLabel: parsed.componentLabel,
            property: parsed.property,
            isValidReference: parsed.isValid,
            range: RangeUtils.singleLine(lineIndex, match.index, match.index + match[0].length)
          });
        }
      }

      return matches;
    }, 'parseComponentReferencesInDocument', []);
  }

  /**
   * Parse a single component reference string
   * Handles both declared components (main.eu.export) and built-in components (component.type.label.property)
   */
  static parseComponentReference(
    reference: string, 
    allComponentData: Record<string, any>
  ): ParsedComponentReference {
    return ErrorHandler.safeExecute(() => {
      const parts = reference.split('.');
      if (parts.length < 2) {
        return {
          componentType: '',
          componentLabel: '',
          property: undefined,
          isValid: false,
          isDeclared: false
        };
      }

      // Check for declared component: main.eu.export_name
      if (parts.length >= 2 && allComponentData[parts[0]] && allComponentData[parts[0]].isDeclared) {
        return {
          componentType: parts[0],
          componentLabel: parts[1],
          property: parts.length > 2 ? parts.slice(2).join('.') : undefined,
          isValid: true,
          isDeclared: true
        };
      }

      // Check for built-in component: component.type.label.property
      for (let i = 0; i < parts.length - 1; i++) {
        const possibleType = parts.slice(0, i + 1).join('.');
        if (allComponentData[possibleType]) {
          return {
            componentType: possibleType,
            componentLabel: parts[i + 1],
            property: parts.length > (i + 2) ? parts.slice(i + 2).join('.') : undefined,
            isValid: true,
            isDeclared: false
          };
        }
      }

      return {
        componentType: '',
        componentLabel: '',
        property: undefined,
        isValid: false,
        isDeclared: false
      };
    }, 'parseComponentReference', {
      componentType: '',
      componentLabel: '',
      property: undefined,
      isValid: false,
      isDeclared: false
    });
  }

  /**
   * Find component references by type and label
   */
  static findComponentReferences(
    document: TextDocument,
    targetType: string,
    targetLabel: string,
    allComponentData: Record<string, any>
  ): ComponentReferenceMatch[] {
    return ErrorHandler.safeExecute(() => {
      const allMatches = this.parseComponentReferencesInDocument(document, allComponentData);
      return allMatches.filter(match => 
        match.isValidReference &&
        match.componentType === targetType &&
        match.componentLabel === targetLabel
      );
    }, 'findComponentReferences', []);
  }

  /**
   * Find all references to a specific component instance
   */
  static findAllReferencesToComponent(
    documents: TextDocument[],
    targetType: string,
    targetLabel: string,
    allComponentData: Record<string, any>
  ): Array<{ document: TextDocument; matches: ComponentReferenceMatch[] }> {
    return ErrorHandler.safeExecute(() => {
      const results: Array<{ document: TextDocument; matches: ComponentReferenceMatch[] }> = [];

      for (const doc of documents) {
        const matches = this.findComponentReferences(doc, targetType, targetLabel, allComponentData);
        if (matches.length > 0) {
          results.push({ document: doc, matches });
        }
      }

      return results;
    }, 'findAllReferencesToComponent', []);
  }

  /**
   * Check if a reference matches argument pattern (argument.name.value)
   */
  static isArgumentReference(reference: string): boolean {
    const parts = reference.split('.');
    return parts.length >= 3 && parts[0] === 'argument';
  }

  /**
   * Parse argument reference (argument.name.value)
   */
  static parseArgumentReference(reference: string): { name: string; property?: string } | null {
    if (!this.isArgumentReference(reference)) {
      return null;
    }

    const parts = reference.split('.');
    return {
      name: parts[1],
      property: parts.length > 2 ? parts.slice(2).join('.') : undefined
    };
  }

  /**
   * Check if match should be skipped (quotes, comments, declarations)
   */
  private static shouldSkipMatch(line: string, matchIndex: number, potentialRef: string): boolean {
    // Skip component declarations
    const trimmed = line.trim();
    const componentDeclMatch = trimmed.match(/^[a-zA-Z_.][a-zA-Z0-9_.]*\s+"[^"]*"(\s*\{|\s*$)/);
    if (componentDeclMatch && matchIndex === line.indexOf(trimmed)) {
      return true;
    }

    // Skip matches inside quoted strings
    if (this.isInsideQuotes(line, matchIndex)) {
      return true;
    }

    // Skip matches inside comments
    if (this.isInsideComment(line, matchIndex)) {
      return true;
    }

    // Only process references with at least 3 parts (component.type.label minimum)
    const parts = potentialRef.split('.');
    if (parts.length < 3 && !potentialRef.startsWith('argument.')) {
      return true;
    }

    return false;
  }

  /**
   * Check if match is inside quoted strings
   */
  private static isInsideQuotes(text: string, index: number): boolean {
    let quoteCount = 0;
    for (let i = 0; i < index; i++) {
      if (text[i] === '"' && (i === 0 || text[i - 1] !== '\\')) {
        quoteCount++;
      }
    }
    return quoteCount % 2 === 1;
  }

  /**
   * Check if match is inside commented sections
   */
  private static isInsideComment(lineText: string, matchIndex: number): boolean {
    const beforeMatch = lineText.substring(0, matchIndex);
    const commentStart = beforeMatch.indexOf('//');
    return commentStart !== -1;
  }

  /**
   * Extract component type from full reference
   */
  static extractComponentType(reference: string, allComponentData: Record<string, any>): string | null {
    const parsed = this.parseComponentReference(reference, allComponentData);
    return parsed.isValid ? parsed.componentType : null;
  }

  /**
   * Extract component label from full reference
   */
  static extractComponentLabel(reference: string, allComponentData: Record<string, any>): string | null {
    const parsed = this.parseComponentReference(reference, allComponentData);
    return parsed.isValid ? parsed.componentLabel : null;
  }

  /**
   * Check if reference is valid component reference
   */
  static isValidComponentReference(reference: string, allComponentData: Record<string, any>): boolean {
    const parsed = this.parseComponentReference(reference, allComponentData);
    return parsed.isValid;
  }

  /**
   * Get all unique component types referenced in document
   */
  static getReferencedComponentTypes(document: TextDocument, allComponentData: Record<string, any>): string[] {
    const matches = this.parseComponentReferencesInDocument(document, allComponentData);
    const types = new Set<string>();
    
    for (const match of matches) {
      if (match.isValidReference && match.componentType) {
        types.add(match.componentType);
      }
    }
    
    return Array.from(types);
  }

  /**
   * Get all unique component labels for a specific type in document
   */
  static getComponentLabelsForType(
    document: TextDocument, 
    componentType: string, 
    allComponentData: Record<string, any>
  ): string[] {
    const matches = this.parseComponentReferencesInDocument(document, allComponentData);
    const labels = new Set<string>();
    
    for (const match of matches) {
      if (match.isValidReference && match.componentType === componentType && match.componentLabel) {
        labels.add(match.componentLabel);
      }
    }
    
    return Array.from(labels);
  }
}