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

export const database_observabilityComponents: CompletionItem[] = [
  createSnippet(
    "database_observability.mysql",
    CompletionItemKind.Snippet,
    `database_observability.mysql "\${1:label}" {\n\tdata_source_name = \${2:data_source_name}\n\tforward_to = [\${3:/* values */}]\n}`,
    "EXPERIMENTAL: This is an experimental component. Experimental components are subject to frequent breaking changes, and may be removed with no equivalent replacement. To enable and use an experimental component, you must set the stability.level flag to experimental.",
    '"database_observability.mysql" { ... }',
  ),
  createSnippet(
    "database_observability.postgres",
    CompletionItemKind.Snippet,
    `database_observability.postgres "\${1:label}" {\n\tdata_source_name = \${2:data_source_name}\n\tforward_to = [\${3:/* values */}]\n}`,
    "EXPERIMENTAL: This is an experimental component. Experimental components are subject to frequent breaking changes, and may be removed with no equivalent replacement. To enable and use an experimental component, you must set the stability.level flag to experimental.",
    '"database_observability.postgres" { ... }',
  ),
];

export const database_observabilityBlockProperties: Record<string, CompletionItem[]> = {
  "database_observability.mysql": [
    createSnippet(
      "data_source_name",
      CompletionItemKind.Property,
      `data_source_name = \${1:data_source_name}`,
      "Data Source Name for the MySQL server to connect to.",
      "secret - required - default: ",
    ),
    createSnippet(
      "forward_to",
      CompletionItemKind.Property,
      `forward_to = [\${1:/* values */}]`,
      "Where to forward log entries after processing.",
      "list(LogsReceiver) - required - default: ",
    ),
    createSnippet(
      "collect_interval",
      CompletionItemKind.Property,
      `collect_interval = \${1:collect_interval}`,
      "How frequently to collect information from database.",
      "duration - optional - default: \"1m\"",
    ),
    createSnippet(
      "disable_collectors",
      CompletionItemKind.Property,
      `disable_collectors = "\${1:disable_collectors}"`,
      "A list of collectors to disable from the default set.",
      "list(string) - optional - default: ",
    ),
    createSnippet(
      "disable_query_redaction",
      CompletionItemKind.Property,
      `disable_query_redaction = \${1|true,false|}`,
      "Collect unredacted SQL query text including parameters.",
      "bool - optional - default: false",
    ),
    createSnippet(
      "enable_collectors",
      CompletionItemKind.Property,
      `enable_collectors = "\${1:enable_collectors}"`,
      "A list of collectors to enable on top of the default set.",
      "list(string) - optional - default: ",
    ),
    createSnippet(
      "explain_plan_collect_interval",
      CompletionItemKind.Property,
      `explain_plan_collect_interval = \${1:explain_plan_collect_interval}`,
      "How frequently to collect explain plan information from database.",
      "duration - optional - default: \"1m\"",
    ),
    createSnippet(
      "explain_plan_per_collect_ratio",
      CompletionItemKind.Property,
      `explain_plan_per_collect_ratio = \${1:explain_plan_per_collect_ratio}`,
      "Ratio of explain plan queries to collect per collect interval.",
      "float - optional - default: 1.0",
    ),
    createSnippet(
      "explain_plan_initial_lookback",
      CompletionItemKind.Property,
      `explain_plan_initial_lookback = \${1:explain_plan_initial_lookback}`,
      "How far back to look for explain plan queries on the first collection interval.",
      "duration - optional - default: \"24h\"",
    ),
    createSnippet(
      "locks_collect_interval",
      CompletionItemKind.Property,
      `locks_collect_interval = \${1:locks_collect_interval}`,
      "How frequently to collect locks information from database.",
      "duration - optional - default: \"30s\"",
    ),
    createSnippet(
      "locks_threshold",
      CompletionItemKind.Property,
      `locks_threshold = \${1:locks_threshold}`,
      "Threshold for locks to be considered slow. If a lock exceeds this duration, it will be logged.",
      "duration - optional - default: \"1s\"",
    ),
    createSnippet(
      "setup_consumers_collect_interval",
      CompletionItemKind.Property,
      `setup_consumers_collect_interval = \${1:setup_consumers_collect_interval}`,
      "How frequently to collect performance_schema.setup_consumers information from the database.",
      "duration - optional - default: \"1h\"",
    ),
  ],
  "database_observability.postgres": [
    createSnippet(
      "data_source_name",
      CompletionItemKind.Property,
      `data_source_name = \${1:data_source_name}`,
      "Data Source Name for the Postgres server to connect to.",
      "secret - required - default: ",
    ),
    createSnippet(
      "forward_to",
      CompletionItemKind.Property,
      `forward_to = [\${1:/* values */}]`,
      "Where to forward log entries after processing.",
      "list(LogsReceiver) - required - default: ",
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

export const database_observabilityRequiredAttributes: Record<string, string[]> = {
  "database_observability.mysql": ["data_source_name", "forward_to"],
  "database_observability.postgres": ["data_source_name", "forward_to"],
  "client": ["endpoint"],
  "endpoint": ["url"],
  "basic_auth": ["username", "password"],
};

export const database_observabilityRecommendedAttributes: Record<string, Record<string, string[]>> = {
};

export const database_observabilityBlockCompletions: Record<string, CompletionItem[]> = {
};

export const database_observabilityNestedBlockProperties: Record<string, Record<string, CompletionItem[]>> = {
};

export const database_observabilityRequiredBlocks: Record<string, string[]> = {
};

export const database_observabilityConditionalRequirements: Record<string, Record<string, string[]>> = {
};
