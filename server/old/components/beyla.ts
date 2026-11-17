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

export const beylaComponents: CompletionItem[] = [
  createSnippet(
    "beyla.ebpf",
    CompletionItemKind.Snippet,
    `beyla.ebpf "\${1:label}" {\n\tenforce_sys_caps = \${2|true,false|}\n\n\toutput {\n\t}\n\n\tattributes {\n\t}\n\n\tselect {\n\t}\n}`,
    "Note",
    '"beyla.ebpf" { ... }',
  ),
];

export const beylaBlockProperties: Record<string, CompletionItem[]> = {
  "beyla.ebpf": [
    createSnippet(
      "debug",
      CompletionItemKind.Property,
      `debug = \${1|true,false|}`,
      "Enable debug mode for Beyla.",
      "bool - optional - default: false",
    ),
    createSnippet(
      "enforce_sys_caps",
      CompletionItemKind.Property,
      `enforce_sys_caps = \${1|true,false|}`,
      "Enforce system capabilities required for eBPF instrumentation.",
      "bool - required - default: false",
    ),
    createSnippet(
      "trace_printer",
      CompletionItemKind.Property,
      `trace_printer = "\${1:"disabled"}"`,
      "Format for printing trace information.",
      "string - optional - default: \"disabled\"",
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

export const beylaRequiredAttributes: Record<string, string[]> = {
  "beyla.ebpf": ["enforce_sys_caps"],
  "client": ["endpoint"],
  "endpoint": ["url"],
  "basic_auth": ["username", "password"],
};

export const beylaRecommendedAttributes: Record<string, Record<string, string[]>> = {
  "beyla.ebpf": {
    "select": ["attr", "include", "exclude"],
  },
};

export const beylaBlockCompletions: Record<string, CompletionItem[]> = {
  "beyla.ebpf": [
    createSnippet(
      "output",
      CompletionItemKind.Snippet,
      `output {\n\t\${1:/* configuration */}\n}`,
      "Configures where to send received telemetry data.",
      "output {...} - required",
    ),
    createSnippet(
      "attributes",
      CompletionItemKind.Snippet,
      `attributes {\n\t\${1:/* configuration */}\n}`,
      "Configures the Beyla attributes for the component.",
      "attributes {...} - required",
    ),
    createSnippet(
      "discovery",
      CompletionItemKind.Snippet,
      `discovery {\n\t\${1:/* configuration */}\n}`,
      "Configures the discovery for processes to instrument matching given criteria.",
      "discovery {...} - optional",
    ),
    createSnippet(
      "ebpf",
      CompletionItemKind.Snippet,
      `ebpf {\n\t\${1:/* configuration */}\n}`,
      "Configures eBPF-specific settings.",
      "ebpf {...} - optional",
    ),
    createSnippet(
      "filters",
      CompletionItemKind.Snippet,
      `filters {\n\t\${1:/* configuration */}\n}`,
      "Configures filtering of attributes.",
      "filters {...} - optional",
    ),
    createSnippet(
      "metrics",
      CompletionItemKind.Snippet,
      `metrics {\n\t\${1:/* configuration */}\n}`,
      "Configures which metrics Beyla exposes.",
      "metrics {...} - optional",
    ),
    createSnippet(
      "routes",
      CompletionItemKind.Snippet,
      `routes {\n\t\${1:/* configuration */}\n}`,
      "Configures the routes to match HTTP paths into user-provided HTTP routes.",
      "routes {...} - optional",
    ),
    createSnippet(
      "select",
      CompletionItemKind.Snippet,
      `select {\n\t\${1:/* configuration */}\n}`,
      "Configuration block for select",
      "select {...} - required",
    ),
  ],
};

export const beylaNestedBlockProperties: Record<string, Record<string, CompletionItem[]>> = {
  "beyla.ebpf": {
    "select": [
      createSnippet(
        "attr",
        CompletionItemKind.Property,
        `attr = "\${1:attr}"`,
        "attr configuration",
        "string - recommended",
      ),
      createSnippet(
        "include",
        CompletionItemKind.Property,
        `include = [\${1:/* values */}]`,
        "include configuration",
        "list - recommended",
      ),
      createSnippet(
        "exclude",
        CompletionItemKind.Property,
        `exclude = [\${1:/* values */}]`,
        "exclude configuration",
        "list - recommended",
      ),
    ],
  },
};

export const beylaRequiredBlocks: Record<string, string[]> = {
  "beyla.ebpf": ["output", "attributes", "select"],
};

export const beylaConditionalRequirements: Record<string, Record<string, string[]>> = {
};
