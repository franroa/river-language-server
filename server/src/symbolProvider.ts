import {
  WorkspaceSymbolParams,
  DocumentSymbolParams,
  SymbolInformation,
  SymbolKind,
  DocumentSymbol,
  TextDocuments,
  Range,
  Position,
  Location,
  Connection,
  Hover,
  MarkupContent,
  MarkupKind,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as utils from "./utils";
import { fuzzyFilterSymbols, fuzzyMatch } from "./fuzzyMatch";
import { getRelationshipAnalyzer } from "./componentRelationships";
import { getPerformanceManager } from "./performance";
import { configManager } from "./configuration";

/**
 * Provide workspace symbols for search functionality (Ctrl+T in VS Code)
 * Enhanced with fuzzy matching, performance optimizations, and smart categorization
 */
export async function provideWorkspaceSymbols(
  params: WorkspaceSymbolParams,
  documents: TextDocuments<TextDocument>,
  connection?: Connection
): Promise<SymbolInformation[]> {
  const query = params.query.trim();
  const startTime = Date.now();
  const performanceManager = getPerformanceManager(connection);

  // Collect all symbols from workspace with caching
  const allSymbols: SymbolInformation[] = [];
  const allDocuments = documents.all();

  // Use performance manager for large workspaces
  if (allDocuments.length > 200) {
    connection?.console.log(`Large workspace detected (${allDocuments.length} docs), using optimized symbol search`);
  }

  // Process documents in parallel for better performance
  const documentPromises = allDocuments.map(async (document) => {
    try {
      // Use cached parsed document for better performance
      const { components, configBlocks } = await performanceManager.getCachedParsedDocument(document);
      const symbols: SymbolInformation[] = [];

      // Add component declarations as symbols with enhanced metadata
      for (const component of components) {
        // Component type symbol with enhanced information
        symbols.push({
          name: component.name,
          kind: SymbolKind.Class,
          location: Location.create(
            document.uri,
            component.range
          ),
          containerName: component.label || 'unnamed'
        });

        // Component label symbol with better categorization
        if (component.label) {
          symbols.push({
            name: component.label,
            kind: SymbolKind.Variable,
            location: Location.create(
              document.uri,
              component.range
            ),
            containerName: component.name
          });
        }

        // Add component arguments as symbols for better navigation
        // Note: This would be enhanced when component argument parsing is available
      }

      // Add config blocks as symbols with enhanced categorization
      for (const configBlock of configBlocks) {
        let symbolKind: SymbolKind;
        let symbolName: string;

        switch (configBlock.type) {
          case 'declare':
            symbolKind = SymbolKind.Function;
            symbolName = configBlock.label ? `declare ${configBlock.label}` : 'declare';
            break;
          case 'argument':
            symbolKind = SymbolKind.Property;
            symbolName = configBlock.label ? `argument ${configBlock.label}` : 'argument';
            break;
          case 'export':
            symbolKind = SymbolKind.Field;
            symbolName = configBlock.label ? `export ${configBlock.label}` : 'export';
            break;
          default:
            symbolKind = SymbolKind.Object;
            symbolName = configBlock.label || configBlock.type;
        }

        symbols.push({
          name: symbolName,
          kind: symbolKind,
          location: Location.create(
            document.uri,
            configBlock.range
          ),
          containerName: configBlock.type
        });
      }

      return symbols;
    } catch (error) {
      console.warn(`Error processing symbols in ${document.uri}: ${error}`);
      return [];
    }
  });

  // Wait for all documents to be processed
  const symbolArrays = await Promise.all(documentPromises);
  allSymbols.push(...symbolArrays.flat());

  // Apply fuzzy filtering and sorting with enhanced ranking
  let filteredSymbols;
  if (!query.trim()) {
    // For empty queries, provide top-ranked symbols to help with discovery
    // Sort by symbol kind priority for better UX
    const sortedSymbols = allSymbols.sort((a, b) => {
      const getKindPriority = (kind: SymbolKind): number => {
        switch (kind) {
          case SymbolKind.Class: return 1;      // Components first
          case SymbolKind.Function: return 2;   // Functions second
          case SymbolKind.Variable: return 3;   // Variables third
          case SymbolKind.Property: return 4;   // Properties fourth
          default: return 99;
        }
      };
      const aPriority = getKindPriority(a.kind);
      const bPriority = getKindPriority(b.kind);
      if (aPriority !== bPriority) return aPriority - bPriority;
      return a.name.localeCompare(b.name);
    });

    filteredSymbols = sortedSymbols.slice(0, 50).map(symbol => ({
      ...symbol,
      fuzzyMatch: {
        text: symbol.name,
        score: 0,
        indices: []
      }
    }));
  } else {
    filteredSymbols = fuzzyFilterSymbols(query, allSymbols, 150);
  }

  const duration = Date.now() - startTime;
  connection?.console.log(`Enhanced workspace symbol search completed in ${duration}ms for "${query}" (${allSymbols.length} total, ${filteredSymbols.length} filtered)`);

  // For short queries, provide more results to help with autocompletion
  const maxResults = query.length < 3 ? 50 : 150;

  // Return the filtered symbols with enhanced metadata
  return filteredSymbols.slice(0, maxResults).map(item => ({
    name: item.name,
    kind: item.kind,
    location: item.location,
    containerName: item.containerName
  }));
}



/**
 * Provide enhanced document symbols that include workspace context
 * This version includes symbols from other files that are referenced by the current document
 */
export function provideEnhancedDocumentSymbols(
  params: DocumentSymbolParams,
  documents: TextDocuments<TextDocument>,
  connection?: Connection
): DocumentSymbol[] {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }

  try {
    // Get basic document symbols first
    const basicSymbols = getBasicDocumentSymbols(document);

    // Get workspace symbols and filter for related ones
    const workspaceSymbols = getWorkspaceSymbolsForDocument(document, documents, connection);

    // Combine and deduplicate
    const allSymbols = [...basicSymbols, ...workspaceSymbols];

    // Remove duplicates based on name and kind
    const seen = new Set<string>();
    const uniqueSymbols = allSymbols.filter(symbol => {
      const key = `${symbol.name}-${symbol.kind}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });

    return uniqueSymbols;

  } catch (error) {
    connection?.console.warn(`Error getting enhanced document symbols for ${document.uri}: ${error}`);
    return getBasicDocumentSymbols(document);
  }
}

/**
 * Get workspace symbols that are relevant to the current document
 */
function getWorkspaceSymbolsForDocument(
  document: TextDocument,
  documents: TextDocuments<TextDocument>,
  connection?: Connection
): DocumentSymbol[] {
  const workspaceSymbols: DocumentSymbol[] = [];
  const currentDocUri = document.uri;

  try {
    // Get all component references in the current document
    const allComponentData = utils.getCachedWorkspaceComponents(documents);
    const componentReferences = utils.parseComponentReferencesInDocument(document, allComponentData);

    // Extract unique component types and labels referenced in this document
    const referencedComponents = new Set<string>();
    const referencedLabels = new Set<string>();

    for (const ref of componentReferences) {
      if (ref.isValidReference) {
        referencedComponents.add(ref.componentType);
        if (ref.componentLabel) {
          referencedLabels.add(`${ref.componentType}:${ref.componentLabel}`);
        }
      }
    }

    // Get symbols from other documents that match our references
    for (const otherDoc of documents.all()) {
      if (otherDoc.uri === currentDocUri) continue;

      const otherDocSymbols = getBasicDocumentSymbols(otherDoc);

      for (const symbol of otherDocSymbols) {
        // Include component symbols that are referenced
        if (symbol.kind === SymbolKind.Class && referencedComponents.has(symbol.name)) {
          // Mark as external with different styling
          workspaceSymbols.push({
            ...symbol,
            name: `${symbol.name} (external)`,
            detail: `From: ${otherDoc.uri.split('/').pop()}`
          });
        }

        // Include label symbols that are referenced
        if (symbol.kind === SymbolKind.Variable &&
            symbol.detail &&
            referencedLabels.has(`${symbol.detail}:${symbol.name}`)) {
          workspaceSymbols.push({
            ...symbol,
            name: `${symbol.name} (external)`,
            detail: `From: ${otherDoc.uri.split('/').pop()}`
          });
        }
      }
    }

  } catch (error) {
    connection?.console.warn(`Error getting workspace symbols for document ${document.uri}: ${error}`);
  }

  return workspaceSymbols;
}

/**
 * Basic document symbol extraction (fallback)
 */
function getBasicDocumentSymbols(document: TextDocument): DocumentSymbol[] {
  const symbols: DocumentSymbol[] = [];

  try {
    // Get component declarations
    const componentDeclarations = utils.getAllComponentDeclarations(document);
    for (const decl of componentDeclarations) {
      const componentSymbol: DocumentSymbol = {
        name: `${decl.componentType} "${decl.label}"`,
        kind: SymbolKind.Class,
        range: Range.create(
          Position.create(decl.line, 0),
          Position.create(decl.line, 1000) // End of line approximation
        ),
        selectionRange: Range.create(
          Position.create(decl.line, decl.range.type.start),
          Position.create(decl.line, decl.range.type.end)
        ),
        children: []
      };

      // Add label as child symbol
      if (decl.label) {
        componentSymbol.children!.push({
          name: decl.label,
          kind: SymbolKind.Variable,
          range: Range.create(
            Position.create(decl.line, decl.range.label.start),
            Position.create(decl.line, decl.range.label.end)
          ),
          selectionRange: Range.create(
            Position.create(decl.line, decl.range.label.start),
            Position.create(decl.line, decl.range.label.end)
          )
        });
      }

      symbols.push(componentSymbol);
    }

    // Get config blocks
    const configBlocks = utils.parseConfigBlocks(document);
    for (const configBlock of configBlocks) {
      let symbolKind: SymbolKind;
      switch (configBlock.type) {
        case 'declare':
          symbolKind = SymbolKind.Function;
          break;
        case 'argument':
          symbolKind = SymbolKind.Property;
          break;
        case 'export':
          symbolKind = SymbolKind.Field;
          break;
        default:
          symbolKind = SymbolKind.Object;
      }

      const configSymbol: DocumentSymbol = {
        name: configBlock.label ? `${configBlock.type} "${configBlock.label}"` : configBlock.type,
        kind: symbolKind,
        range: configBlock.range,
        selectionRange: configBlock.range,
        children: []
      };

      symbols.push(configSymbol);
    }

  } catch (error) {
    console.warn(`Error getting document symbols for ${document.uri}: ${error}`);
  }

  return symbols;
}

/**
 * Enhanced symbol categorization and filtering
 */
export interface EnhancedSymbol extends SymbolInformation {
  category: 'component' | 'config' | 'argument' | 'label';
  priority: number;
  metadata?: {
    componentType?: string;
    hasArguments?: boolean;
    isReferenced?: boolean;
  };
}

/**
 * Categorize and enhance symbols with metadata
 */
function categorizeSymbols(symbols: SymbolInformation[]): EnhancedSymbol[] {
  return symbols.map(symbol => {
    let category: 'component' | 'config' | 'argument' | 'label';
    let priority = 0;
    const metadata: any = {};

    // Determine category and priority
    switch (symbol.kind) {
      case SymbolKind.Class:
        category = 'component';
        priority = 10;
        metadata.componentType = symbol.name;
        break;
      case SymbolKind.Variable:
        category = 'label';
        priority = 8;
        break;
      case SymbolKind.Property:
        category = 'argument';
        priority = 6;
        break;
      case SymbolKind.Function:
        category = 'config';
        priority = 7;
        break;
      case SymbolKind.Field:
        category = 'config';
        priority = 5;
        break;
      default:
        category = 'config';
        priority = 3;
    }

    // Boost priority for certain patterns
    if (symbol.name.includes('prometheus')) priority += 2;
    if (symbol.name.includes('loki')) priority += 2;
    if (symbol.name.includes('otel')) priority += 2;
    if (symbol.containerName === 'declare') priority += 1;

    return {
      ...symbol,
      category,
      priority,
      metadata
    };
  });
}

/**
 * Filter symbols by category and priority
 */
function filterAndSortSymbols(
  symbols: EnhancedSymbol[],
  query: string,
  maxResults: number = 150
): EnhancedSymbol[] {
  // First apply fuzzy filtering
  const fuzzyFiltered = fuzzyFilterSymbols(query, symbols, maxResults * 2);

  // Then apply category-based sorting
  return fuzzyFiltered
    .sort((a, b) => {
      // Sort by fuzzy score first
      if (a.fuzzyMatch && b.fuzzyMatch) {
        if (a.fuzzyMatch.score !== b.fuzzyMatch.score) {
          return b.fuzzyMatch.score - a.fuzzyMatch.score;
        }
      }

      // Then by priority
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }

      // Finally by category preference
      const categoryOrder = { component: 0, config: 1, label: 2, argument: 3 };
      const aOrder = categoryOrder[a.category];
      const bOrder = categoryOrder[b.category];

      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }

      return a.name.localeCompare(b.name);
    })
    .slice(0, maxResults);
}

/**
 * Get human-readable symbol kind name
 */
function getSymbolKindName(kind: SymbolKind): string {
  switch (kind) {
    case SymbolKind.Class: return 'Class';
    case SymbolKind.Method: return 'Method';
    case SymbolKind.Function: return 'Function';
    case SymbolKind.Variable: return 'Variable';
    case SymbolKind.Property: return 'Property';
    case SymbolKind.Field: return 'Field';
    case SymbolKind.Object: return 'Object';
    default: return 'Unknown';
  }
}

/**
 * Get symbol statistics for debugging
 */
export function getSymbolStatistics(symbols: SymbolInformation[]): {
  total: number;
  byKind: Record<string, number>;
  byCategory: Record<string, number>;
} {
  const stats = {
    total: symbols.length,
    byKind: {} as Record<string, number>,
    byCategory: {} as Record<string, number>
  };

  const enhancedSymbols = categorizeSymbols(symbols);

  symbols.forEach(symbol => {
    const kindName = getSymbolKindName(symbol.kind);
    stats.byKind[kindName] = (stats.byKind[kindName] || 0) + 1;
  });

  enhancedSymbols.forEach(symbol => {
    stats.byCategory[symbol.category] = (stats.byCategory[symbol.category] || 0) + 1;
  });

  return stats;
}

/**
 * Provide hover information for symbols
 */
export function provideSymbolHover(
  symbol: SymbolInformation,
  document: TextDocument,
  documents: TextDocuments<TextDocument>
): Hover | null {
  try {
    const content = generateSymbolHoverContent(symbol, document, documents);
    if (!content) return null;

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: content
      },
      range: symbol.location.range
    };
  } catch (error) {
    console.warn(`Error generating hover for symbol ${symbol.name}: ${error}`);
    return null;
  }
}

/**
 * Generate detailed hover content for a symbol
 */
function generateSymbolHoverContent(
  symbol: SymbolInformation,
  document: TextDocument,
  documents: TextDocuments<TextDocument>
): string | null {
  const lines = document.getText().split('\n');
  const line = lines[symbol.location.range.start.line];
  if (!line) return null;

  let content = `### ${symbol.name}\n\n`;

  // Add symbol type information
  content += `**Type:** ${getSymbolKindName(symbol.kind)}\n`;

  // Add container information
  if (symbol.containerName) {
    content += `**Container:** ${symbol.containerName}\n`;
  }

  // Add location information
  content += `**Location:** ${document.uri.split('/').pop()}:${symbol.location.range.start.line + 1}\n\n`;

  // Add code preview
  const preview = getCodePreview(document, symbol.location.range);
  if (preview) {
    content += `**Code:**\n\`\`\`alloy\n${preview}\n\`\`\`\n\n`;
  }

  // Add usage information
  const usage = getSymbolUsage(symbol, documents);
  if (usage.total > 0) {
    content += `**Usage:** ${usage.total} reference${usage.total !== 1 ? 's' : ''}\n`;
    if (usage.files > 1) {
      content += `**Files:** ${usage.files}\n`;
    }
  }

  // Add related symbols
  const related = findRelatedSymbols(symbol, documents);
  if (related.length > 0) {
    content += `\n**Related Symbols:**\n`;
    related.slice(0, 5).forEach(rel => {
      content += `- ${rel.name} (${getSymbolKindName(rel.kind)})\n`;
    });
    if (related.length > 5) {
      content += `- ... and ${related.length - 5} more\n`;
    }
  }

  return content;
}

/**
 * Get code preview around a symbol location
 */
function getCodePreview(document: TextDocument, range: Range): string {
  const lines = document.getText().split('\n');
  const startLine = Math.max(0, range.start.line - 2);
  const endLine = Math.min(lines.length - 1, range.end.line + 2);

  const preview = lines.slice(startLine, endLine + 1)
    .map((line, idx) => {
      const lineNum = startLine + idx + 1;
      const marker = (lineNum >= range.start.line + 1 && lineNum <= range.end.line + 1) ? '>' : ' ';
      return `${marker} ${lineNum}: ${line}`;
    })
    .join('\n');

  return preview;
}

/**
 * Get usage statistics for a symbol
 */
function getSymbolUsage(
  symbol: SymbolInformation,
  documents: TextDocuments<TextDocument>
): { total: number; files: number } {
  let total = 0;
  let files = 0;

  for (const doc of documents.all()) {
    if (doc.uri === symbol.location.uri) continue; // Skip the symbol's own file

    const references = utils.parseComponentReferencesInDocument(doc, utils.getAllAvailableComponents(doc));
    const symbolRefs = references.filter(ref =>
      ref.componentType === symbol.name ||
      ref.componentLabel === symbol.name ||
      (symbol.containerName && ref.componentType === symbol.containerName && ref.componentLabel === symbol.name)
    );

    if (symbolRefs.length > 0) {
      total += symbolRefs.length;
      files++;
    }
  }

  return { total, files };
}

/**
 * Find symbols related to the given symbol
 */
export function findRelatedSymbols(
  symbol: SymbolInformation,
  documents: TextDocuments<TextDocument>
): SymbolInformation[] {
  const related: SymbolInformation[] = [];

  // Find symbols in the same container
  if (symbol.containerName) {
    for (const doc of documents.all()) {
      const docSymbols = getDocumentSymbolsSync(doc);
      related.push(...docSymbols.filter(s =>
        s.containerName === symbol.containerName && s.name !== symbol.name
      ));
    }
  }

  // Find symbols that reference this symbol
  for (const doc of documents.all()) {
    if (doc.uri === symbol.location.uri) continue;

    const references = utils.parseComponentReferencesInDocument(doc, utils.getAllAvailableComponents(doc));
    const relevantRefs = references.filter(ref =>
      ref.componentType === symbol.name ||
      ref.componentLabel === symbol.name ||
      (symbol.containerName && ref.componentType === symbol.containerName)
    );

    if (relevantRefs.length > 0) {
      // Add the referencing component as related
      const docSymbols = getDocumentSymbolsSync(doc);
      related.push(...docSymbols.filter(s =>
        s.kind === SymbolKind.Class &&
        relevantRefs.some(ref => ref.componentType === s.name)
      ));
    }
  }

  return related;
}

/**
 * Synchronous version of document symbols for internal use
 */
function getDocumentSymbolsSync(document: TextDocument): SymbolInformation[] {
  const symbols: SymbolInformation[] = [];

  try {
    const components = utils.parseDocument(document);
    const configBlocks = utils.parseConfigBlocks(document);

    // Add components
    for (const component of components) {
      symbols.push({
        name: component.name,
        kind: SymbolKind.Class,
        location: Location.create(document.uri, component.range),
        containerName: component.label || undefined
      });

      if (component.label) {
        symbols.push({
          name: component.label,
          kind: SymbolKind.Variable,
          location: Location.create(document.uri, component.range),
          containerName: component.name
        });
      }
    }

    // Add config blocks
    for (const configBlock of configBlocks) {
      let kind: SymbolKind;
      switch (configBlock.type) {
        case 'declare': kind = SymbolKind.Function; break;
        case 'argument': kind = SymbolKind.Property; break;
        case 'export': kind = SymbolKind.Field; break;
        default: kind = SymbolKind.Object;
      }

      symbols.push({
        name: configBlock.label || configBlock.type,
        kind,
        location: Location.create(document.uri, configBlock.range),
        containerName: configBlock.type
      });
    }
  } catch (error) {
    console.warn(`Error getting symbols for ${document.uri}: ${error}`);
  }

  return symbols;
}

/**
 * Provide document symbols for outline view with hierarchical relationships
 * Enhanced to optionally include workspace-wide symbols for better navigation
 */
export function provideDocumentSymbols(
  params: DocumentSymbolParams,
  documents: TextDocuments<TextDocument>,
  connection?: Connection
): DocumentSymbol[] {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }

  try {
    // Check if enhanced symbols are enabled
    const symbolsConfig = configManager.getSymbolsConfig();
    if (symbolsConfig.enableWorkspaceSymbolsInOutline) {
      return provideEnhancedDocumentSymbols(params, documents, connection);
    }

    // Try to get hierarchical symbols with relationships if available
    const analyzer = getRelationshipAnalyzer(connection);
    const hierarchicalSymbols = analyzer.getHierarchicalSymbols(document, documents);
    if (hierarchicalSymbols.length > 0) {
      return hierarchicalSymbols;
    }

    // Fallback to basic symbol extraction
    return getBasicDocumentSymbols(document);

  } catch (error) {
    connection?.console.warn(`Error getting hierarchical symbols for ${document.uri}, falling back to basic: ${error}`);
    return getBasicDocumentSymbols(document);
  }
}



/**
 * Filter symbols by type or category
 */
export function filterSymbolsByType(
  symbols: SymbolInformation[],
  types: SymbolKind[]
): SymbolInformation[] {
  return symbols.filter(symbol => types.includes(symbol.kind));
}

/**
 * Filter symbols by category
 */
export function filterSymbolsByCategory(
  symbols: SymbolInformation[],
  categories: Array<'component' | 'config' | 'argument' | 'label'>
): SymbolInformation[] {
  const enhancedSymbols = categorizeSymbols(symbols);
  return enhancedSymbols
    .filter(symbol => categories.includes(symbol.category))
    .map(symbol => ({
      name: symbol.name,
      kind: symbol.kind,
      location: symbol.location,
      containerName: symbol.containerName
    }));
}

/**
 * Advanced symbol scoring with context awareness
 */
export function calculateAdvancedScore(
  symbol: SymbolInformation,
  query: string,
  context: {
    recentlyUsed?: string[];
    frequentlyUsed?: string[];
    inCurrentFile?: boolean;
    fileType?: string;
  } = {}
): number {
  let score = 0;

  // Base fuzzy score
  const fuzzyResult = fuzzyMatch(query, symbol.name);
  if (fuzzyResult) {
    score += fuzzyResult.score;
  }

  // Context bonuses
  if (context.recentlyUsed?.includes(symbol.name)) score += 10;
  if (context.frequentlyUsed?.includes(symbol.name)) score += 5;
  if (context.inCurrentFile) score += 15;

  // File type bonuses
  if (context.fileType === 'alloy' && symbol.name.includes('prometheus')) score += 3;
  if (context.fileType === 'alloy' && symbol.name.includes('loki')) score += 3;
  if (context.fileType === 'alloy' && symbol.name.includes('otel')) score += 3;

  // Symbol type bonuses
  switch (symbol.kind) {
    case SymbolKind.Class: score += 5; break;
    case SymbolKind.Function: score += 3; break;
    case SymbolKind.Variable: score += 2; break;
    case SymbolKind.Property: score += 1; break;
  }

  return score;
}

/**
 * Symbol analytics and usage tracking
 */
export interface SymbolAnalytics {
  mostUsed: SymbolInformation[];
  unused: SymbolInformation[];
  crossFileReferences: number;
  popularTypes: Record<string, number>;
}

/**
 * Analyze symbol usage patterns
 */
export function analyzeSymbolUsage(
  symbols: SymbolInformation[],
  documents: TextDocuments<TextDocument>
): SymbolAnalytics {
  const usageMap = new Map<string, number>();
  const fileMap = new Map<string, Set<string>>();
  let crossFileReferences = 0;

  // Count references for each symbol
  for (const symbol of symbols) {
    let usageCount = 0;
    const files = new Set<string>();

    for (const doc of documents.all()) {
      if (doc.uri === symbol.location.uri) continue;

      const references = utils.parseComponentReferencesInDocument(doc, utils.getAllAvailableComponents(doc));
      const symbolRefs = references.filter(ref =>
        ref.componentType === symbol.name ||
        ref.componentLabel === symbol.name ||
        (symbol.containerName && ref.componentType === symbol.containerName && ref.componentLabel === symbol.name)
      );

      if (symbolRefs.length > 0) {
        usageCount += symbolRefs.length;
        files.add(doc.uri);
        crossFileReferences += symbolRefs.length;
      }
    }

    usageMap.set(symbol.name, usageCount);
    fileMap.set(symbol.name, files);
  }

  // Categorize symbols
  const mostUsed = symbols
    .filter(s => (usageMap.get(s.name) || 0) > 0)
    .sort((a, b) => (usageMap.get(b.name) || 0) - (usageMap.get(a.name) || 0));

  const unused = symbols.filter(s => (usageMap.get(s.name) || 0) === 0);

  // Count popular symbol types
  const popularTypes: Record<string, number> = {};
  symbols.forEach(symbol => {
    const typeName = getSymbolKindName(symbol.kind);
    popularTypes[typeName] = (popularTypes[typeName] || 0) + 1;
  });

  return {
    mostUsed,
    unused,
    crossFileReferences,
    popularTypes
  };
}

/**
 * Incremental symbol updates for changed files
 */
export function updateSymbolsIncrementally(
  changedFiles: string[],
  existingSymbols: SymbolInformation[],
  documents: TextDocuments<TextDocument>
): SymbolInformation[] {
  // Remove symbols from changed files
  const filteredSymbols = existingSymbols.filter(symbol =>
    !changedFiles.some(file => symbol.location.uri.includes(file))
  );

  // Add updated symbols from changed files
  const updatedSymbols: SymbolInformation[] = [];

  for (const file of changedFiles) {
    const document = documents.all().find(doc => doc.uri.includes(file));
    if (document) {
      updatedSymbols.push(...getDocumentSymbolsSync(document));
    }
  }

  return [...filteredSymbols, ...updatedSymbols];
}