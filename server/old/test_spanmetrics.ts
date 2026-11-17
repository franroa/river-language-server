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

export const otelcolComponents: CompletionItem[] = [
  createSnippet(
    "otelcol.connector.spanmetrics",
    CompletionItemKind.Snippet,
    `otelcol.connector.spanmetrics "\${1:label}" {\n\n\thistogram {\n\t}\n\n\toutput {\n\t}\n}`,
    "otelcol.connector.spanmetrics accepts span data from other otelcol components and aggregates Request, Error, and Duration (R.E.D) OpenTelemetry metrics from the spans:",
    '"otelcol.connector.spanmetrics" { ... }',
  ),
];

export const otelcolBlockProperties: Record<string, CompletionItem[]> = {
  "otelcol.connector.spanmetrics": [
    createSnippet(
      "aggregation_temporality",
      CompletionItemKind.Property,
      `aggregation_temporality = "\${1:"CUMULATIVE"}"`,
      "Configures whether to reset the metrics after flushing.",
      "string - optional - default: \"CUMULATIVE\"",
    ),
    createSnippet(
      "dimensions_cache_size",
      CompletionItemKind.Property,
      `dimensions_cache_size = \${1:0}`,
      "(Deprecated: use aggregation_cardinality_limit instead) How many dimensions to cache.",
      "number - optional - default: 0",
    ),
    createSnippet(
      "exclude_dimensions",
      CompletionItemKind.Property,
      `exclude_dimensions = "\${1:[]}"`,
      "List of dimensions to be excluded from the default set of dimensions.",
      "list(string) - optional - default: []",
    ),
    createSnippet(
      "metric_timestamp_cache_size",
      CompletionItemKind.Property,
      `metric_timestamp_cache_size = \${1:1000}`,
      "Controls the size of a cache used to keep track of the last time a metric was flushed.",
      "number - optional - default: 1000",
    ),
    createSnippet(
      "metrics_expiration",
      CompletionItemKind.Property,
      `metrics_expiration = \${1:metrics_expiration}`,
      "Time period after which metrics are considered stale and are removed from the cache.",
      "duration - optional - default: \"0s\"",
    ),
    createSnippet(
      "metrics_flush_interval",
      CompletionItemKind.Property,
      `metrics_flush_interval = \${1:metrics_flush_interval}`,
      "How often to flush generated metrics.",
      "duration - optional - default: \"60s\"",
    ),
    createSnippet(
      "namespace",
      CompletionItemKind.Property,
      `namespace = "\${1:"traces.span.metrics"}"`,
      "Metric namespace.",
      "string - optional - default: \"traces.span.metrics\"",
    ),
    createSnippet(
      "resource_metrics_cache_size",
      CompletionItemKind.Property,
      `resource_metrics_cache_size = \${1:1000}`,
      "The size of the cache holding metrics for a service.",
      "number - optional - default: 1000",
    ),
    createSnippet(
      "resource_metrics_key_attributes",
      CompletionItemKind.Property,
      `resource_metrics_key_attributes = "\${1:[]}"`,
      "Limits the resource attributes used to create the metrics.",
      "list(string) - optional - default: []",
    ),
    createSnippet(
      "aggregation_cardinality_limit",
      CompletionItemKind.Property,
      `aggregation_cardinality_limit = \${1:0}`,
      "The maximum number of unique combinations of dimensions that will be tracked for metrics aggregation.",
      "number - optional - default: 0",
    ),
    createSnippet(
      "include_instrumentation_scope",
      CompletionItemKind.Property,
      `include_instrumentation_scope = "\${1:[]}"`,
      "A list of instrumentation scope names to include from the traces.",
      "list(string) - optional - default: []",
    ),
  ],
  "otelcol.connector.spanmetrics.histogram": [
    createSnippet(
      "disable",
      CompletionItemKind.Property,
      `disable = \${1|true,false|}`,
      "Disable all histogram metrics.",
      "bool - optional - default: false",
    ),
    createSnippet(
      "unit",
      CompletionItemKind.Property,
      `unit = "\${1:unit}"`,
      "Configures the histogram units.",
      "string - optional - default: \"ms\"",
    ),
  ],
  "otelcol.connector.spanmetrics.output": [
    createSnippet(
      "metrics",
      CompletionItemKind.Property,
      `metrics = [\${1:/* values */}]`,
      "metrics configuration",
      "list - recommended",
    ),
  ],
  "otelcol.connector.spanmetrics.dimension": [
    createSnippet(
      "default",
      CompletionItemKind.Property,
      `default = "\${1:default}"`,
      "Value to use if the attribute is missing.",
      "string - optional",
    ),
    createSnippet(
      "name",
      CompletionItemKind.Property,
      `name = "\${1:name}"`,
      "name configuration",
      "string - recommended",
    ),
  ],
  "otelcol.connector.spanmetrics.events": [
    createSnippet(
      "enabled",
      CompletionItemKind.Property,
      `enabled = \${1|true,false|}`,
      "Enables all events metric.",
      "bool - optional - default: false",
    ),
  ],
  "otelcol.connector.spanmetrics.exemplars": [
    createSnippet(
      "enabled",
      CompletionItemKind.Property,
      `enabled = \${1|true,false|}`,
      "Configures whether to add exemplars to histograms.",
      "bool - optional - default: false",
    ),
    createSnippet(
      "max_per_data_point",
      CompletionItemKind.Property,
      `max_per_data_point = \${1:max_per_data_point}`,
      "Limits the number of exemplars that can be added to a unique dimension set.",
      "number - optional - default: null",
    ),
  ],
  "otelcol.connector.spanmetrics.arguments": [
    createSnippet(
      "aggregation_temporality",
      CompletionItemKind.Property,
      `aggregation_temporality = "\${1:aggregation_temporality}"`,
      "Configures whether to reset the metrics after flushing.",
      "string - optional - default: \"CUMULATIVE\"",
    ),
    createSnippet(
      "dimensions_cache_size",
      CompletionItemKind.Property,
      `dimensions_cache_size = \${1:dimensions_cache_size}`,
      "(Deprecated: use aggregation_cardinality_limit instead) How many dimensions to cache.",
      "number - optional - default: 0",
    ),
    createSnippet(
      "exclude_dimensions",
      CompletionItemKind.Property,
      `exclude_dimensions = \${1:exclude_dimensions}`,
      "List of dimensions to be excluded from the default set of dimensions.",
      "list(string) - optional - default: []",
    ),
    createSnippet(
      "metric_timestamp_cache_size",
      CompletionItemKind.Property,
      `metric_timestamp_cache_size = \${1:metric_timestamp_cache_size}`,
      "Controls the size of a cache used to keep track of the last time a metric was flushed.",
      "number - optional - default: 1000",
    ),
    createSnippet(
      "metrics_expiration",
      CompletionItemKind.Property,
      `metrics_expiration = \${1:metrics_expiration}`,
      "Time period after which metrics are considered stale and are removed from the cache.",
      "duration - optional - default: \"0s\"",
    ),
    createSnippet(
      "metrics_flush_interval",
      CompletionItemKind.Property,
      `metrics_flush_interval = \${1:metrics_flush_interval}`,
      "How often to flush generated metrics.",
      "duration - optional - default: \"60s\"",
    ),
    createSnippet(
      "namespace",
      CompletionItemKind.Property,
      `namespace = "\${1:namespace}"`,
      "Metric namespace.",
      "string - optional - default: \"traces.span.metrics\"",
    ),
    createSnippet(
      "resource_metrics_cache_size",
      CompletionItemKind.Property,
      `resource_metrics_cache_size = \${1:resource_metrics_cache_size}`,
      "The size of the cache holding metrics for a service.",
      "number - optional - default: 1000",
    ),
    createSnippet(
      "resource_metrics_key_attributes",
      CompletionItemKind.Property,
      `resource_metrics_key_attributes = \${1:resource_metrics_key_attributes}`,
      "Limits the resource attributes used to create the metrics.",
      "list(string) - optional - default: []",
    ),
    createSnippet(
      "aggregation_cardinality_limit",
      CompletionItemKind.Property,
      `aggregation_cardinality_limit = \${1:aggregation_cardinality_limit}`,
      "The maximum number of unique combinations of dimensions that will be tracked for metrics aggregation.",
      "number - optional - default: 0",
    ),
    createSnippet(
      "include_instrumentation_scope",
      CompletionItemKind.Property,
      `include_instrumentation_scope = \${1:include_instrumentation_scope}`,
      "A list of instrumentation scope names to include from the traces.",
      "list(string) - optional - default: []",
    ),
  ],
  "otelcol.connector.spanmetrics.exponential": [
    createSnippet(
      "max_size",
      CompletionItemKind.Property,
      `max_size = \${1:max_size}`,
      "Maximum number of buckets per positive or negative number range.",
      "number - optional - default: 160",
    ),
  ],
  "otelcol.connector.spanmetrics.explicit": [
    createSnippet(
      "buckets",
      CompletionItemKind.Property,
      `buckets = \${1:buckets}`,
      "List of histogram buckets.",
      "list(duration) - optional - default: [\"2ms\", \"4ms\", \"6ms\", \"8ms\", \"10ms\", \"50ms\", \"100ms\", \"200ms\", \"400ms\", \"800ms\", \"1s\", \"1400ms\", \"2s\", \"5s\", \"10s\", \"15s\"]",
    ),
  ],
  "otelcol.connector.spanmetrics.client": [
    createSnippet(
      "endpoint",
      CompletionItemKind.Property,
      `endpoint = "\${1:endpoint}"`,
      "endpoint configuration",
      "string - recommended",
    ),
  ],
  "otelcol.connector.spanmetrics.endpoint": [
    createSnippet(
      "url",
      CompletionItemKind.Property,
      `url = "\${1:url}"`,
      "url configuration",
      "string - recommended",
    ),
  ],
  "otelcol.connector.spanmetrics.metric_statements": [
    createSnippet(
      "context",
      CompletionItemKind.Property,
      `context = "\${1:context}"`,
      "context configuration",
      "string - recommended",
    ),
    createSnippet(
      "statements",
      CompletionItemKind.Property,
      `statements = "\${1:statements}"`,
      "statements configuration",
      "string - recommended",
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

export const otelcolRequiredAttributes: Record<string, string[]> = {
  "client": ["endpoint"],
  "endpoint": ["url"],
  "basic_auth": ["username", "password"],
};

export const otelcolRecommendedAttributes: Record<string, Record<string, string[]>> = {
  "otelcol.connector.spanmetrics": {
    "output": ["metrics"],
    "dimension": ["name"],
    "client": ["endpoint"],
    "endpoint": ["url"],
    "metric_statements": ["context", "statements"],
  },
};

export const otelcolBlockCompletions: Record<string, CompletionItem[]> = {
  "otelcol.connector.spanmetrics": [
    createSnippet(
      "histogram",
      CompletionItemKind.Snippet,
      `histogram {\n\t\${1:/* configuration */}\n}`,
      "Configures the histogram derived from spans durations.",
      "histogram {...} - required",
    ),
    createSnippet(
      "output",
      CompletionItemKind.Snippet,
      `output {\n\t\${1:/* configuration */}\n}`,
      "Configures where to send telemetry data.",
      "output {...} - required",
    ),
    createSnippet(
      "calls_dimension",
      CompletionItemKind.Snippet,
      `calls_dimension {\n\t\${1:/* configuration */}\n}`,
      "Span event attributes to add as dimensions to the calls metric, on top of the default ones and the ones configured in the top-level dimension block",
      "calls_dimension {...} - optional",
    ),
    createSnippet(
      "debug_metrics",
      CompletionItemKind.Snippet,
      `debug_metrics {\n\t\${1:/* configuration */}\n}`,
      "Configures the metrics that this component generates to monitor its state.",
      "debug_metrics {...} - optional",
    ),
    createSnippet(
      "dimension",
      CompletionItemKind.Snippet,
      `dimension {\n\t\${1:/* configuration */}\n}`,
      "Dimensions to be added in addition to the default ones.",
      "dimension {...} - optional",
    ),
    createSnippet(
      "events",
      CompletionItemKind.Snippet,
      `events {\n\t\${1:/* configuration */}\n}`,
      "Configures the events metric.",
      "events {...} - optional",
    ),
    createSnippet(
      "exemplars",
      CompletionItemKind.Snippet,
      `exemplars {\n\t\${1:/* configuration */}\n}`,
      "Configures how to attach exemplars to histograms.",
      "exemplars {...} - optional",
    ),
    createSnippet(
      "arguments",
      CompletionItemKind.Snippet,
      `arguments {\n\t\${1:/* configuration */}\n}`,
      "Configuration block for arguments",
      "arguments {...} - optional",
    ),
    createSnippet(
      "exponential",
      CompletionItemKind.Snippet,
      `exponential {\n\t\${1:/* configuration */}\n}`,
      "Configuration block for exponential",
      "exponential {...} - optional",
    ),
    createSnippet(
      "explicit",
      CompletionItemKind.Snippet,
      `explicit {\n\t\${1:/* configuration */}\n}`,
      "Configuration block for explicit",
      "explicit {...} - optional",
    ),
    createSnippet(
      "client",
      CompletionItemKind.Snippet,
      `client {\n\t\${1:/* configuration */}\n}`,
      "Configuration block for client",
      "client {...} - optional",
    ),
    createSnippet(
      "endpoint",
      CompletionItemKind.Snippet,
      `endpoint {\n\t\${1:url} = "\${2:http://localhost:9090/api/v1/write}"\n}`,
      "Configuration block for endpoint",
      "endpoint {...} - optional",
    ),
    createSnippet(
      "metric_statements",
      CompletionItemKind.Snippet,
      `metric_statements {\n\t\${1:/* configuration */}\n}`,
      "Configuration block for metric_statements",
      "metric_statements {...} - optional",
    ),
  ],
};

export const otelcolNestedBlockProperties: Record<string, Record<string, CompletionItem[]>> = {
  "otelcol.connector.spanmetrics": {
    "histogram": [
      createSnippet(
        "disable",
        CompletionItemKind.Property,
        `disable = \${1|true,false|}`,
        "Disable all histogram metrics.",
        "bool - optional - default: false",
      ),
      createSnippet(
        "unit",
        CompletionItemKind.Property,
        `unit = "\${1:unit}"`,
        "Configures the histogram units.",
        "string - optional - default: \"ms\"",
      ),
    ],
    "output": [
      createSnippet(
        "metrics",
        CompletionItemKind.Property,
        `metrics = [\${1:/* values */}]`,
        "metrics configuration",
        "list - recommended",
      ),
    ],
    "dimension": [
      createSnippet(
        "default",
        CompletionItemKind.Property,
        `default = "\${1:default}"`,
        "Value to use if the attribute is missing.",
        "string - optional",
      ),
      createSnippet(
        "name",
        CompletionItemKind.Property,
        `name = "\${1:name}"`,
        "name configuration",
        "string - recommended",
      ),
    ],
    "events": [
      createSnippet(
        "enabled",
        CompletionItemKind.Property,
        `enabled = \${1|true,false|}`,
        "Enables all events metric.",
        "bool - optional - default: false",
      ),
    ],
    "exemplars": [
      createSnippet(
        "enabled",
        CompletionItemKind.Property,
        `enabled = \${1|true,false|}`,
        "Configures whether to add exemplars to histograms.",
        "bool - optional - default: false",
      ),
      createSnippet(
        "max_per_data_point",
        CompletionItemKind.Property,
        `max_per_data_point = \${1:max_per_data_point}`,
        "Limits the number of exemplars that can be added to a unique dimension set.",
        "number - optional - default: null",
      ),
    ],
    "arguments": [
      createSnippet(
        "aggregation_temporality",
        CompletionItemKind.Property,
        `aggregation_temporality = "\${1:aggregation_temporality}"`,
        "Configures whether to reset the metrics after flushing.",
        "string - optional - default: \"CUMULATIVE\"",
      ),
      createSnippet(
        "dimensions_cache_size",
        CompletionItemKind.Property,
        `dimensions_cache_size = \${1:dimensions_cache_size}`,
        "(Deprecated: use aggregation_cardinality_limit instead) How many dimensions to cache.",
        "number - optional - default: 0",
      ),
      createSnippet(
        "exclude_dimensions",
        CompletionItemKind.Property,
        `exclude_dimensions = \${1:exclude_dimensions}`,
        "List of dimensions to be excluded from the default set of dimensions.",
        "list(string) - optional - default: []",
      ),
      createSnippet(
        "metric_timestamp_cache_size",
        CompletionItemKind.Property,
        `metric_timestamp_cache_size = \${1:metric_timestamp_cache_size}`,
        "Controls the size of a cache used to keep track of the last time a metric was flushed.",
        "number - optional - default: 1000",
      ),
      createSnippet(
        "metrics_expiration",
        CompletionItemKind.Property,
        `metrics_expiration = \${1:metrics_expiration}`,
        "Time period after which metrics are considered stale and are removed from the cache.",
        "duration - optional - default: \"0s\"",
      ),
      createSnippet(
        "metrics_flush_interval",
        CompletionItemKind.Property,
        `metrics_flush_interval = \${1:metrics_flush_interval}`,
        "How often to flush generated metrics.",
        "duration - optional - default: \"60s\"",
      ),
      createSnippet(
        "namespace",
        CompletionItemKind.Property,
        `namespace = "\${1:namespace}"`,
        "Metric namespace.",
        "string - optional - default: \"traces.span.metrics\"",
      ),
      createSnippet(
        "resource_metrics_cache_size",
        CompletionItemKind.Property,
        `resource_metrics_cache_size = \${1:resource_metrics_cache_size}`,
        "The size of the cache holding metrics for a service.",
        "number - optional - default: 1000",
      ),
      createSnippet(
        "resource_metrics_key_attributes",
        CompletionItemKind.Property,
        `resource_metrics_key_attributes = \${1:resource_metrics_key_attributes}`,
        "Limits the resource attributes used to create the metrics.",
        "list(string) - optional - default: []",
      ),
      createSnippet(
        "aggregation_cardinality_limit",
        CompletionItemKind.Property,
        `aggregation_cardinality_limit = \${1:aggregation_cardinality_limit}`,
        "The maximum number of unique combinations of dimensions that will be tracked for metrics aggregation.",
        "number - optional - default: 0",
      ),
      createSnippet(
        "include_instrumentation_scope",
        CompletionItemKind.Property,
        `include_instrumentation_scope = \${1:include_instrumentation_scope}`,
        "A list of instrumentation scope names to include from the traces.",
        "list(string) - optional - default: []",
      ),
    ],
    "exponential": [
      createSnippet(
        "max_size",
        CompletionItemKind.Property,
        `max_size = \${1:max_size}`,
        "Maximum number of buckets per positive or negative number range.",
        "number - optional - default: 160",
      ),
    ],
    "explicit": [
      createSnippet(
        "buckets",
        CompletionItemKind.Property,
        `buckets = \${1:buckets}`,
        "List of histogram buckets.",
        "list(duration) - optional - default: [\"2ms\", \"4ms\", \"6ms\", \"8ms\", \"10ms\", \"50ms\", \"100ms\", \"200ms\", \"400ms\", \"800ms\", \"1s\", \"1400ms\", \"2s\", \"5s\", \"10s\", \"15s\"]",
      ),
    ],
    "client": [
      createSnippet(
        "endpoint",
        CompletionItemKind.Property,
        `endpoint = "\${1:http://localhost:8080}"`,
        "endpoint configuration",
        "string - recommended",
      ),
    ],
    "endpoint": [
      createSnippet(
        "url",
        CompletionItemKind.Property,
        `url = "\${1:http://localhost:9090/api/v1/write}"`,
        "url configuration",
        "string - recommended",
      ),
    ],
    "metric_statements": [
      createSnippet(
        "context",
        CompletionItemKind.Property,
        `context = "\${1:context}"`,
        "context configuration",
        "string - recommended",
      ),
      createSnippet(
        "statements",
        CompletionItemKind.Property,
        `statements = "\${1:statements}"`,
        "statements configuration",
        "string - recommended",
      ),
    ],
  },
};

export const otelcolRequiredBlocks: Record<string, string[]> = {
  "otelcol.connector.spanmetrics": ["histogram", "output"],
};

export const otelcolConditionalRequirements: Record<string, Record<string, string[]>> = {
};
