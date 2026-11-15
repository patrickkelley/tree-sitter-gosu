/**
 * @file Gosu template (.gst) grammar for tree-sitter.
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

module.exports = grammar({
  name: "gosu_templates",

  extras: _ => [
    /\s/,
  ],

  rules: {
    template: $ => repeat(choice(
      $.template_comment,
      $.template_directive,
      $.template_expression,
      $.template_scriptlet,
      $.template_interpolation,
      $.template_text,
    )),

    // NOTE: Comment node kinds must contain the lowercase substring "comment"
    // (docs/PRD.md R3/R4) so loc's counter excludes them.
    template_comment: _ => token(prec(3, seq(
      "<%--",
      repeat(choice(
        /[^-]+/,
        /-[^-]/,
        /--[^%]/,
        /--%[^>]/,
      )),
      "--%>",
    ))),

    template_directive: $ => seq(
      "<%@",
      repeat($._scriptlet_item),
      "%>",
    ),

    template_expression: $ => seq(
      "<%=",
      repeat($._scriptlet_item),
      "%>",
    ),

    template_scriptlet: $ => seq(
      prec(1, "<%"),
      repeat($._scriptlet_item),
      "%>",
    ),

    _scriptlet_item: $ => choice(
      $.block_comment,
      $.line_comment,
      $.StringLiteral,
      $.code_fragment,
    ),

    template_interpolation: $ => seq(
      "${",
      repeat(choice(
        $.block_comment,
        $.StringLiteral,
        $.interpolation_code,
      )),
      "}",
    ),

    block_comment: _ => token(/\/\*([^*]|\*+[^*/])*\*+\//),
    line_comment: _ => token(/\/\/([^\n\r%]|%[^>])*/),

    StringLiteral: _ => token(choice(
      seq('"', repeat(choice(/[^"\\]+/, /\\./)), '"'),
      seq("'", repeat(choice(/[^'\\]+/, /\\./)), "'"),
    )),

    code_fragment: _ => token(prec(-1, seq(
      choice(/[^%/"'\s]/, /%[^>]/, /\/[^*/]/),
      repeat(choice(/[^%/"']+/, /%[^>]/, /\/[^*/]/)),
    ))),

    interpolation_code: _ => token(prec(-1, repeat1(choice(
      /[^}/"'\s]+/,
      /\/[^*/]/,
    )))),

    template_text: _ => token(prec(-1, seq(
      choice(/[^<$\s]/, /<[^%]/, /\$[^{]/),
      repeat(choice(/[^<$]+/, /<[^%]/, /\$[^{]/)),
    ))),
  },
});
