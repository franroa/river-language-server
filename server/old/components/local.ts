import {
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
} from "vscode-languageserver/node";

function createSnippet(
  label: string,
  kind: CompletionItemKind,
  insertText: string,
  documentation: string,
  detail: string,
): CompletionItem {
  return {
    label,
    kind,
    insertText,
    insertTextFormat: InsertTextFormat.Snippet,
    documentation,
    detail,
  };
}

export const localComponents: CompletionItem[] = [
  createSnippet(
    "local.file",
    CompletionItemKind.Snippet,
    `local.file "\${1:label}" {\n\tfilename = "\${2:filename}"\n}`,
    "local.file exposes the contents of a file on disk to other components. The file is watched for changes so that its latest content is always exposed.",
    '"local.file" { ... }',
  ),
  createSnippet(
    "local.file_match",
    CompletionItemKind.Snippet,
    `local.file_match "\${1:label}" {\n\tpath_targets = "\${2:path_targets}"\n}`,
    "local.file_match discovers files on the local filesystem using glob patterns and the doublestar library.",
    '"local.file_match" { ... }',
  ),
];

export const localBlockProperties: Record<string, CompletionItem[]> = {
  "local.file": [
    createSnippet(
      "filename",
      CompletionItemKind.Property,
      `filename = "\${1:filename}"`,
      "Path of the file on disk to watch.",
      "string - required - default: ",
    ),
    createSnippet(
      "detector",
      CompletionItemKind.Property,
      `detector = "\${1:"fsnotify"}"`,
      "Which file change detector to use, fsnotify or poll.",
      "string - optional - default: \"fsnotify\"",
    ),
    createSnippet(
      "is_secret",
      CompletionItemKind.Property,
      `is_secret = \${1|true,false|}`,
      "Marks the file as containing a secret.",
      "bool - optional - default: false",
    ),
    createSnippet(
      "poll_frequency",
      CompletionItemKind.Property,
      `poll_frequency = \${1:poll_frequency}`,
      "How often to poll for file changes.",
      "duration - optional - default: \"1m\"",
    ),
  ],
  "local.file_match": [
    createSnippet(
      "path_targets",
      CompletionItemKind.Property,
      `path_targets = "\${1:path_targets}"`,
      "Targets to expand; looks for glob patterns on the __path__ and __path_exclude__ keys.",
      "list(map(string)) - required - default: ",
    ),
    createSnippet(
      "ignore_older_than",
      CompletionItemKind.Property,
      `ignore_older_than = \${1:ignore_older_than}`,
      "Ignores files with modification times before this duration.",
      "duration - optional - default: \"0s\"",
    ),
    createSnippet(
      "sync_period",
      CompletionItemKind.Property,
      `sync_period = \${1:sync_period}`,
      "How often to sync filesystem and targets.",
      "duration - optional - default: \"10s\"",
    ),
  ],
  "output": [
    createSnippet(
      "metrics_receiver",
      CompletionItemKind.Property,
      `metrics_receiver = [\${1:/* receiver */}]`,
      "Receptores para métricas.",
      "list(MetricsReceiver) - optional",
    ),
    createSnippet(
      "logs_receiver",
      CompletionItemKind.Property,
      `logs_receiver = [\${1:/* receiver */}]`,
      "Receptores para logs.",
      "list(LogsReceiver) - optional",
    ),
    createSnippet(
      "traces_receiver",
      CompletionItemKind.Property,
      `traces_receiver = [\${1:/* receiver */}]`,
      "Receptores para trazas.",
      "list(TracesReceiver) - optional",
    ),
  ],
  "client": [
    createSnippet(
      "endpoint",
      CompletionItemKind.Property,
      `endpoint = "\${1:endpoint}"`,
      "Dirección del endpoint del cliente.",
      "string - required",
    ),
    createSnippet(
      "compression",
      CompletionItemKind.Property,
      `compression = "\${1|gzip,zlib,none|}"`,
      "Compresión a usar.",
      "string - optional (default: none)",
    ),
  ],
  "http": [
    createSnippet(
      "endpoint",
      CompletionItemKind.Property,
      `endpoint = "\${1:endpoint}"`,
      "Dirección del endpoint HTTP.",
      "string - optional (default: 0.0.0.0:4318)",
    ),
  ],
  "grpc": [
    createSnippet(
      "endpoint",
      CompletionItemKind.Property,
      `endpoint = "\${1:endpoint}"`,
      "Dirección del endpoint gRPC.",
      "string - optional (default: 0.0.0.0:4317)",
    ),
  ],
};

export const localRequiredAttributes: Record<string, string[]> = {
  "local.file": ["filename"],
  "local.file_match": ["path_targets"],
  "client": ["endpoint"],
  "endpoint": ["url"],
  "basic_auth": ["username", "password"],
};

export const localRecommendedAttributes: Record<string, Record<string, string[]>> = {
};

export const localBlockCompletions: Record<string, CompletionItem[]> = {
};

export const localNestedBlockProperties: Record<string, Record<string, CompletionItem[]>> = {
};

export const localRequiredBlocks: Record<string, string[]> = {
};

export const localConditionalRequirements: Record<string, Record<string, string[]>> = {
};
