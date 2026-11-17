import {
  WorkspaceSymbolParams,
  SymbolInformation
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { TextDocuments } from "vscode-languageserver/node";
import { provideDocumentSymbols } from "./symbolProvider";

interface WorkspaceSymbolWithScore extends SymbolInformation {
  score: number;
}

/**
 * Provides workspace-wide symbol search functionality
 */
export function provideWorkspaceSymbols(
  params: WorkspaceSymbolParams,
  documents: TextDocuments<TextDocument>
): SymbolInformation[] {
  const query = params.query.toLowerCase().trim();
  const allSymbols: WorkspaceSymbolWithScore[] = [];

  // Get symbols from all open documents
  for (const document of documents.all()) {
    try {
      const documentSymbols = provideDocumentSymbols(
        { textDocument: { uri: document.uri } },
        documents
      );

      // Convert DocumentSymbols to SymbolInformation with scoring
      for (const symbol of documentSymbols) {
        const symbolInfo = convertToSymbolInformation(symbol, document.uri);
        const score = calculateScore(symbolInfo.name, query);
        
        if (score > 0) {
          allSymbols.push({ ...symbolInfo, score });
        }
      }
    } catch (error) {
      // Silently skip documents that can't be processed
      continue;
    }
  }

  // Sort by score (descending) then by name
  allSymbols.sort((a, b) => {
    if (a.score !== b.score) {
      return b.score - a.score;
    }
    return a.name.localeCompare(b.name);
  });

  // Remove score property and limit results
  const maxResults = 100;
  return allSymbols.slice(0, maxResults).map(symbol => {
    const { score, ...symbolInfo } = symbol;
    return symbolInfo;
  });
}

/**
 * Convert DocumentSymbol to SymbolInformation
 */
function convertToSymbolInformation(
  symbol: any,
  uri: string
): SymbolInformation {
  return {
    name: symbol.name,
    kind: symbol.kind,
    location: {
      uri,
      range: symbol.range
    },
    containerName: symbol.detail || undefined
  };
}

/**
 * Calculate relevance score for a symbol name against query
 */
function calculateScore(symbolName: string, query: string): number {
  if (!query) {
    return 1; // Show all symbols if no query
  }

  const name = symbolName.toLowerCase();
  const q = query.toLowerCase();

  // Exact match gets highest score
  if (name === q) {
    return 100;
  }

  // Starts with query gets high score
  if (name.startsWith(q)) {
    return 80;
  }

  // Contains query gets medium score
  if (name.includes(q)) {
    return 60;
  }

  // Fuzzy match (characters in order) gets lower score
  if (fuzzyMatch(name, q)) {
    return 40;
  }

  // Check if query matches component type patterns
  if (matchesComponentPattern(name, q)) {
    return 50;
  }

  return 0; // No match
}

/**
 * Fuzzy matching - checks if query characters appear in order
 */
function fuzzyMatch(text: string, query: string): boolean {
  let queryIndex = 0;
  
  for (let i = 0; i < text.length && queryIndex < query.length; i++) {
    if (text[i] === query[queryIndex]) {
      queryIndex++;
    }
  }
  
  return queryIndex === query.length;
}

/**
 * Check if query matches common Alloy component patterns
 */
function matchesComponentPattern(symbolName: string, query: string): boolean {
  const name = symbolName.toLowerCase();
  const q = query.toLowerCase();

  // Common Alloy patterns
  const patterns = [
    // Component types
    'prometheus', 'loki', 'otelcol', 'jaeger', 'pyroscope',
    // Component actions
    'scrape', 'write', 'receive', 'export', 'process', 'transform',
    // Declare blocks
    'declare'
  ];

  // Check if query matches start of component type
  for (const pattern of patterns) {
    if (pattern.startsWith(q) && name.includes(pattern)) {
      return true;
    }
  }

  // Check for component.action patterns like "prom.scrape"
  if (q.includes('.')) {
    const parts = q.split('.');
    if (parts.length === 2) {
      const [typeQuery, actionQuery] = parts;
      return name.includes(typeQuery) && name.includes(actionQuery);
    }
  }

  return false;
}

/**
 * Enhanced workspace symbols that includes file scanning for better coverage
 */
export async function provideEnhancedWorkspaceSymbols(
  params: WorkspaceSymbolParams,
  documents: TextDocuments<TextDocument>,
  workspaceFolders: string[]
): Promise<SymbolInformation[]> {
  const query = params.query.toLowerCase().trim();
  const allSymbols: WorkspaceSymbolWithScore[] = [];

  // First, get symbols from open documents (fast)
  const openDocumentSymbols = provideWorkspaceSymbols(params, documents);
  for (const symbol of openDocumentSymbols) {
    allSymbols.push({
      ...symbol,
      score: calculateScore(symbol.name, query)
    });
  }

  // If we don't have enough results, scan workspace files
  if (allSymbols.length < 20 && workspaceFolders.length > 0) {
    try {
        const fs = require('fs');

      for (const workspaceFolder of workspaceFolders) {
        const alloyFiles = await scanForAlloyFiles(workspaceFolder);
        
        // Limit file scanning to prevent performance issues
        const filesToScan = alloyFiles.slice(0, 50);
        
        for (const filePath of filesToScan) {
          try {
            // Skip if already processed (open document)
            const uri = `file://${filePath}`;
            if (documents.get(uri)) {
              continue;
            }

            const content = fs.readFileSync(filePath, 'utf-8');
            const document = TextDocument.create(uri, 'alloy', 1, content);
            
            const documentSymbols = provideDocumentSymbols(
              { textDocument: { uri } },
              { 
                get: () => document,
                all: () => [document]
              } as any
            );

            for (const symbol of documentSymbols) {
              const symbolInfo = convertToSymbolInformation(symbol, uri);
              const score = calculateScore(symbolInfo.name, query);
              
              if (score > 0) {
                allSymbols.push({ ...symbolInfo, score });
              }
            }
          } catch (error) {
            // Skip files that can't be processed
            continue;
          }
        }
      }
    } catch (error) {
      // Fallback to open documents only
    }
  }

  // Sort and deduplicate
  const uniqueSymbols = new Map<string, WorkspaceSymbolWithScore>();
  
  for (const symbol of allSymbols) {
    const key = `${symbol.name}:${symbol.location.uri}:${symbol.location.range.start.line}`;
    const existing = uniqueSymbols.get(key);
    
    if (!existing || symbol.score > existing.score) {
      uniqueSymbols.set(key, symbol);
    }
  }

  const result = Array.from(uniqueSymbols.values())
    .sort((a, b) => {
      if (a.score !== b.score) {
        return b.score - a.score;
      }
      return a.name.localeCompare(b.name);
    })
    .slice(0, 100)
    .map(symbol => {
      const { score, ...symbolInfo } = symbol;
      return symbolInfo;
    });

  return result;
}

/**
 * Scan directory for .alloy files
 */
async function scanForAlloyFiles(directory: string): Promise<string[]> {
  const fs = require('fs').promises;
  const path = require('path');
  const files: string[] = [];

  async function scanDir(dir: string, depth: number = 0): Promise<void> {
    // Limit recursion depth to prevent infinite loops
    if (depth > 5) return;

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          await scanDir(fullPath, depth + 1);
        } else if (entry.isFile() && entry.name.endsWith('.alloy')) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Skip directories we can't access
    }
  }

  await scanDir(directory);
  return files;
}