import {
  TextDocuments,
  TypeHierarchyItem,
  TypeHierarchyPrepareParams,
  TypeHierarchySupertypesParams,
  TypeHierarchySubtypesParams,
  SymbolKind,
  Range
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { BaseProvider } from "./baseProvider";

/**
 * Provides type hierarchy functionality for Alloy components
 * Shows component inheritance and relationship trees
 */
export class TypeHierarchyProvider extends BaseProvider {
  constructor(documents: TextDocuments<TextDocument>) {
    super(documents);
  }

  /**
   * Prepare type hierarchy items
   */
  async prepareTypeHierarchy(
    params: TypeHierarchyPrepareParams,
    workspaceFolders: string[] = []
  ): Promise<TypeHierarchyItem[] | null> {
    return this.handleProviderError(
      await this.prepareTypeHierarchyImpl(params, workspaceFolders),
      'prepareTypeHierarchy',
      null
    );
  }

  /**
   * Get supertypes for a type hierarchy item
   */
  async getSupertypes(
    params: TypeHierarchySupertypesParams,
    workspaceFolders: string[] = []
  ): Promise<TypeHierarchyItem[] | null> {
    return this.handleProviderError(
      await this.getSupertypesImpl(params, workspaceFolders),
      'getSupertypes',
      null
    );
  }

  /**
   * Get subtypes for a type hierarchy item
   */
  async getSubtypes(
    params: TypeHierarchySubtypesParams,
    workspaceFolders: string[] = []
  ): Promise<TypeHierarchyItem[] | null> {
    return this.handleProviderError(
      await this.getSubtypesImpl(params, workspaceFolders),
      'getSubtypes',
      null
    );
  }

  private async prepareTypeHierarchyImpl(
    params: TypeHierarchyPrepareParams,
    workspaceFolders: string[]
  ): Promise<TypeHierarchyItem[] | null> {
    const context = this.initializeContext(params);
    if (!context) return null;

    const { document, position, wordInfo } = context;

    if (!wordInfo || !wordInfo.word) return null;

    // Get component data
    const componentDataResult = await this.getComponentData(workspaceFolders);
    if (!componentDataResult.success) return null;

    const { allComponentData } = componentDataResult;

    // Check if this is a component type
    const componentType = this.findComponentType(document, position, wordInfo.word, allComponentData);
    if (!componentType) return null;

    // Create type hierarchy item for the component
    const hierarchyItem = this.createTypeHierarchyItem(
      componentType,
      document,
      wordInfo.range,
      allComponentData
    );

    return hierarchyItem ? [hierarchyItem] : null;
  }

  private async getSupertypesImpl(
    params: TypeHierarchySupertypesParams,
    workspaceFolders: string[]
  ): Promise<TypeHierarchyItem[] | null> {
    const { item } = params;
    const supertypes: TypeHierarchyItem[] = [];

    // Get component data
    const componentDataResult = await this.getComponentData(workspaceFolders);
    if (!componentDataResult.success) return null;

    const { allComponentData } = componentDataResult;

    // For Alloy components, supertypes could be:
    // 1. Parent component families (e.g., prometheus -> otelcol)
    // 2. Base component types (e.g., scrape -> prometheus)
    // 3. Abstract component categories

    const componentType = item.name;
    const parentTypes = this.findParentTypes(componentType, allComponentData);

    for (const parentType of parentTypes) {
      const parentItem = this.createTypeHierarchyItem(
        parentType,
        null, // We might not have a specific document reference
        item.range, // Use the same range as reference
        allComponentData
      );

      if (parentItem) {
        supertypes.push(parentItem);
      }
    }

    return supertypes.length > 0 ? supertypes : null;
  }

  private async getSubtypesImpl(
    params: TypeHierarchySubtypesParams,
    workspaceFolders: string[]
  ): Promise<TypeHierarchyItem[] | null> {
    const { item } = params;
    const subtypes: TypeHierarchyItem[] = [];

    // Get component data
    const componentDataResult = await this.getComponentData(workspaceFolders);
    if (!componentDataResult.success) return null;

    const { allComponentData } = componentDataResult;

    // For Alloy components, subtypes could be:
    // 1. Specific component implementations (e.g., prometheus -> prometheus.scrape)
    // 2. Extended components (e.g., declare blocks that extend base types)
    // 3. Specialized variants

    const componentType = item.name;
    const childTypes = this.findChildTypes(componentType, allComponentData);

    for (const childType of childTypes) {
      const childItem = this.createTypeHierarchyItem(
        childType,
        null,
        item.range,
        allComponentData
      );

      if (childItem) {
        subtypes.push(childItem);
      }
    }

    return subtypes.length > 0 ? subtypes : null;
  }

  private findComponentType(
    document: TextDocument,
    position: { line: number; character: number },
    word: string,
    allComponentData: Record<string, any>
  ): string | null {
    const text = document.getText();
    const lines = text.split('\n');
    const currentLine = lines[position.line];

    // Check if we're on a component declaration
    const componentMatch = currentLine.match(/^(\s*)([a-zA-Z_.][a-zA-Z0-9_.]*)\s+"([^"]*)"(\s*\{|\s*$)/);
    if (componentMatch) {
      const [, , componentType] = componentMatch;
      return componentType;
    }

    // Check if we're on a component reference
    const referenceMatch = currentLine.match(/([a-zA-Z_.][a-zA-Z0-9_.]*)\\.([a-zA-Z0-9_]+)/);
    if (referenceMatch) {
      const [, componentType] = referenceMatch;
      return componentType;
    }

    // Check if word is a component type directly
    if (allComponentData[word]) {
      return word;
    }

    // Check if word is part of a component type (e.g., "prometheus" in "prometheus.scrape")
    for (const type of Object.keys(allComponentData)) {
      if (type.startsWith(word + '.') || type.endsWith('.' + word)) {
        return type;
      }
    }

    return null;
  }

  private findParentTypes(
    componentType: string,
    allComponentData: Record<string, any>
  ): string[] {
    const parents: string[] = [];
    const parts = componentType.split('.');

    // For hierarchical component types like "prometheus.scrape", 
    // the parent would be "prometheus"
    if (parts.length > 1) {
      for (let i = parts.length - 1; i > 0; i--) {
        const parentType = parts.slice(0, i).join('.');
        if (allComponentData[parentType]) {
          parents.push(parentType);
        }
      }
    }

    // Check for logical groupings based on component families
    const componentInfo = allComponentData[componentType];
    if (componentInfo) {
      // Add family-based relationships
      if (componentType.startsWith('prometheus.')) {
        if (!parents.includes('prometheus')) parents.push('prometheus');
        parents.push('monitoring');
      } else if (componentType.startsWith('loki.')) {
        if (!parents.includes('loki')) parents.push('loki');
        parents.push('logging');
      } else if (componentType.startsWith('otelcol.')) {
        if (!parents.includes('otelcol')) parents.push('otelcol');
        parents.push('observability');
      } else if (componentType.startsWith('pyroscope.')) {
        if (!parents.includes('pyroscope')) parents.push('pyroscope');
        parents.push('profiling');
      }
    }

    return parents;
  }

  private findChildTypes(
    componentType: string,
    allComponentData: Record<string, any>
  ): string[] {
    const children: string[] = [];

    // Find direct children (types that start with this type + .)
    for (const type of Object.keys(allComponentData)) {
      if (type.startsWith(componentType + '.') && type !== componentType) {
        // Only include direct children, not grandchildren
        const suffix = type.substring(componentType.length + 1);
        if (!suffix.includes('.')) {
          children.push(type);
        }
      }
    }

    // For base types, find all components in that family
    if (!componentType.includes('.')) {
      for (const type of Object.keys(allComponentData)) {
        if (type.startsWith(componentType + '.')) {
          children.push(type);
        }
      }
    }

    // Find declare blocks that might extend this type
    for (const doc of this.documents.all()) {
      const text = doc.getText();
      const lines = text.split('\n');

      for (const line of lines) {
        const declareMatch = line.match(/^(\s*)declare\s+"([^"]+)"\s*\{/);
        if (declareMatch) {
          const [, , declareType] = declareMatch;
          // Declare blocks that might be related to this component type
          if (declareType.includes(componentType) || componentType.includes(declareType)) {
            children.push(declareType);
          }
        }
      }
    }

    return [...new Set(children)]; // Remove duplicates
  }

  private createTypeHierarchyItem(
    componentType: string,
    document: TextDocument | null,
    range: Range,
    allComponentData: Record<string, any>
  ): TypeHierarchyItem | null {
    const componentInfo = allComponentData[componentType];
    
    let symbolKind = SymbolKind.Class;
    let detail = 'Component';

    if (componentInfo) {
      if (componentInfo.isDeclared) {
        symbolKind = SymbolKind.Class;
        detail = 'Declared Component';
      } else if (componentType.includes('.')) {
        symbolKind = SymbolKind.Class; // Use Class for all component types
        detail = 'Component Implementation';
      }
    } else {
      // For logical groupings
      symbolKind = SymbolKind.Class;
      if (['monitoring', 'logging', 'observability', 'profiling'].includes(componentType)) {
        detail = 'Component Category';
      } else if (!componentType.includes('.')) {
        detail = 'Component Family';
      }
    }

    const uri = document ? document.uri : `virtual://alloy/${componentType}`;

    return {
      name: componentType,
      kind: symbolKind,
      uri,
      range,
      selectionRange: range,
      detail,
      data: {
        componentType,
        hasImplementation: !!componentInfo,
        isLogicalGroup: !componentInfo
      }
    };
  }
}

/**
 * Main entry point for type hierarchy prepare requests
 */
export async function prepareTypeHierarchy(
  params: TypeHierarchyPrepareParams,
  documents: TextDocuments<TextDocument>,
  workspaceFolders: string[] = []
): Promise<TypeHierarchyItem[] | null> {
  const provider = new TypeHierarchyProvider(documents);
  return provider.prepareTypeHierarchy(params, workspaceFolders);
}

/**
 * Main entry point for type hierarchy supertypes requests
 */
export async function getTypeHierarchySupertypes(
  params: TypeHierarchySupertypesParams,
  documents: TextDocuments<TextDocument>,
  workspaceFolders: string[] = []
): Promise<TypeHierarchyItem[] | null> {
  const provider = new TypeHierarchyProvider(documents);
  return provider.getSupertypes(params, workspaceFolders);
}

/**
 * Main entry point for type hierarchy subtypes requests
 */
export async function getTypeHierarchySubtypes(
  params: TypeHierarchySubtypesParams,
  documents: TextDocuments<TextDocument>,
  workspaceFolders: string[] = []
): Promise<TypeHierarchyItem[] | null> {
  const provider = new TypeHierarchyProvider(documents);
  return provider.getSubtypes(params, workspaceFolders);
}