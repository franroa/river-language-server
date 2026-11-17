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

export const mimirComponents: CompletionItem[] = [
  createSnippet(
    "mimir.rules.kubernetes",
    CompletionItemKind.Snippet,
    `mimir.rules.kubernetes "\${1:label}" {\n\taddress = "\${2:address}"\n}`,
    "mimir.rules.kubernetes discovers PrometheusRule Kubernetes resources and loads them into a Mimir instance.",
    '"mimir.rules.kubernetes" { ... }',
  ),
];

export const mimirBlockProperties: Record<string, CompletionItem[]> = {
  "mimir.rules.kubernetes": [
    createSnippet(
      "address",
      CompletionItemKind.Property,
      `address = "\${1:address}"`,
      "URL of the Mimir ruler.",
      "string - required - default: ",
    ),
    createSnippet(
      "bearer_token_file",
      CompletionItemKind.Property,
      `bearer_token_file = "\${1:bearer_token_file}"`,
      "File containing a bearer token to authenticate with.",
      "string - optional - default: ",
    ),
    createSnippet(
      "bearer_token",
      CompletionItemKind.Property,
      `bearer_token = \${1:bearer_token}`,
      "Bearer token to authenticate with.",
      "secret - optional - default: ",
    ),
    createSnippet(
      "enable_http2",
      CompletionItemKind.Property,
      `enable_http2 = \${1|true,false|}`,
      "Whether HTTP2 is supported for requests.",
      "bool - optional - default: true",
    ),
    createSnippet(
      "external_labels",
      CompletionItemKind.Property,
      `external_labels = "\${1:{}}"`,
      "Labels to add to each rule.",
      "map(string) - optional - default: {}",
    ),
    createSnippet(
      "follow_redirects",
      CompletionItemKind.Property,
      `follow_redirects = \${1|true,false|}`,
      "Whether redirects returned by the server should be followed.",
      "bool - optional - default: true",
    ),
    createSnippet(
      "http_headers",
      CompletionItemKind.Property,
      `http_headers = [\${1:/* values */}]`,
      "Custom HTTP headers to be sent along with each request. The map key is the header name.",
      "map(list(secret)) - optional - default: ",
    ),
    createSnippet(
      "mimir_namespace_prefix",
      CompletionItemKind.Property,
      `mimir_namespace_prefix = "\${1:"alloy"}"`,
      "Prefix used to differentiate multiple Alloy deployments.",
      "string - optional - default: \"alloy\"",
    ),
    createSnippet(
      "no_proxy",
      CompletionItemKind.Property,
      `no_proxy = "\${1:no_proxy}"`,
      "Comma-separated list of IP addresses, CIDR notations, and domain names to exclude from proxying.",
      "string - optional - default: ",
    ),
    createSnippet(
      "prometheus_http_prefix",
      CompletionItemKind.Property,
      `prometheus_http_prefix = "\${1:"/prometheus"}"`,
      "Path prefix for the Mimir Prometheus endpoint.",
      "string - optional - default: \"/prometheus\"",
    ),
    createSnippet(
      "proxy_connect_header",
      CompletionItemKind.Property,
      `proxy_connect_header = [\${1:/* values */}]`,
      "Specifies headers to send to proxies during CONNECT requests.",
      "map(list(secret)) - optional - default: ",
    ),
    createSnippet(
      "proxy_from_environment",
      CompletionItemKind.Property,
      `proxy_from_environment = \${1|true,false|}`,
      "Use the proxy URL indicated by environment variables.",
      "bool - optional - default: false",
    ),
    createSnippet(
      "proxy_url",
      CompletionItemKind.Property,
      `proxy_url = "\${1:proxy_url}"`,
      "HTTP proxy to send requests through.",
      "string - optional - default: ",
    ),
    createSnippet(
      "sync_interval",
      CompletionItemKind.Property,
      `sync_interval = \${1:sync_interval}`,
      "Amount of time between reconciliations with Mimir.",
      "duration - optional - default: \"5m\"",
    ),
    createSnippet(
      "tenant_id",
      CompletionItemKind.Property,
      `tenant_id = "\${1:tenant_id}"`,
      "Mimir tenant ID.",
      "string - optional - default: ",
    ),
    createSnippet(
      "use_legacy_routes",
      CompletionItemKind.Property,
      `use_legacy_routes = \${1|true,false|}`,
      "Whether to use deprecated ruler API endpoints.",
      "bool - optional - default: false",
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

export const mimirRequiredAttributes: Record<string, string[]> = {
  "mimir.rules.kubernetes": ["address"],
  "client": ["endpoint"],
  "endpoint": ["url"],
  "basic_auth": ["username", "password"],
};

export const mimirRecommendedAttributes: Record<string, Record<string, string[]>> = {
};

export const mimirBlockCompletions: Record<string, CompletionItem[]> = {
  "mimir.rules.kubernetes": [
    createSnippet(
      "authorization",
      CompletionItemKind.Snippet,
      `authorization {\n\t\${1:/* configuration */}\n}`,
      "Configure generic authorization to the endpoint.",
      "authorization {...} - optional",
    ),
    createSnippet(
      "basic_auth",
      CompletionItemKind.Snippet,
      `basic_auth {\n\tusername = "\${1:username}"\n\tpassword = "\${2:password}"\n}`,
      "Configure basic_auth for authenticating to the endpoint.",
      "basic_auth {...} - optional",
    ),
    createSnippet(
      "extra_query_matchers",
      CompletionItemKind.Snippet,
      `extra_query_matchers {\n\t\${1:/* configuration */}\n}`,
      "Additional label matchers to add to each query.",
      "extra_query_matchers {...} - optional",
    ),
    createSnippet(
      "oauth2",
      CompletionItemKind.Snippet,
      `oauth2 {\n\t\${1:/* configuration */}\n}`,
      "Configure OAuth 2.0 for authenticating to the endpoint.",
      "oauth2 {...} - optional",
    ),
    createSnippet(
      "rule_namespace_selector",
      CompletionItemKind.Snippet,
      `rule_namespace_selector {\n\t\${1:/* configuration */}\n}`,
      "Label selector for Namespace resources.",
      "rule_namespace_selector {...} - optional",
    ),
    createSnippet(
      "rule_selector",
      CompletionItemKind.Snippet,
      `rule_selector {\n\t\${1:/* configuration */}\n}`,
      "Label selector for PrometheusRule resources.",
      "rule_selector {...} - optional",
    ),
    createSnippet(
      "tls_config",
      CompletionItemKind.Snippet,
      `tls_config {\n\tcert_file = "\${1:/path/to/cert.pem}"\n\tkey_file = "\${2:/path/to/key.pem}"\n}`,
      "Configure TLS settings for connecting to the endpoint.",
      "tls_config {...} - optional",
    ),
  ],
};

export const mimirNestedBlockProperties: Record<string, Record<string, CompletionItem[]>> = {
  "mimir.rules.kubernetes": {
  },
};

export const mimirRequiredBlocks: Record<string, string[]> = {
};

export const mimirConditionalRequirements: Record<string, Record<string, string[]>> = {
};
