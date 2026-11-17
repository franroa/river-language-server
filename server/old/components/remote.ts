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

export const remoteComponents: CompletionItem[] = [
  createSnippet(
    "remote.http",
    CompletionItemKind.Snippet,
    `remote.http "\${1:label}" {\n\turl = "\${2:url}"\n}`,
    "remote.http exposes the response body of a URL to other components. The URL is polled for changes so that the most recent content is always available.",
    '"remote.http" { ... }',
  ),
  createSnippet(
    "remote.kubernetes.configmap",
    CompletionItemKind.Snippet,
    `remote.kubernetes.configmap "\${1:label}" {\n\tname = "\${2:name}"\n\tnamespace = "\${3:namespace}"\n}`,
    "remote.kubernetes.configmap reads a ConfigMap from the Kubernetes API server and exposes its data for other components to consume.",
    '"remote.kubernetes.configmap" { ... }',
  ),
  createSnippet(
    "remote.kubernetes.secret",
    CompletionItemKind.Snippet,
    `remote.kubernetes.secret "\${1:label}" {\n\tname = "\${2:name}"\n\tnamespace = "\${3:namespace}"\n}`,
    "remote.kubernetes.secret reads a Secret from the Kubernetes API server and exposes its data for other components to consume.",
    '"remote.kubernetes.secret" { ... }',
  ),
  createSnippet(
    "remote.s3",
    CompletionItemKind.Snippet,
    `remote.s3 "\${1:label}" {\n\tpath = "\${2:path}"\n}`,
    "remote.s3 exposes the string contents of a file located in AWS S3 to other components. The file is polled for changes so that the most recent content is always available.",
    '"remote.s3" { ... }',
  ),
  createSnippet(
    "remote.vault",
    CompletionItemKind.Snippet,
    `remote.vault "\${1:label}" {\n\tpath = "\${2:path}"\n\tserver = "\${3:server}"\n}`,
    "remote.vault connects to a HashiCorp Vault server to retrieve secrets. It can retrieve a secret using the KV v2 secrets engine.",
    '"remote.vault" { ... }',
  ),
];

export const remoteBlockProperties: Record<string, CompletionItem[]> = {
  "remote.http": [
    createSnippet(
      "url",
      CompletionItemKind.Property,
      `url = "\${1:url}"`,
      "URL to poll.",
      "string - required - default: ",
    ),
    createSnippet(
      "body",
      CompletionItemKind.Property,
      `body = "\${1:""}"`,
      "The request body.",
      "string - optional - default: \"\"",
    ),
    createSnippet(
      "headers",
      CompletionItemKind.Property,
      `headers = "\${1:{}}"`,
      "Custom headers for the request.",
      "map(string) - optional - default: {}",
    ),
    createSnippet(
      "is_secret",
      CompletionItemKind.Property,
      `is_secret = \${1|true,false|}`,
      "Whether the response body should be treated as a secret.",
      "bool - optional - default: false",
    ),
    createSnippet(
      "method",
      CompletionItemKind.Property,
      `method = "\${1:"GET"}"`,
      "Define HTTP method for the request",
      "string - optional - default: \"GET\"",
    ),
    createSnippet(
      "poll_frequency",
      CompletionItemKind.Property,
      `poll_frequency = \${1:poll_frequency}`,
      "Frequency to poll the URL.",
      "duration - optional - default: \"1m\"",
    ),
    createSnippet(
      "poll_timeout",
      CompletionItemKind.Property,
      `poll_timeout = \${1:poll_timeout}`,
      "Timeout when polling the URL.",
      "duration - optional - default: \"10s\"",
    ),
  ],
  "remote.kubernetes.configmap": [
    createSnippet(
      "name",
      CompletionItemKind.Property,
      `name = "\${1:name}"`,
      "Name of the Kubernetes ConfigMap",
      "string - required - default: ",
    ),
    createSnippet(
      "namespace",
      CompletionItemKind.Property,
      `namespace = "\${1:namespace}"`,
      "Kubernetes namespace containing the desired ConfigMap.",
      "string - required - default: ",
    ),
    createSnippet(
      "poll_frequency",
      CompletionItemKind.Property,
      `poll_frequency = \${1:poll_frequency}`,
      "Frequency to poll the Kubernetes API.",
      "duration - optional - default: \"1m\"",
    ),
    createSnippet(
      "poll_timeout",
      CompletionItemKind.Property,
      `poll_timeout = \${1:poll_timeout}`,
      "Timeout when polling the Kubernetes API.",
      "duration - optional - default: \"15s\"",
    ),
  ],
  "remote.kubernetes.secret": [
    createSnippet(
      "name",
      CompletionItemKind.Property,
      `name = "\${1:name}"`,
      "Name of the Kubernetes Secret",
      "string - required - default: ",
    ),
    createSnippet(
      "namespace",
      CompletionItemKind.Property,
      `namespace = "\${1:namespace}"`,
      "Kubernetes namespace containing the desired Secret.",
      "string - required - default: ",
    ),
    createSnippet(
      "poll_frequency",
      CompletionItemKind.Property,
      `poll_frequency = \${1:poll_frequency}`,
      "Frequency to poll the Kubernetes API.",
      "duration - optional - default: \"1m\"",
    ),
    createSnippet(
      "poll_timeout",
      CompletionItemKind.Property,
      `poll_timeout = \${1:poll_timeout}`,
      "Timeout when polling the Kubernetes API.",
      "duration - optional - default: \"15s\"",
    ),
  ],
  "remote.s3": [
    createSnippet(
      "path",
      CompletionItemKind.Property,
      `path = "\${1:path}"`,
      "Path in the format of \"s3://bucket/file\".",
      "string - required - default: ",
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
      "How often to poll the file for changes. Must be greater than 30 seconds.",
      "duration - optional - default: \"10m\"",
    ),
  ],
  "remote.vault": [
    createSnippet(
      "path",
      CompletionItemKind.Property,
      `path = "\${1:path}"`,
      "The path to retrieve a secret from.",
      "string - required - default: ",
    ),
    createSnippet(
      "server",
      CompletionItemKind.Property,
      `server = "\${1:server}"`,
      "The Vault server to connect to.",
      "string - required - default: ",
    ),
    createSnippet(
      "namespace",
      CompletionItemKind.Property,
      `namespace = "\${1:namespace}"`,
      "The Vault namespace to connect to (Vault Enterprise only).",
      "string - optional - default: ",
    ),
    createSnippet(
      "key",
      CompletionItemKind.Property,
      `key = "\${1:key}"`,
      "The key to retrieve a secret from.",
      "string - optional - default: ",
    ),
    createSnippet(
      "reread_frequency",
      CompletionItemKind.Property,
      `reread_frequency = \${1:reread_frequency}`,
      "Rate to re-read keys.",
      "duration - optional - default: \"0s\"",
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

export const remoteRequiredAttributes: Record<string, string[]> = {
  "remote.http": ["url"],
  "remote.kubernetes.configmap": ["name", "namespace"],
  "remote.kubernetes.secret": ["name", "namespace"],
  "remote.s3": ["path"],
  "remote.vault": ["path", "server"],
  "client": ["endpoint"],
  "endpoint": ["url"],
  "basic_auth": ["username", "password"],
};

export const remoteRecommendedAttributes: Record<string, Record<string, string[]>> = {
};

export const remoteBlockCompletions: Record<string, CompletionItem[]> = {
  "remote.http": [
    createSnippet(
      "client",
      CompletionItemKind.Snippet,
      `client {\n\t\${1:/* configuration */}\n}`,
      "HTTP client settings when connecting to the endpoint.",
      "client {...} - optional",
    ),
  ],
  "remote.kubernetes.configmap": [
    createSnippet(
      "client",
      CompletionItemKind.Snippet,
      `client {\n\t\${1:/* configuration */}\n}`,
      "Configures Kubernetes client used to find ConfigMaps.",
      "client {...} - optional",
    ),
  ],
  "remote.kubernetes.secret": [
    createSnippet(
      "client",
      CompletionItemKind.Snippet,
      `client {\n\t\${1:/* configuration */}\n}`,
      "Configures Kubernetes client used to find Secrets.",
      "client {...} - optional",
    ),
  ],
  "remote.s3": [
    createSnippet(
      "client",
      CompletionItemKind.Snippet,
      `client {\n\t\${1:/* configuration */}\n}`,
      "Additional options for configuring the S3 client.",
      "client {...} - optional",
    ),
  ],
  "remote.vault": [
    createSnippet(
      "auth.approle",
      CompletionItemKind.Snippet,
      `auth.approle {\n\t\${1:/* configuration */}\n}`,
      "Authenticate to Vault using AppRole.",
      "auth.approle {...} - optional",
    ),
    createSnippet(
      "auth.aws",
      CompletionItemKind.Snippet,
      `auth.aws {\n\t\${1:/* configuration */}\n}`,
      "Authenticate to Vault using AWS.",
      "auth.aws {...} - optional",
    ),
    createSnippet(
      "auth.azure",
      CompletionItemKind.Snippet,
      `auth.azure {\n\t\${1:/* configuration */}\n}`,
      "Authenticate to Vault using Azure.",
      "auth.azure {...} - optional",
    ),
    createSnippet(
      "auth.custom",
      CompletionItemKind.Snippet,
      `auth.custom {\n\t\${1:/* configuration */}\n}`,
      "Authenticate to Vault with custom authentication.",
      "auth.custom {...} - optional",
    ),
    createSnippet(
      "auth.gcp",
      CompletionItemKind.Snippet,
      `auth.gcp {\n\t\${1:/* configuration */}\n}`,
      "Authenticate to Vault using GCP.",
      "auth.gcp {...} - optional",
    ),
    createSnippet(
      "auth.kubernetes",
      CompletionItemKind.Snippet,
      `auth.kubernetes {\n\t\${1:/* configuration */}\n}`,
      "Authenticate to Vault using Kubernetes.",
      "auth.kubernetes {...} - optional",
    ),
    createSnippet(
      "auth.ldap",
      CompletionItemKind.Snippet,
      `auth.ldap {\n\t\${1:/* configuration */}\n}`,
      "Authenticate to Vault using LDAP.",
      "auth.ldap {...} - optional",
    ),
    createSnippet(
      "auth.token",
      CompletionItemKind.Snippet,
      `auth.token {\n\t\${1:/* configuration */}\n}`,
      "Authenticate to Vault with a token.",
      "auth.token {...} - optional",
    ),
    createSnippet(
      "auth.userpass",
      CompletionItemKind.Snippet,
      `auth.userpass {\n\t\${1:/* configuration */}\n}`,
      "Authenticate to Vault using a username and password.",
      "auth.userpass {...} - optional",
    ),
    createSnippet(
      "client_options",
      CompletionItemKind.Snippet,
      `client_options {\n\t\${1:/* configuration */}\n}`,
      "Options for the Vault client.",
      "client_options {...} - optional",
    ),
  ],
};

export const remoteNestedBlockProperties: Record<string, Record<string, CompletionItem[]>> = {
  "remote.http": {
  },
  "remote.kubernetes.configmap": {
  },
  "remote.kubernetes.secret": {
  },
  "remote.s3": {
  },
  "remote.vault": {
  },
};

export const remoteRequiredBlocks: Record<string, string[]> = {
};

export const remoteConditionalRequirements: Record<string, Record<string, string[]>> = {
};
