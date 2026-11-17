import { CompletionItem } from "vscode-languageserver/node";

export interface BlockContent {
  content: string;
  endIndex: number;
}

export interface ComponentData {
  componentSnippets: CompletionItem[];
  blockProperties: Record<string, CompletionItem[]>;
  requiredAttributes: Record<string, string[]>;
}

export interface BlockParseResult {
  parentBlockType: string | null;
  offset: number;
}