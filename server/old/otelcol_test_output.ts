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

export const otelcol_testComponents: CompletionItem[] = [
  createSnippet(
    "otelcol.receiver.otlp",
    CompletionItemKind.Snippet,
    `otelcol.receiver.otlp "\${1:label}" {\n\n\toutput {\n\t}\n}`,
    "otelcol.receiver.otlp accepts OTLP-formatted data over the network and forwards it to other otelcol.* components.",
    '"otelcol.receiver.otlp" { ... }',
  ),
];

export const otelcol_testBlockProperties: Record<string, CompletionItem[]> = {
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

export const otelcol_testRequiredAttributes: Record<string, string[]> = {
  "client": ["endpoint"],
  "endpoint": ["url"],
  "basic_auth": ["username", "password"],
};

export const otelcol_testRecommendedAttributes: Record<string, Record<string, string[]>> = {
  "otelcol.receiver.otlp": {
    "output": ["metrics", "logs", "traces"],
  },
};

export const otelcol_testBlockCompletions: Record<string, CompletionItem[]> = {
  "otelcol.receiver.otlp": [
    createSnippet(
      "output",
      CompletionItemKind.Snippet,
      `output {\n\t\${1:/* configuration */}\n}`,
      "Configures where to send received telemetry data.",
      "output {...} - required",
    ),
    createSnippet(
      "debug_metrics",
      CompletionItemKind.Snippet,
      `debug_metrics {\n\t\${1:/* configuration */}\n}`,
      "Configures the metrics that this component generates to monitor its state.",
      "debug_metrics {...} - optional",
    ),
    createSnippet(
      "grpc",
      CompletionItemKind.Snippet,
      `grpc {\n\t\${1:/* configuration */}\n}`,
      "Configures the gRPC server to receive telemetry data.",
      "grpc {...} - optional",
    ),
    createSnippet(
      "http",
      CompletionItemKind.Snippet,
      `http {\n\t\${1:/* configuration */}\n}`,
      "Configures the HTTP server to receive telemetry data.",
      "http {...} - optional",
    ),
  ],
};

export const otelcol_testNestedBlockProperties: Record<string, Record<string, CompletionItem[]>> = {
  "otelcol.receiver.otlp": {
    "output": [
      createSnippet(
        "metrics",
        CompletionItemKind.Property,
        `metrics = [\${1:/* values */}]`,
        "metrics configuration",
        "list - recommended",
      ),
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

export const otelcol_testRequiredBlocks: Record<string, string[]> = {
  "otelcol.receiver.otlp": ["output"],
};

export const otelcol_testConditionalRequirements: Record<string, Record<string, string[]>> = {
};
