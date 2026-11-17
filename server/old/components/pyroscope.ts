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

export const pyroscopeComponents: CompletionItem[] = [
  createSnippet(
    "pyroscope.ebpf",
    CompletionItemKind.Snippet,
    `pyroscope.ebpf "\${1:label}" {\n\tforward_to = [\${2:/* values */}]\n\ttargets = "\${3:targets}"\n}`,
    "pyroscope.ebpf configures an eBPF profiling job for the current host. The collected performance profiles are forwarded to the list of receivers passed in forward_to.",
    '"pyroscope.ebpf" { ... }',
  ),
  createSnippet(
    "pyroscope.java",
    CompletionItemKind.Snippet,
    `pyroscope.java "\${1:label}" {\n\tforward_to = [\${2:/* values */}]\n\ttargets = "\${3:targets}"\n}`,
    "pyroscope.java continuously profiles Java processes running on the local Linux OS using async-profiler.",
    '"pyroscope.java" { ... }',
  ),
  createSnippet(
    "pyroscope.receive_http",
    CompletionItemKind.Snippet,
    `pyroscope.receive_http "\${1:label}" {\n\tforward_to = [\${2:/* values */}]\n\n\thttp {\n\t\tendpoint = "0.0.0.0:4318"\n\t}\n}`,
    "pyroscope.receive_http receives profiles over HTTP and forwards them to pyroscope.* components capable of receiving profiles.",
    '"pyroscope.receive_http" { ... }',
  ),
  createSnippet(
    "pyroscope.relabel",
    CompletionItemKind.Snippet,
    `pyroscope.relabel "\${1:label}" {\n\tforward_to = [\${2:/* values */}]\n\n\trule {\n\t}\n}`,
    "The pyroscope.relabel component rewrites the label set of each profile passed to its receiver by applying one or more relabeling rules and forwards the results to the list of receivers.",
    '"pyroscope.relabel" { ... }',
  ),
  createSnippet(
    "pyroscope.scrape",
    CompletionItemKind.Snippet,
    `pyroscope.scrape "\${1:label}" {\n\ttargets = "\${2:targets}"\n\tforward_to = [\${3:/* values */}]\n}`,
    "pyroscope.scrape collects pprof performance profiles for a given set of HTTP targets.",
    '"pyroscope.scrape" { ... }',
  ),
  createSnippet(
    "pyroscope.write",
    CompletionItemKind.Snippet,
    `pyroscope.write "\${1:label}" {\n\n\tendpoint {\n\t\turl = "http://localhost:8080/api/v1/endpoint"\n\t}\n}`,
    "pyroscope.write receives performance profiles from other components and forwards them to a series of user-supplied endpoints. When pyroscope.write forwards profiles, all labels starting with double underscore (__) are dropped before the data is sent, with the following exceptions:",
    '"pyroscope.write" { ... }',
  ),
];

export const pyroscopeBlockProperties: Record<string, CompletionItem[]> = {
  "pyroscope.ebpf": [
    createSnippet(
      "forward_to",
      CompletionItemKind.Property,
      `forward_to = [\${1:/* values */}]`,
      "List of receivers to send collected profiles to.",
      "list(ProfilesReceiver) - required - default: ",
    ),
    createSnippet(
      "targets",
      CompletionItemKind.Property,
      `targets = "\${1:targets}"`,
      "List of targets to group profiles by container id",
      "list(map(string)) - required - default: ",
    ),
    createSnippet(
      "build_id_cache_size",
      CompletionItemKind.Property,
      `build_id_cache_size = \${1:64}`,
      "The size of the elf file build id -> symbols table LRU cache",
      "int - optional - default: 64",
    ),
    createSnippet(
      "collect_interval",
      CompletionItemKind.Property,
      `collect_interval = \${1:collect_interval}`,
      "How frequently to collect profiles",
      "duration - optional - default: \"15s\"",
    ),
    createSnippet(
      "collect_kernel_profile",
      CompletionItemKind.Property,
      `collect_kernel_profile = \${1|true,false|}`,
      "A flag to enable/disable collection of kernelspace profiles",
      "bool - optional - default: true",
    ),
    createSnippet(
      "collect_user_profile",
      CompletionItemKind.Property,
      `collect_user_profile = \${1|true,false|}`,
      "A flag to enable/disable collection of userspace profiles",
      "bool - optional - default: true",
    ),
    createSnippet(
      "container_id_cache_size",
      CompletionItemKind.Property,
      `container_id_cache_size = \${1:1024}`,
      "The size of the PID -> container ID table LRU cache",
      "int - optional - default: 1024",
    ),
    createSnippet(
      "demangle",
      CompletionItemKind.Property,
      `demangle = "\${1:"none"}"`,
      "C++ demangle mode. Available options are: none, simplified, templates, or full",
      "string - optional - default: \"none\"",
    ),
    createSnippet(
      "go_table_fallback",
      CompletionItemKind.Property,
      `go_table_fallback = \${1|true,false|}`,
      "A flag to enable symbol lookup in .sym / .dynsym sections when .gopclntab lookup failed. May be useful for cgo binaries.",
      "bool - optional - default: false",
    ),
    createSnippet(
      "pid_cache_size",
      CompletionItemKind.Property,
      `pid_cache_size = \${1:32}`,
      "The size of the PID -> proc symbols table LRU cache",
      "int - optional - default: 32",
    ),
    createSnippet(
      "pid_map_size",
      CompletionItemKind.Property,
      `pid_map_size = \${1:2048}`,
      "The size of eBPF PID map",
      "int - optional - default: 2048",
    ),
    createSnippet(
      "python_enabled",
      CompletionItemKind.Property,
      `python_enabled = \${1|true,false|}`,
      "A flag to enable/disable python profiling",
      "bool - optional - default: true",
    ),
    createSnippet(
      "same_file_cache_size",
      CompletionItemKind.Property,
      `same_file_cache_size = \${1:8}`,
      "The size of the elf file -> symbols table LRU cache",
      "int - optional - default: 8",
    ),
    createSnippet(
      "sample_rate",
      CompletionItemKind.Property,
      `sample_rate = \${1:97}`,
      "How many times per second to collect profile samples",
      "int - optional - default: 97",
    ),
    createSnippet(
      "symbols_map_size",
      CompletionItemKind.Property,
      `symbols_map_size = \${1:16384}`,
      "The size of eBPF symbols map",
      "int - optional - default: 16384",
    ),
  ],
  "pyroscope.java": [
    createSnippet(
      "forward_to",
      CompletionItemKind.Property,
      `forward_to = [\${1:/* values */}]`,
      "List of receivers to send collected profiles to.",
      "list(ProfilesReceiver) - required - default: ",
    ),
    createSnippet(
      "targets",
      CompletionItemKind.Property,
      `targets = "\${1:targets}"`,
      "List of java process targets to profile.",
      "list(map(string)) - required - default: ",
    ),
    createSnippet(
      "tmp_dir",
      CompletionItemKind.Property,
      `tmp_dir = "\${1:"/tmp"}"`,
      "Temporary directory to store async-profiler.",
      "string - optional - default: \"/tmp\"",
    ),
  ],
  "pyroscope.receive_http": [
    createSnippet(
      "forward_to",
      CompletionItemKind.Property,
      `forward_to = [\${1:/* values */}]`,
      "List of receivers to send profiles to.",
      "list(ProfilesReceiver) - required - default: ",
    ),
  ],
  "pyroscope.relabel": [
    createSnippet(
      "forward_to",
      CompletionItemKind.Property,
      `forward_to = [\${1:/* values */}]`,
      "List of receivers to forward profiles to after relabeling",
      "list(pyroscope.Appendable) - required - default: ",
    ),
    createSnippet(
      "max_cache_size",
      CompletionItemKind.Property,
      `max_cache_size = \${1:10000}`,
      "Maximum number of entries in the label cache",
      "number - optional - default: 10000",
    ),
  ],
  "pyroscope.scrape": [
    createSnippet(
      "targets",
      CompletionItemKind.Property,
      `targets = "\${1:targets}"`,
      "List of targets to scrape.",
      "list(map(string)) - required - default: ",
    ),
    createSnippet(
      "forward_to",
      CompletionItemKind.Property,
      `forward_to = [\${1:/* values */}]`,
      "List of receivers to send scraped profiles to.",
      "list(ProfilesReceiver) - required - default: ",
    ),
    createSnippet(
      "job_name",
      CompletionItemKind.Property,
      `job_name = "\${1:component name}"`,
      "The job name to override the job label with.",
      "string - optional - default: component name",
    ),
    createSnippet(
      "params",
      CompletionItemKind.Property,
      `params = "\${1:params}"`,
      "A set of query parameters with which the target is scraped.",
      "map(list(string)) - optional - default: ",
    ),
    createSnippet(
      "scrape_interval",
      CompletionItemKind.Property,
      `scrape_interval = \${1:scrape_interval}`,
      "How frequently to scrape the targets of this scrape configuration.",
      "duration - optional - default: \"15s\"",
    ),
    createSnippet(
      "scrape_timeout",
      CompletionItemKind.Property,
      `scrape_timeout = \${1:scrape_timeout}`,
      "The timeout for scraping targets of this configuration. Must be larger than scrape_interval.",
      "duration - optional - default: \"18s\"",
    ),
    createSnippet(
      "delta_profiling_duration",
      CompletionItemKind.Property,
      `delta_profiling_duration = \${1:delta_profiling_duration}`,
      "The duration for a delta profiling to be scraped. Must be larger than 1 second.",
      "duration - optional - default: \"14s\"",
    ),
    createSnippet(
      "scheme",
      CompletionItemKind.Property,
      `scheme = "\${1:"http"}"`,
      "The URL scheme with which to fetch metrics from targets.",
      "string - optional - default: \"http\"",
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
      "proxy_url",
      CompletionItemKind.Property,
      `proxy_url = "\${1:proxy_url}"`,
      "HTTP proxy to send requests through.",
      "string - optional - default: ",
    ),
    createSnippet(
      "no_proxy",
      CompletionItemKind.Property,
      `no_proxy = "\${1:no_proxy}"`,
      "Comma-separated list of IP addresses, CIDR notations, and domain names to exclude from proxying.",
      "string - optional - default: ",
    ),
    createSnippet(
      "proxy_from_environment",
      CompletionItemKind.Property,
      `proxy_from_environment = \${1|true,false|}`,
      "Use the proxy URL indicated by environment variables.",
      "bool - optional - default: false",
    ),
    createSnippet(
      "proxy_connect_header",
      CompletionItemKind.Property,
      `proxy_connect_header = [\${1:/* values */}]`,
      "Specifies headers to send to proxies during CONNECT requests.",
      "map(list(secret)) - optional - default: ",
    ),
  ],
  "pyroscope.write": [
    createSnippet(
      "external_labels",
      CompletionItemKind.Property,
      `external_labels = "\${1:external_labels}"`,
      "Labels to add to profiles sent over the network.",
      "map(string) - optional - default: ",
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

export const pyroscopeRequiredAttributes: Record<string, string[]> = {
  "pyroscope.ebpf": ["forward_to", "targets"],
  "pyroscope.java": ["forward_to", "targets"],
  "pyroscope.receive_http": ["forward_to"],
  "pyroscope.relabel": ["forward_to"],
  "pyroscope.scrape": ["targets", "forward_to"],
  "client": ["endpoint"],
  "endpoint": ["url"],
  "basic_auth": ["username", "password"],
};

export const pyroscopeRecommendedAttributes: Record<string, Record<string, string[]>> = {
  "pyroscope.receive_http": {
    "http": ["listen_address", "listen_port"],
  },
};

export const pyroscopeBlockCompletions: Record<string, CompletionItem[]> = {
  "pyroscope.receive_http": [
    createSnippet(
      "http",
      CompletionItemKind.Snippet,
      `http {\n\t\${1:/* configuration */}\n}`,
      "Configures the HTTP server that receives requests.",
      "http {...} - required",
    ),
  ],
  "pyroscope.relabel": [
    createSnippet(
      "rule",
      CompletionItemKind.Snippet,
      `rule {\n\t\${1:/* configuration */}\n}`,
      "Relabeling rules to apply to received profile entries.",
      "rule {...} - required",
    ),
  ],
  "pyroscope.scrape": [
    createSnippet(
      "authorization",
      CompletionItemKind.Snippet,
      `authorization {\n\t\${1:/* configuration */}\n}`,
      "Configure generic authorization to targets.",
      "authorization {...} - optional",
    ),
    createSnippet(
      "basic_auth",
      CompletionItemKind.Snippet,
      `basic_auth {\n\tusername = "\${1:username}"\n\tpassword = "\${2:password}"\n}`,
      "Configure basic_auth for authenticating to targets.",
      "basic_auth {...} - optional",
    ),
    createSnippet(
      "clustering",
      CompletionItemKind.Snippet,
      `clustering {\n\t\${1:/* configuration */}\n}`,
      "Configure the component for when Alloy is running in clustered mode.",
      "clustering {...} - optional",
    ),
    createSnippet(
      "oauth2",
      CompletionItemKind.Snippet,
      `oauth2 {\n\t\${1:/* configuration */}\n}`,
      "Configure OAuth 2.0 for authenticating to targets.",
      "oauth2 {...} - optional",
    ),
    createSnippet(
      "profiling_config",
      CompletionItemKind.Snippet,
      `profiling_config {\n\t\${1:/* configuration */}\n}`,
      "Configure profiling settings for the scrape job.",
      "profiling_config {...} - optional",
    ),
    createSnippet(
      "tls_config",
      CompletionItemKind.Snippet,
      `tls_config {\n\tcert_file = "\${1:/path/to/cert.pem}"\n\tkey_file = "\${2:/path/to/key.pem}"\n}`,
      "Configure TLS settings for connecting to targets.",
      "tls_config {...} - optional",
    ),
  ],
  "pyroscope.write": [
    createSnippet(
      "endpoint",
      CompletionItemKind.Snippet,
      `endpoint {\n\turl = "\${1:http://localhost:9090/api/v1/write}"\n}`,
      "Location to send profiles to.",
      "endpoint {...} - required",
    ),
  ],
};

export const pyroscopeNestedBlockProperties: Record<string, Record<string, CompletionItem[]>> = {
  "pyroscope.receive_http": {
    "http": [
      createSnippet(
        "listen_address",
        CompletionItemKind.Property,
        `listen_address = "\${1:listen_address}"`,
        "listen_address configuration",
        "string - recommended",
      ),
      createSnippet(
        "listen_port",
        CompletionItemKind.Property,
        `listen_port = "\${1:listen_port}"`,
        "listen_port configuration",
        "string - recommended",
      ),
    ],
  },
  "pyroscope.relabel": {
  },
  "pyroscope.scrape": {
  },
  "pyroscope.write": {
    "endpoint": [
      createSnippet(
        "url",
        CompletionItemKind.Property,
        `url = "\${1:http://localhost:9090/api/v1/write}"`,
        "Full URL to send metrics to.",
        "string - required",
      ),
      createSnippet(
        "bearer_token_file",
        CompletionItemKind.Property,
        `bearer_token_file = "\${1:bearer_token_file}"`,
        "File containing a bearer token to authenticate with.",
        "string - optional",
      ),
      createSnippet(
        "bearer_token",
        CompletionItemKind.Property,
        `bearer_token = \${1:bearer_token}`,
        "Bearer token to authenticate with.",
        "secret - optional",
      ),
      createSnippet(
        "enable_http2",
        CompletionItemKind.Property,
        `enable_http2 = \${1|true,false|}`,
        "Whether HTTP2 is supported for requests.",
        "bool - optional - default: true",
      ),
      createSnippet(
        "follow_redirects",
        CompletionItemKind.Property,
        `follow_redirects = \${1|true,false|}`,
        "Whether redirects returned by the server should be followed.",
        "bool - optional - default: true",
      ),
      createSnippet(
        "headers",
        CompletionItemKind.Property,
        `headers = \${1:headers}`,
        "Extra headers to deliver with the request.",
        "map(string) - optional",
      ),
      createSnippet(
        "http_headers",
        CompletionItemKind.Property,
        `http_headers = \${1:http_headers}`,
        "Custom HTTP headers to be sent along with each request. The map key is the header name.",
        "map(list(secret)) - optional",
      ),
      createSnippet(
        "max_backoff_period",
        CompletionItemKind.Property,
        `max_backoff_period = \${1:max_backoff_period}`,
        "Maximum backoff time between retries.",
        "duration - optional - default: \"5m\"",
      ),
      createSnippet(
        "max_backoff_retries",
        CompletionItemKind.Property,
        `max_backoff_retries = \${1:0}`,
        "Maximum number of retries. 0 to retry infinitely.",
        "int - optional - default: 10",
      ),
      createSnippet(
        "min_backoff_period",
        CompletionItemKind.Property,
        `min_backoff_period = \${1:min_backoff_period}`,
        "Initial backoff time between retries.",
        "duration - optional - default: \"500ms\"",
      ),
      createSnippet(
        "name",
        CompletionItemKind.Property,
        `name = "\${1:name}"`,
        "Optional name to identify the endpoint in metrics.",
        "string - optional",
      ),
      createSnippet(
        "no_proxy",
        CompletionItemKind.Property,
        `no_proxy = "\${1:no_proxy}"`,
        "Comma-separated list of IP addresses, CIDR notations, and domain names to exclude from proxying.",
        "string - optional",
      ),
      createSnippet(
        "proxy_connect_header",
        CompletionItemKind.Property,
        `proxy_connect_header = \${1:proxy_connect_header}`,
        "Specifies headers to send to proxies during CONNECT requests.",
        "map(list(secret)) - optional",
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
        `proxy_url = "\${1:http://localhost:9090/api/v1/write}"`,
        "HTTP proxy to send requests through.",
        "string - optional",
      ),
      createSnippet(
        "remote_timeout",
        CompletionItemKind.Property,
        `remote_timeout = \${1:remote_timeout}`,
        "Timeout for requests made to the URL.",
        "duration - optional - default: \"10s\"",
      ),
    ],
  },
};

export const pyroscopeRequiredBlocks: Record<string, string[]> = {
  "pyroscope.receive_http": ["http"],
  "pyroscope.relabel": ["rule"],
  "pyroscope.write": ["endpoint"],
};

export const pyroscopeConditionalRequirements: Record<string, Record<string, string[]>> = {
};
