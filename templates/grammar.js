/**
 * @file Gosu template (.gst) sub-grammar: markup text with embedded Gosu scriptlets.
 * @author Patrick Kelley
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

// A .gst template is markup text interleaved with `<% ... %>` scriptlets.
// This grammar is self-contained (no shared modules with the root `gosu`
// grammar) and only supports a simplified subset of Gosu statements and
// expressions inside scriptlets:
//   - var declarations, assignment / method call statements
//   - if / else, foreach (x in ...), while, return, break, continue
//   - expressions: literals, identifiers, member access, calls, new,
//     additive (+ -) and comparison ops, multiplicative (* /)
// Unsupported on purpose (see docs/PRD.md R4): unary minus, the `%` modulo
// operator (it would be ambiguous with the `%>` scriptlet terminator),
// parenthesized expressions, classic C-style `for` loops, blocks spanning
// scriptlets without the `<% ... %>` escape form.
//
// NOTE: like the root grammar, comment node kinds must contain the lowercase
// substring "comment" (docs/PRD.md R3): loc's counter matches node kinds with
// a case-sensitive contains("comment").
//
// Markup/scriptlet interleaving: a `{` block inside a scriptlet may "escape"
// to markup. A `%>` inside an open block is consumed by an escape
// (`%>` markup `<%`), and the matching `}` may appear in any later `<%`
// scriptlet, which lets the canonical pattern
//     <% foreach (x in list) { %> ... <% } %>
// parse with the markup nested inside the statementBlock.

// Character classes that return from a "pending dash run" state to the
// baseline inside a template comment; `>` is excluded after `%` so that the
// first `--%>` always terminates the comment. See the discussion in AGENTS.md
// / docs/PRD.md R4 for the derivation of this regex.
const exitDashRun = "(?:[^%-]|%[^%->]|%%)";
const dashRunContent = `(?:[^-]|-[-]*${exitDashRun}|(?:-|-[-]*%-)(?:-[-]*%-)*(?:[^%-]|%|-[-]*${exitDashRun}))`;
const dashRunTail = "(?:-|-[-]*%-)?";

module.exports = grammar({
  name: "gosu_templates",

  extras: $ => [/\s/],

  rules: {
    document: $ => repeat(choice(
      $.template_text,
      $.template_scriptlet,
      $.template_expression,
      $.template_directive,
      $.template_comment,
    )),

    // Any markup that does not contain the two-character sequence `<%`.
    // `[^<]+` runs and `<+[^%<]` runs of `<` followed by a non-`%` char.
    // A `<` at the very end of input produces a MISSING token, which is
    // acceptable for incomplete files.
    template_text: _ => /([^<]+|<+[^%<])+/,

    template_scriptlet: $ => seq("<%", repeat($.statement), "%>"),

    template_expression: $ => seq("<%=", $._expression, "%>"),

    template_directive: $ => seq("<%@",
      repeat(choice($.id, $.number, $.StringLiteral, $.arguments, ".", ",")),
      "%>"),

    // `<%-- comment --%>`, multi-line capable; terminated by the first
    // `--%>` occurrence.
    template_comment: _ => new RegExp(
      `<%--${dashRunContent}${dashRunTail}--%>`),

    statement: $ => prec.right(seq($._statement, optional(";"))),

    _statement: $ => choice(
      $.localVarStatement,
      $.assignmentOrMethodCall,
      $.ifStatement,
      $.foreachStatement,
      $.whileStatement,
      $.returnStatement,
      $.breakStatement,
      $.continueStatement,
    ),

    localVarStatement: $ => seq(
      "var",
      $.id,
      optional(seq(":", field("type", $.type_identifier))),
      optional(seq("=", field("value", $._expression))),
    ),

    assignmentOrMethodCall: $ => prec.right(seq(
      choice($.id, $.newExpr),
      repeat($.indirectMemberAccess1),
      optional(seq("=", field("value", $._expression))),
    )),

    ifStatement: $ => prec.right(seq(
      "if",
      "(",
      field("condition", $._expression),
      ")",
      $._blockOrStatement,
      optional(seq("else", $._blockOrStatement)),
    )),

    foreachStatement: $ => prec.right(seq(
      choice("foreach", "for"),
      "(",
      optional("var"),
      field("name", $.id),
      "in",
      field("iterable", $._expression),
      ")",
      $._blockOrStatement,
    )),

    whileStatement: $ => prec.right(seq(
      "while",
      "(",
      field("condition", $._expression),
      ")",
      $._blockOrStatement,
    )),

    returnStatement: $ => prec.right(seq("return", optional($._expression))),

    breakStatement: _ => "break",
    continueStatement: _ => "continue",

    _blockOrStatement: $ => choice($.statementBlock, $.statement),

    statementBlock: $ => seq(
      "{",
      repeat(choice($.statement, seq(
        "%>",
        // Markup between the scriptlet boundaries of an open block. Nested
        // `<%` scriptlets are NOT part of this: their `<%` closes the escape,
        // and their contents are parsed as statements of the open block.
        repeat(choice(
          $.template_text,
          $.template_expression,
          $.template_directive,
          $.template_comment,
        )),
        "<%"))),
      "}"),

    arguments: $ => seq(
      "(",
      optional(seq($._expression, repeat(seq(",", $._expression)))),
      ")"),

    indirectMemberAccess1: $ => choice(
      seq(".", $.id),
      $.arguments,
    ),

    _expression: $ => $._additiveExpr,

    _additiveExpr: $ => prec.left(seq(
      $._multiplicativeExpr,
      repeat(seq($.additiveOp, $._multiplicativeExpr)))),

    // Comparisons are folded into the additive level: enough for template
    // control flow, keeps the grammar conflict-free.
    additiveOp: _ => choice("+", "-", "==", "!=", "<=", ">=", "<", ">"),

    _multiplicativeExpr: $ => prec.left(seq(
      $._primaryExpr,
      repeat(seq($.multiplicativeOp, $._primaryExpr)))),

    multiplicativeOp: _ => choice("*", "/"),

    _primaryExpr: $ => seq(
      choice($.StringLiteral, $.number, $.id, $.newExpr, "true", "false", "null"),
      repeat($.indirectMemberAccess1),
    ),

    newExpr: $ => seq(
      "new",
      $.id,
      repeat(seq(".", $.id)),
      $.arguments,
    ),

    id: _ => /[A-Za-z_$][A-Za-z0-9_$]*/,

    // Single-token type names only (`var x : String`), no dotted/generic types.
    type_identifier: _ => /[A-Za-z_$][A-Za-z0-9_$]*/,

    StringLiteral: _ => choice(
      seq("'", /[^'\\]*/, "'"),
      seq('"', /[^"\\]*/, '"'),
    ),

    number: _ => /[0-9]+(\.[0-9]+)?/,
  }
});
