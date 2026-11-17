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

export const faroComponents: CompletionItem[] = [
  createSnippet(
    "faro.receiver",
    CompletionItemKind.Snippet,
    `faro.receiver "\${1:label}" {\n\n\toutput {\n\t}\n}`,
    "faro.receiver accepts web application telemetry data from the Grafana Faro Web SDK and forwards it to other components for processing.",
    '"faro.receiver" { ... }',
  ),
];

export const faroBlockProperties: Record<string, CompletionItem[]> = {
  "faro.receiver": [
    createSnippet(
      "extra_log_labels",
      CompletionItemKind.Property,
      `extra_log_labels = "\${1:{}}"`,
      "Extra labels to attach to emitted log lines.",
      "map(string) - optional - default: {}",
    ),
    createSnippet(
      "log_format",
      CompletionItemKind.Property,
      `log_format = "\${1:"logfmt"}"`,
      "Export format for the logs.",
      "string - optional - default: \"logfmt\"",
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

export const faroRequiredAttributes: Record<string, string[]> = {
  "client": ["endpoint"],
  "endpoint": ["url"],
  "basic_auth": ["username", "password"],
};

export const faroRecommendedAttributes: Record<string, Record<string, string[]>> = {
  "faro.receiver": {
    "output": ["logs", "traces"],
  },
};

export const faroBlockCompletions: Record<string, CompletionItem[]> = {
  "faro.receiver": [
    createSnippet(
      "output",
      CompletionItemKind.Snippet,
      `output {\n\t\${1:/* configuration */}\n}`,
      "Configures where to send collected telemetry data.",
      "output {...} - required",
    ),
    createSnippet(
      "server",
      CompletionItemKind.Snippet,
      `server {\n\t\${1:/* configuration */}\n}`,
      "Configures the HTTP server.",
      "server {...} - optional",
    ),
    createSnippet(
      "sourcemaps",
      CompletionItemKind.Snippet,
      `sourcemaps {\n\t\${1:/* configuration */}\n}`,
      "Configures sourcemap retrieval.",
      "sourcemaps {...} - optional",
    ),
  ],
};

export const faroNestedBlockProperties: Record<string, Record<string, CompletionItem[]>> = {
  "faro.receiver": {
    "output": [
      createSnippet(
        "logs",
        CompletionItemKind.Property,
        `logs = [\${1:/* values */}]`,
        "logs configuration",
        "list - recommended",
      ),
      createSnippet(
        "traces",
        CompletionItemKind.Property,
        `traces = [\${1:/* values */}]`,
        "traces configuration",
        "list - recommended",
      ),
    ],
  },
};

export const faroRequiredBlocks: Record<string, string[]> = {
  "faro.receiver": ["output"],
};

export const faroConditionalRequirements: Record<string, Record<string, string[]>> = {
};
