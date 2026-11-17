; Simplified language injection for regex in Alloy files
; Works with basic treesitter parsing

; Match any string literal following a "regex" identifier with an equals sign
(
  [
    (string_literal)
    (quoted_string)
  ] @injection.content
  (#match? @injection.content "\".*\"")
  (#lua-match? @injection.content "regex%s*=%s*")
  (#set! injection.language "regex")
  (#offset! @injection.content 0 1 0 -1)
)

; Alternative approach - match based on context patterns
; This looks for the pattern: regex = "..."
(
  (string_literal) @injection.content
  (#match? @injection.content "^\".*[\\^$.*+?{}\\[\\]\\|\\(\\)\\\\].*\"$")
  (#set! injection.language "regex")
  (#offset! @injection.content 0 1 0 -1)
)