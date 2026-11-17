module.exports = grammar({
  name: 'alloy',

  rules: {
    source_file: $ => repeat(
      choice(
        $.component,
        $.declaration,
        $.comment,
        $.assignment
      )
    ),

    component: $ => seq(
      $.component_name,
      optional($.component_label),
      $.block
    ),

    component_name: $ => token(seq(
      /[a-zA-Z_][a-zA-Z0-9_]*/,
      repeat(seq('.', /[a-zA-Z_][a-zA-Z0-9_]*/))
    )),

    component_label: $ => $.string_literal,

    declaration: $ => seq(
      'declare',
      $.identifier,
      $.block
    ),

    block: $ => seq(
      '{',
      repeat(choice(
        $.assignment,
        $.rule,
        $.component,
        $.comment
      )),
      '}'
    ),

    rule: $ => seq(
      'rule',
      $.block
    ),

    assignment: $ => seq(
      $.identifier,
      '=',
      choice(
        $.string_literal,
        $.number,
        $.array,
        $.argument_reference,
        $.boolean
      )
    ),

    argument_reference: $ => token(seq(
      'argument',
      '.',
      /[a-zA-Z_][a-zA-Z0-9_]*/,
      '.',
      'value'
    )),

    identifier: $ => /[a-zA-Z_][a-zA-Z0-9_]*/,

    string_literal: $ => token(seq(
      '"',
      repeat(choice(
        /[^"\\]/,
        seq('\\', /./)
      )),
      '"'
    )),

    number: $ => token(choice(
      /\d+/,
      /\d+\.\d+/
    )),

    boolean: $ => choice('true', 'false'),

    array: $ => seq(
      '[',
      optional(seq(
        choice($.string_literal, $.identifier, $.argument_reference),
        repeat(seq(',', choice($.string_literal, $.identifier, $.argument_reference)))
      )),
      ']'
    ),

    comment: $ => token(choice(
      seq('//', /.*/),
      seq('/*', repeat(choice(/[^*]/, seq('*', /[^/]/))), '*/')
    ))
  }
});