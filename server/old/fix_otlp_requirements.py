#!/usr/bin/env python3
"""
Fix the otelcol.receiver.otlp component to mark http and grpc as recommended instead of required
"""

def fix_otlp_requirements():
    """Fix the TypeScript file to mark http/grpc blocks as recommended"""
    file_path = "components/otelcol.ts"
    
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Replace the required blocks line to only include output
    content = content.replace(
        '"otelcol.receiver.otlp": ["output", "grpc", "http"],',
        '"otelcol.receiver.otlp": ["output"],'
    )
    
    # Ensure grpc and http are in the recommended attributes
    otlp_recommended = '''  "otelcol.receiver.otlp": {
    "output": ["metrics", "logs", "traces"],
  },'''
    
    otlp_recommended_fixed = '''  "otelcol.receiver.otlp": {
    "output": ["metrics", "logs", "traces"],
    "grpc": ["endpoint"],
    "http": ["endpoint"],
  },'''
    
    if otlp_recommended in content and otlp_recommended_fixed not in content:
        content = content.replace(otlp_recommended, otlp_recommended_fixed)
        print("Added grpc and http to recommended attributes")
    
    # Fix block completion descriptions for grpc and http in otelcol.receiver.otlp
    # They should be marked as optional, not required
    grpc_required_pattern = '''    createSnippet(
      "grpc",
      CompletionItemKind.Snippet,
      `grpc {\\n\\t\\${1:/* configuration */}\\n}`,
      "Configures the gRPC server to receive telemetry data.",
      "grpc {...} - required",
    ),'''
    
    grpc_optional_pattern = '''    createSnippet(
      "grpc",
      CompletionItemKind.Snippet,
      `grpc {\\n\\t\\${1:/* configuration */}\\n}`,
      "Configures the gRPC server to receive telemetry data.",
      "grpc {...} - optional",
    ),'''
    
    http_required_pattern = '''    createSnippet(
      "http",
      CompletionItemKind.Snippet,
      `http {\\n\\t\\${1:/* configuration */}\\n}`,
      "Configures the HTTP server to receive telemetry data.",
      "http {...} - required",
    ),'''
    
    http_optional_pattern = '''    createSnippet(
      "http",
      CompletionItemKind.Snippet,
      `http {\\n\\t\\${1:/* configuration */}\\n}`,
      "Configures the HTTP server to receive telemetry data.",
      "http {...} - optional",
    ),'''
    
    if grpc_required_pattern in content:
        content = content.replace(grpc_required_pattern, grpc_optional_pattern)
        print("Fixed grpc block completion to be optional")
        
    if http_required_pattern in content:
        content = content.replace(http_required_pattern, http_optional_pattern)
        print("Fixed http block completion to be optional")
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print("Fixed otelcol.receiver.otlp requirements")

if __name__ == "__main__":
    fix_otlp_requirements()