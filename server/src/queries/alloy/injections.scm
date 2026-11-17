; Language injections for Alloy configuration files
; This file defines how to inject other languages (like regex) into Alloy code

; Inject regex language into regex arguments within any component
; This pattern matches string literals that are values of "regex" keys
(
  (assignment
    key: (identifier) @_key
    (#eq? @_key "regex")
    value: (string_literal) @injection.content
  )
  (#set! injection.language "regex")
  (#offset! @injection.content 0 1 0 -1)
)

; Pattern specifically for loki.relabel components
; This ensures we capture regex patterns in loki.relabel rule blocks
(
  (component
    name: (component_name) @_component
    (#match? @_component "^loki\.relabel")
    (block
      (rule
        (assignment
          key: (identifier) @_key
          (#eq? @_key "regex")
          value: (string_literal) @injection.content
        )
      )
    )
  )
  (#set! injection.language "regex")
  (#offset! @injection.content 0 1 0 -1)
)

; Fallback pattern for any regex assignment in a rule context
(
  (rule
    (assignment
      key: (identifier) @_key
      (#eq? @_key "regex")
      value: (string_literal) @injection.content
    )
  )
  (#set! injection.language "regex")
  (#offset! @injection.content 0 1 0 -1)
)