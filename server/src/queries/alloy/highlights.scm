; Syntax highlighting for Alloy configuration files

; Keywords
[
  "declare"
  "argument"
  "export"
  "optional"
  "required"
  "default"
  "value"
  "type"
  "comment"
] @keyword

; Component names (dot-separated identifiers)
(component_name) @function.call

; Component labels/instances
(component_label) @string

; Block names and identifiers
(identifier) @variable

; Argument references
(argument_reference) @variable.builtin

; String literals
(string_literal) @string

; Numbers
(number) @number

; Comments
(comment) @comment

; Operators and punctuation
[
  "="
  "{"
  "}"
  "["
  "]"
  "("
  ")"
  ","
  "."
] @operator

; Regex patterns (these will be handled by injection)
(
  (assignment
    key: (identifier) @_key
    (#eq? @_key "regex")
    value: (string_literal) @string.regex
  )
)

; Special highlighting for specific component types
(component
  name: (component_name) @_name
  (#match? @_name "^loki\.")
  label: (component_label) @function
)

(component
  name: (component_name) @_name
  (#match? @_name "^prometheus\.")
  label: (component_label) @function
)

(component
  name: (component_name) @_name
  (#match? @_name "^otelcol\.")
  label: (component_label) @function
)