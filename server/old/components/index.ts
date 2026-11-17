// Import all component definitions
import { CompletionItem } from "vscode-languageserver/node";

// Import from individual component files - only import what exists
import { beylaComponents, beylaBlockProperties, beylaNestedBlockProperties, beylaBlockCompletions, beylaRequiredAttributes, beylaRequiredBlocks } from "./beyla";
import { database_observabilityComponents, database_observabilityBlockProperties, database_observabilityNestedBlockProperties, database_observabilityBlockCompletions, database_observabilityRequiredAttributes, database_observabilityRequiredBlocks } from "./database_observability";
import { otelcolComponents, otelcolBlockProperties, otelcolNestedBlockProperties, otelcolBlockCompletions, otelcolRequiredAttributes, otelcolRequiredBlocks } from "./otelcol";
import { prometheusComponents, prometheusBlockProperties, prometheusNestedBlockProperties, prometheusBlockCompletions, prometheusRequiredAttributes, prometheusRequiredBlocks } from "./prometheus";

// Combine all component snippets
export const componentSnippets: CompletionItem[] = [
  ...beylaComponents,
  ...database_observabilityComponents,
  ...otelcolComponents,
  ...prometheusComponents,
];

// Combine all block properties
export const allBlockProperties: Record<string, CompletionItem[]> = {
  ...beylaBlockProperties,
  ...database_observabilityBlockProperties,
  ...otelcolBlockProperties,
  ...prometheusBlockProperties,
};

// Combine all nested block properties
export const allNestedBlockProperties: Record<string, Record<string, CompletionItem[]>> = {
  ...beylaNestedBlockProperties,
  ...database_observabilityNestedBlockProperties,
  ...otelcolNestedBlockProperties,
  ...prometheusNestedBlockProperties,
};

// Combine all block completions
export const allBlockCompletions: Record<string, CompletionItem[]> = {
  ...beylaBlockCompletions,
  ...database_observabilityBlockCompletions,
  ...otelcolBlockCompletions,
  ...prometheusBlockCompletions,
};

// Combine all required attributes
export const requiredAttributes: Record<string, string[]> = {
  ...beylaRequiredAttributes,
  ...database_observabilityRequiredAttributes,
  ...otelcolRequiredAttributes,
  ...prometheusRequiredAttributes,
};

// Combine all required blocks
export const requiredBlocks: Record<string, string[]> = {
  ...beylaRequiredBlocks,
  ...database_observabilityRequiredBlocks,
  ...otelcolRequiredBlocks,
  ...prometheusRequiredBlocks,
};