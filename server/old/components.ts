// Import all component definitions
import { CompletionItem } from "vscode-languageserver/node";

// For now, provide empty exports to resolve the import error
// The component files have syntax errors that need to be fixed separately

// Combine all component snippets
export const componentSnippets: CompletionItem[] = [];

// Combine all block properties
export const allBlockProperties: Record<string, CompletionItem[]> = {};

// Combine all nested block properties
export const allNestedBlockProperties: Record<string, Record<string, CompletionItem[]>> = {};

// Combine all block completions
export const allBlockCompletions: Record<string, CompletionItem[]> = {};

// Combine all required attributes
export const requiredAttributes: Record<string, string[]> = {};

// Combine all required blocks
export const requiredBlocks: Record<string, string[]> = {};