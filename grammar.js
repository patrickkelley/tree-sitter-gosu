/**
 * @file Gosu is a statically typed general-purpose programming language that runs on the Java Virtual Machine.
 * @author Marek Kubica <marek@tarides.com>
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check


// Based on the grammer at: https://github.com/gosu-lang/gosu-lang/blob/78c5f6c839597a81ac5ec75a46259cbb6ad40545/gosu-core/src/main/java/gw/internal/gosu/parser/ebnf/Gosu.ebnf
//
// Divergences from that EBNF (docs/PRD.md):
// - The start rule is error-tolerant: an optional shebang, a classpath
//   statement, package, uses, and a sequence of type declarations, functions,
//   properties, and statements. Function and property bodies are optional so
//   incomplete files still parse. The EBNF start rule is a single type
//   declaration.
// - StringLiteral accepts "${expr}" interpolation as a child node. The EBNF
//   string is only EscapeSequence | any_character. A "$" that does not begin
//   "${", including a "$" immediately before the closing quote, is ordinary
//   string content and must not be an ERROR or an identifier.
// - A fractional numeric literal may end with the dot (`100000.` is a float),
//   lexed via a 1-char-lookahead external scanner (`src/scanner.c`) that
//   rejects a following `.`, digit, or identifier-start character, keeping
//   `0..5` intervals and `1.toString()` member calls unambiguous without GLR.
// - `reified` is accepted as a modifier. It is used by Gosu and is absent from
//   that EBNF's modifier list.
// - `{ expr -> expr }` is only a map initializer. Blocks are the backslash
//   form `\ args -> expr` and `\ args -> { statements }`, matching the EBNF.
// - Comment node kinds are lowercase and contain "comment"
//   (`line_comment`, `block_comment`, `shebang_comment`), not COMMENT /
//   LINE_COMMENT.
// - `uses` accepts a static-import tail (`#method`, `#method(Type, ...)`,
//   `#*`, `#construct`, `#construct(Type, ...)`) with `member` and
//   `parameterTypes` fields after the dotted path, in addition to the EBNF's
//   dotted path with an optional `.*` `wildcard`. The `featureLiteral` rule is
//   deliberately NOT reused here so `#*` stays out of the expression grammar.
// - Generic and array type literals (`Map<String, Integer>`,
//   `Outer.Inner<K, V>`, `java.util.Map<K, V>`, `Vehicle[]`, `int[][]`,
//   `Outer.Inner[]`, `java.util.Date[]`) are accepted as primary expressions
//   (e.g. call arguments) and statement-level member receivers (`Vehicle[].Type`).
//   The EBNF has no standalone generic/array type-literal expression rule here.
// - Identifiers accept JVM/Unicode identifier characters (`\p{L}`, `\p{Nl}`,
//   combining marks, connector punctuation, Unicode digits); the EBNF `Letter`
//   is ASCII `[A-Za-z_$]`.
// - Block types allow omitting the `block` keyword (`(x: T): R`, `()`), and
//   annotations accept `typeArguments` (`@Argument<Date>(...)`).
// - `propertyDefn` accepts Gosu's shorthand/field-style property declarations
//   (`property Name : T`, `property Name : T = expr`, `property get Name : T = expr`)
//   in addition to the EBNF's `property (get | set) id (...) [: T]` form.

// These patterns are used in the "Ident" rule. In order to make that rule
// produce a token these can't be rules themselves as tokens must composed of
// only terminal rules.
const Digit = /[0-9]/;
const Letter = /[\p{L}\p{Nl}_$]/;
const IdContinue = /[\p{L}\p{Nl}\p{Nd}\p{Mn}\p{Mc}\p{Pc}_$]/;

// The rules, presented in the same order as the grammar definition in Gosu's source code.
module.exports = grammar({
  name: "gosu",

  // The word token enables tree-sitter's keyword extraction: literals like
  // `true`, `null` or `NaN` win over identifiers when valid, and are lexed as
  // identifiers (Gosu allows them as names) in states where the keyword form
  // is not applicable.
  word: $ => $.id,

  externals: $ => [
    $._trailing_dot_float,
  ],

  extras: $ => [
    /\s/,
    $.block_comment,
    $.line_comment,
  ],

  conflicts: $ => [
    [$._primaryExpr],
    [$._primaryExpr, $._memberChain],
    [$._statement, $._expression],
    // Type literals (`g(Map<String, Integer>)`, `g(Outer.Inner<K, V>)`,
    // `f(Vehicle[])`, `f(Outer.Inner[])`) vs comparison / indexing / member
    // chain / generic call (`g<String>(x)`, `Arrays.asList<T>(x)`, `arr[i]`):
    // GLR keeps the candidates alive until invalid continuations die;
    // `_callTypeArguments` carries higher dynamic precedence so `g<String>(x)`
    // and `Arrays.asList<T>(x)` resolve as generic calls.
    [$.typeLiteral, $._primaryExpr],
    [$.indirectMemberAccess1, $._postDotTypeLiteral],
    [$._callTypeArguments, $._typeLiteralTypeArguments],
  ],

  rules: {
    start: $ => seq(
      optional($.shebang_comment),
      optional($.classpathStatement),
      optional(seq("package", $.namespaceStatement)),
      repeat($.usesStatement),
      repeat(choice(
        seq(
          optional($.modifiers),
          choice(
            $.gClass,
            $.gInterfaceOrStructure,
            $.gEnum,
            $.gEnhancement,
            $.functionDefn,
            $.propertyDefn,
          ),
        ),
        $.statement,
      )),
    ),
    shebang_comment: _ => token(seq("#!", /[^\n\r]*/)),
    classpathStatement: $ => prec.right(seq("classpath", $.StringLiteral, repeat(";"))),
    namespaceStatement: $ => prec.right(seq($.id, repeat(seq(".", $.id)), repeat(";"))),
    usesStatement: $ => prec.right(seq(
      "uses",
      $.id,
      repeat(seq(".", $.id)),
      optional(choice(
        seq(".", field("wildcard", alias("*", $.wildcard))),
        seq(
          "#",
          field("member", choice($.id, alias("construct", $.construct), alias("*", $.wildcard))),
          optional(field("parameters", $.parameterTypes)),
        ),
      )),
      repeat(";"),
    )),
    parameterTypes: $ => seq("(", optional(seq($.type, repeat(seq(",", $.type)))), ")"),
    annotation: $ => seq("@", $.id, repeat(seq(".", $.id)), optional($.typeArguments), optional($.arguments)),
    modifiers: $ =>
      repeat1(choice(
        $.annotation,
        "private", "internal", "protected", "public",
        "static", "abstract", "override", "final", "transient", "reified")),

    typeVariableDefs: $ => seq("<", $.typeVariableDefinition, repeat(seq(",", $.typeVariableDefinition)), ">"),
    typeVariableDefinition: $ => seq($.id, optional(seq("extends", $.type))),

    gClass: $ => seq(
      "class",
      field("name", $.id),
      optional($.typeVariableDefs),
      optional(seq("extends", $.type)),
      optional(seq("implements", $.type, repeat(seq(",", $.type)))),
      field("body", $.classBody),
    ),
    gInterfaceOrStructure: $ => seq(
      choice("interface", "structure"),
      field("name", $.id),
      optional($.typeVariableDefs),
      optional(seq("extends", $.type, repeat(seq(",", $.type)))),
      field("body", $.interfaceBody),
    ),
    gEnum: $ => seq(
      "enum",
      field("name", $.id),
      optional($.typeVariableDefs),
      optional(seq("implements", $.type, repeat(seq(",", $.type)))),
      field("body", $.enumBody),
    ),
    gEnhancement: $ => seq(
      "enhancement",
      field("name", $.id),
      optional($.typeVariableDefs),
      ":",
      $.type,
      field("body", $.enhancementBody),
    ),
    classBody: $ => seq("{", optional($.classMembers), "}"),
    interfaceBody: $ => seq("{", repeat($.declaration), "}"),
    enhancementBody: $ => seq("{", repeat($.declaration), "}"),
    enumBody: $ => seq("{", optional($.enumConstants), optional($.classMembers), "}"),
    enumConstants: $ => seq($.enumConstant, repeat(seq(",", $.enumConstant)), optional(","), optional(";")),
    enumConstant: $ => seq($.id, optional($.arguments)),
    classMembers: $ => repeat1($.declaration),
    declaration: $ => seq(
      choice(
        $.fieldDefn,
        $.staticInitializer,
        seq(
          optional($.modifiers),
          choice(
            $.functionDefn,
            $.constructorDefn,
            $.propertyDefn,
            $.delegateDefn,
            $.gClass,
            $.gInterfaceOrStructure,
            $.gEnum,
          ),
        ),
      ),
      optional(";"),
    ),
    staticInitializer: $ => prec(1, seq("static", "{", repeat($.statement), "}")),
    delegateDefn: $ => prec.right(seq(
      "delegate",
      $.id,
      optional(seq(":", $.type)),
      "represents",
      $.type,
      repeat(seq(",", $.type)),
      optional(seq("=", $._expression)),
    )),
    constructorDefn: $ => seq(
      "construct",
      "(",
      optional($.parameterDeclarationList),
      ")",
      optional(seq(":", field("type", $.type))),
      "{",
      repeat($.statement),
      "}",
    ),
    propertyDefn: $ => prec.right(seq(
      "property",
      choice(
        seq(
          choice("get", "set"),
          $.id,
          choice(
            seq(
              optional(seq("(", optional($.parameterDeclarationList), ")")),
              optional(seq(":", field("type", $.type))),
              optional(seq("{", repeat($.statement), "}")),
            ),
            seq(
              optional(seq(":", field("type", $.type))),
              seq("=", field("value", $._expression)),
            ),
          ),
        ),
        seq(
          choice(alias("get", $.id), alias("set", $.id)),
          choice(
            seq(":", field("type", $.type), optional(seq("=", field("value", $._expression)))),
            seq("=", field("value", $._expression)),
          ),
        ),
        seq(
          $.id,
          optional(seq(":", field("type", $.type))),
          optional(seq("=", field("value", $._expression))),
        ),
      ),
    )),
    fieldDefn: $ => prec.right(seq(
      optional($.modifiers),
      "var",
      $.id,
      optional(choice(
        seq(":", field("type", $.type)),
        $.blockLiteral,
      )),
      optional(seq("as",
        optional("readonly"), field("as", $.id))),
      optional(seq("=",
        field("value", $._expression))),
      optional(";")
    )),
    functionDefn: $ => prec.right(seq(
      "function",
      $.id,
      optional($.typeVariableDefs),
      "(",
      optional($.parameterDeclarationList),
      ")",
      optional(seq(":", field("type", $.type))),
      optional(seq("{", repeat($.statement), "}"))
    )),
    parameterDeclarationList: $ => seq($.parameterDeclaration, repeat(seq(",", $.parameterDeclaration))),
    parameterDeclaration: $ => seq(
      repeat($.annotation),
      optional("final"),
      $.id,
      optional(choice(
        seq(":", field("type", $.type), optional(seq("=", field("value", $._expression)))),
        $.blockLiteral,
        seq("=", field("value", $._expression)),
      )),
    ),
    _statement: $ => choice(
      $.ifStatement,
      $.tryCatchFinallyStatement,
      $.throwStatement,
      $.continueStatement,
      $.breakStatement,
      $.returnStatement,
      $.forEachStatement,
      $.whileStatement,
      $.doWhileStatement,
      $.switchStatement,
      $.usingStatement,
      $.assertStatement,
      seq("final", $.localVarStatement),
      $.localVarStatement,
      $.evalExpr,
      $.assignmentOrMethodCall,
      $.statementBlock,
    ),
    statement: $ => choice(prec.right(seq($._statement, optional(";"))), ";"),
    statementBlock: $ => seq("{", repeat($.statement), "}"),
    ifStatement: $ => prec.right(seq("if", "(", $._expression, ")", $.statement, optional(";"), optional(seq("else", $.statement)))),
    whileStatement: $ => seq("while", "(", $._expression, ")", $.statement),
    doWhileStatement: $ => seq("do", $.statement, "while", "(", $._expression, ")"),
    forEachStatement: $ => seq(
      choice("foreach", "for"),
      "(",
      choice(
        seq(optional("var"), $.id, "in", $._expression, optional($.indexRest)),
        seq($._expression, optional($.indexVar)),
      ),
      ")",
      $.statement,
    ),
    indexRest: $ => choice(
      seq($.indexVar, $.iteratorVar),
      seq($.iteratorVar, $.indexVar),
      $.indexVar,
      $.iteratorVar,
    ),
    indexVar: $ => seq("index", $.id),
    iteratorVar: $ => seq("iterator", $.id),
    switchStatement: $ => seq("switch", "(", $._expression, ")", "{", repeat($.switchBlockStatementGroup), "}"),
    switchBlockStatementGroup: $ => seq(choice(seq("case", $._expression, ":"), seq("default", ":")), repeat($.statement)),
    tryCatchFinallyStatement: $ => seq(
      "try",
      $.statementBlock,
      choice(
        seq($.catchClause, repeat($.catchClause), optional(seq("finally", $.statementBlock))),
        seq("finally", $.statementBlock),
      ),
    ),
    catchClause: $ => seq("catch", "(", optional("var"), $.id, optional(seq(":", $.type)), ")", $.statementBlock),
    returnStatement: $ => prec.right(seq("return", optional($._expression))),
    throwStatement: $ => seq("throw", $._expression),
    breakStatement: _ => "break",
    continueStatement: _ => "continue",
    usingStatement: $ => seq(
      "using",
      "(",
      choice(seq($.localVarStatement, repeat(seq(",", $.localVarStatement))), $._expression),
      ")",
      $.statementBlock,
      optional(seq("finally", $.statementBlock)),
    ),
    assertStatement: $ => seq("assert", $._expression, optional(seq(":", $._expression))),
    evalExpr: $ => seq("eval", "(", $._expression, ")"),
    localVarStatement: $ => prec.right(seq(
      "var",
      $.id,
      optional(choice(
        seq(":", field("type", $.type)),
        $.blockLiteral,
      )),
      optional(seq("=",
        field("value", $._expression))),
    )),
    arguments: $ => seq("(", optional(seq($._argExpression, repeat(seq(",", $._argExpression)))), ")"),
    _argExpression: $ => choice($.namedArgExpression, $._expression),
    namedArgExpression: $ => seq(":", $.id, "=", $._expression),
    indirectMemberAccess1: $ => prec.dynamic(1, choice(
      prec(15, seq(choice(".", "?.", "*."), $.id)),
      prec(15, $.featureLiteral),
      prec(15, seq(choice("[", "?["), $._expression, "]")),
      prec(15, $.arguments),
      prec(8, seq(alias($._callTypeArguments, $.typeArguments), $.arguments)),
    )),
    _callTypeArguments: $ => prec.dynamic(1, prec(8, seq("<", $.typeArgument, repeat(seq(",", $.typeArgument)), ">"))),
    thisSuperExpr: _ => choice("this", "super"),
    assignmentOrMethodCall: $ => prec.right(-1, seq(
      choice(
        seq(
          choice(
            $.id,
            $.thisSuperExpr,
            $.newExpr,
            $.parenthExpr,
            $.StringLiteral,
          ),
          optional($._memberChain),
        ),
        seq(
          $.typeLiteral,
          $._memberChain,
        ),
      ),
      optional(choice(
        $.incrementOp,
        seq($.assignmentOp, $._expression),
      )),
    )),
    type: $ => prec.left(seq(
      choice(
        prec.right(seq(
          $._qualifiedType,
          repeat(seq("[", "]")),
        )),
        seq(optional("block"), $.blockLiteral),
      ),
      repeat(seq("&", $.type)),
    )),
    // Hidden right-recursive dotted chain: isolated from `type`'s outer
    // `prec.left` (which only disambiguates `&` intersections) and free of a
    // `repeat(...)` auxiliary rule, so every segment shifts `<` into
    // `typeArguments` instead of reducing `type` early after `as` / `typeis`.
    _qualifiedType: $ => prec.right(seq(
      $._type_identifier,
      optional($.typeArguments),
      optional(seq(".", $._qualifiedType)),
    )),
    // Divergence from the EBNF (which has no type-literal expression): a
    // generic or array type may appear as a primary expression, e.g. as a call
    // argument `g(Map<String, Integer>)`, `g(Outer.Inner<K, V>)`,
    // `h(java.util.Map<String, Integer>)`, `addSymbol(P, Vehicle[], ...)`, or
    // `f(Outer.Inner[])`. Either at least one segment must carry
    // `typeArguments` or the type must end with one or more `[]` dimensions so
    // bare `(id)` and plain dotted expressions stay unambiguous. Post-dot
    // segments (`_postDotTypeLiteral`) and array `[]` (`_arrayTypeBrackets`)
    // shift `.`, `<`, and `[` at prec 15 to tie `indirectMemberAccess1` and
    // split via GLR; declared GLR conflicts keep both the type-literal and
    // comparison/indexing/member-chain readings alive until one dies
    // (`g(a < b, c > d)` and `g(a.x < b.y, c > d)` stay comparisons; `arr[i]`
    // stays indexing; `Arrays.asList<T>(x)` resolves as a generic call via
    // `_callTypeArguments` dynamic precedence).
    typeLiteral: $ => prec.right(8, choice(
      seq(
        alias($.id, $.type_identifier),
        alias($._typeLiteralTypeArguments, $.typeArguments),
        optional(seq(".", $._qualifiedType)),
        repeat(seq("[", "]")),
      ),
      seq(
        alias($.id, $.type_identifier),
        $._arrayTypeBrackets,
      ),
      prec(15, seq(
        alias($.id, $.type_identifier),
        ".",
        $._postDotTypeLiteral,
      )),
    )),
    _postDotTypeLiteral: $ => prec.right(15, choice(
      seq(
        alias($.id, $.type_identifier),
        alias($._postDotTypeArguments, $.typeArguments),
        optional(seq(".", $._qualifiedType)),
        repeat(seq("[", "]")),
      ),
      seq(
        alias($.id, $.type_identifier),
        $._arrayTypeBrackets,
      ),
      seq(
        alias($.id, $.type_identifier),
        ".",
        $._postDotTypeLiteral,
      ),
    )),
    _arrayTypeBrackets: _ => prec.right(15, seq("[", "]", repeat(seq("[", "]")))),
    _typeLiteralTypeArguments: $ => prec(8, seq("<", $.typeArgument, repeat(seq(",", $.typeArgument)), ">")),
    _postDotTypeArguments: $ => prec(15, seq("<", $.typeArgument, repeat(seq(",", $.typeArgument)), ">")),
    typeArguments: $ => seq("<", $.typeArgument, repeat(seq(",", $.typeArgument)), ">"),
    typeArgument: $ => choice(
      $.type,
      seq("?", optional(seq(choice("extends", "super"), $.type))),
    ),
    blockLiteral: $ => prec.right(seq(
      "(",
      optional(seq($.blockLiteralArg, repeat(seq(",", $.blockLiteralArg)))),
      ")",
      optional(seq(":", $.type)),
    )),
    blockLiteralArg: $ => choice(
      prec(1, seq($.id, choice(seq("=", $._expression), $.blockLiteral))),
      seq(optional(seq($.id, ":")), $.type, optional(seq("=", $._expression))),
    ),
    _type_identifier: $ => alias($.id, $.type_identifier),
    _expression: $ => choice(
      $.conditionalExpr,
      $.conditionalOrExpr,
      $.conditionalAndExpr,
      $.bitwiseOrExpr,
      $.bitwiseXorExpr,
      $.bitwiseAndExpr,
      $.equalityExpr,
      $.relationalExpr,
      $.intervalExpr,
      $.bitshiftExpr,
      $.additiveExpr,
      $.multiplicativeExpr,
      $.typeAsExpr,
      $.unaryExpr,
      $.blockExpr,
      $.evalExpr,
      $._primaryExpr,
    ),
    _primaryExpr: $ => prec(8, seq(
      choice(
        $.literal,
        $.thisSuperExpr,
        $.id,
        $.typeLiteral,
        $.newExpr,
        $.parenthExpr,
        $.standAloneDataStructureInitialization,
      ),
      optional($._memberChain),
    )),
    _memberChain: $ => prec(8, choice(
      $.indirectMemberAccess1,
      seq($._memberChain, $.indirectMemberAccess1),
    )),
    parenthExpr: $ => seq("(", $._expression, ")"),
    blockExpr: $ => prec.right(0, seq("\\", optional($.parameterDeclarationList), "->", choice($._expression, $.statementBlock))),
    featureLiteral: $ => prec.right(seq("#", choice($.id, "construct"), optional($.typeArguments), optional($.arguments))),
    standAloneDataStructureInitialization: $ => prec(1, seq("{", optional($.initializerExpression), "}")),
    initializerExpression: $ => choice($.mapInitializerList, $.arrayValueList),
    arrayValueList: $ => seq($._expression, repeat(seq(",", $._expression))),
    mapInitializerList: $ => seq($._expression, "->", $._expression, repeat(seq(",", $._expression, "->", $._expression))),
    objectInitializer: $ => seq($.initializerAssignment, repeat(seq(",", $.initializerAssignment))),
    initializerAssignment: $ => seq(":", $.id, "=", $._expression),
    arrayInitializer: $ => seq("{", optional(seq($._expression, repeat(seq(",", $._expression)))), "}"),
    conditionalExpr: $ => prec.right(1, choice(
      seq($._expression, "?", $._expression, ":", $._expression),
      seq($._expression, "?:", $._expression),
    )),
    conditionalOrExpr: $ => prec.left(2, seq($._expression, $.orOp, $._expression)),
    conditionalAndExpr: $ => prec.left(3, seq($._expression, $.andOp, $._expression)),
    bitwiseOrExpr: $ => prec.left(4, seq($._expression, "|", $._expression)),
    bitwiseXorExpr: $ => prec.left(5, seq($._expression, "^", $._expression)),
    bitwiseAndExpr: $ => prec.left(6, seq($._expression, "&", $._expression)),
    equalityExpr: $ => prec.left(7, seq($._expression, $.equalityOp, $._expression)),
    relationalExpr: $ => prec.left(8, choice(
      seq($._expression, $.relOp, $._expression),
      seq($._expression, "typeis", $.type),
    )),
    intervalExpr: $ => prec.left(9, seq($._expression, $.intervalOp, $._expression)),
    bitshiftExpr: $ => prec.left(10, seq($._expression, $.bitshiftOp, $._expression)),
    // In Gosu's EBNF: literal = NumberLiteral | featureLiteral | StringLiteral
    // | CharLiteral | "true" | "false" | "null".
    literal: $ => prec(1, choice(
      $.NumberLiteral,
      $.featureLiteral,
      $.StringLiteral,
      $.CharLiteral,
      "true",
      "false",
      "null",
    )),
    // NaN/Infinity are bare keywords inside NumberLiteral (per the EBNF), so
    // the tree shows a bare `(NumberLiteral)` for them while the digit-based
    // forms are visible sub-tokens.
    NumberLiteral: $ => choice(
      "NaN",
      "Infinity",
      $.HexLiteral,
      $.BinLiteral,
      $.IntOrFloatLiteral,
      alias($._trailing_dot_float, $.IntOrFloatLiteral),
    ),
    HexLiteral: _ => token(seq(choice("0x", "0X"), repeat1(/[0-9a-fA-F]/), optional(choice("s", "S", "l", "L")))),
    BinLiteral: _ => token(seq(choice("0b", "0B"), repeat1(/[01]/), optional(choice("bi", "BI", /[lLsSbB]/)))),
    // Divergence from the EBNF: a fractional part may also end with the dot
    // (`100000.` is a float), so audit files with trailing-dot literals parse.
    // Trailing-dot floats are lexed via a 1-char-lookahead external scanner
    // (`src/scanner.c`) that rejects a following `.`, digit, or
    // identifier-start character, keeping `0..5` intervals and `1.toString()`
    // member calls unambiguous without GLR.
    IntOrFloatLiteral: _ => token(choice(
      seq(/\.\d+/, optional(/(bd|BD|[fFdD])/)),
      seq(/\d+/, optional(choice(
        seq(/\.\d+/, optional(/([eE][+-]?\d+)/), optional(/(bd|BD|[fFdD])/)),
        seq(/([eE][+-]?\d+)/, optional(/(bd|BD|[fFdD])/)),
        /(bd|BD|[fFdD])/,
        /(bi|BI|[lLsSbB])/,
      ))),
    )),
    additiveExpr: $ => prec.left(11, seq($._expression, $.additiveOp, $._expression)),
    multiplicativeExpr: $ => prec.left(12, seq($._expression, $.multiplicativeOp, $._expression)),
    typeAsExpr: $ => prec.left(13, seq($._expression, $.typeAsOp, $.type)),
    unaryExpr: $ => prec.right(14, seq(choice("+", "-", "!-", $.unaryOp), $._expression)),
    newExpr: $ => prec.right(seq(
      "new",
      optional(seq(
        $.id,
        optional($.typeArguments),
        repeat(seq(".", $.id, optional($.typeArguments))),
      )),
      choice(
        seq($.arguments, optional(seq("{", optional(choice($.initializerExpression, $.objectInitializer, $.classMembers)), "}"))),
        seq("[", choice(
          seq("]", repeat(seq("[", "]")), $.arrayInitializer),
          seq($._expression, "]", repeat(seq("[", $._expression, "]")), repeat(seq("[", "]"))),
        )),
      ),
    )),
    id: _ => token(seq(Letter, repeat(IdContinue))),
    // Strings own their content: the fragments are immediate tokens so that
    // comments (`//`, `/*`) never leak inside a string literal (docs/PRD.md R3).
    // Interpolated expressions are CHILD nodes of the string via
    // template_substitution. `${expr}` is the only interpolation; `$ident` is
    // literal text. A `$` immediately before the closing quote is content, not
    // an identifier (Letter includes `$`, so a dropped `$` would otherwise be
    // recovered as an id).
    StringLiteral: $ => choice(
      seq('"', repeat(choice($._double_string_fragment, $._trailing_dollar, $.escape_sequence, $.template_substitution)), '"'),
      seq("'", repeat(choice($._sq_char, $.escape_sequence, $.template_substitution)), "'"),
    ),
    // Hidden token rules: matched without skipping extras, and never shown as
    // named nodes in the tree.
    // `$` plus a following content character. Does not match a `$` whose next
    // character is `"` or `{`.
    _double_string_fragment: _ => token.immediate(prec(1, /([^"\\$]|\$[^{"])+/)),
    // A `$` immediately before the closing quote. Lower precedence and shorter
    // than `${`, so it cannot swallow an interpolation. Hidden, so the tree
    // still shows a StringLiteral with no identifier child.
    _trailing_dollar: _ => token.immediate(prec(0, "$")),
    // Single-quoted content is lexed one character at a time (shared by
    // StringLiteral and CharLiteral) so that `'ab'` can only close as a string
    // while `'a'` stays ambiguous until the reduce, where CharLiteral's higher
    // precedence wins.
    _sq_char: _ => token.immediate(choice(/[^'\\$]/, /\$/)),
    escape_sequence: _ => token.immediate(choice(
      /\\[vabtnfr"'\\$<]/,
      /\\u[0-9a-fA-F]{4}/,
      /\\([0-3][0-7][0-7]|[0-7][0-7]|[0-7])/,
    )),
    template_substitution: $ => seq(prec(2, '${'), $._expression, '}'),
    Digit: _ => Digit,
    orOp: _ => choice("||", "or"),
    andOp: _ => choice("&&", "and"),
    assignmentOp: _ => choice("=", "+=", "-=", "*=", "/=", "&=", "&&=", "|=", "||=", "^=", "%=", "<<=", ">>>=", ">>="),
    incrementOp: _ => choice("++", "--"),
    equalityOp: _ => choice("===", "!==", "==", "!="),
    intervalOp: _ => choice("..", "|..", "..|", "|..|"),
    relOp: _ => choice("<=", ">=", "<", ">"),
    bitshiftOp: _ => choice("<<", ">>>", ">>"),
    additiveOp: _ => choice("+", "-", "?+", "?-", "!+", "!-"),
    multiplicativeOp: _ => choice("*", "/", "%", "?*", "!*", "?/", "?%"),
    typeAsOp: _ => choice("typeas", "as"),
    unaryOp: _ => choice("~", "!", "not", "typeof", "statictypeof"),
    // HexDigit: $ => choice($.Digit, /[A-F]/, /[a-f]/),
    // ZeroToSeven: _ => /[0-7]/,
    // EscapeSequence: $ => choice(seq("\\", choice("v", "a", "b", "t", "n", "f", "r", '"', "'", "\\", "$", "<")), $.UnicodeEscape, $.OctalEscape),
    // OctalEscape: $ => choice(seq("\\", /0-3/, $.ZeroToSeven, $.ZeroToSeven), seq("\\", $.ZeroToSeven, $.ZeroToSeven), seq("\\", $.ZeroToSeven)),
    // UnicodeEscape: $ => seq("\\u", $.HexDigit, $.HexDigit, $.HexDigit, $.HexDigit),
    // NOTE: Comment node kinds must contain the lowercase substring
    // "comment" (see docs/PRD.md R3): loc's counter matches node kinds with
    // a case-sensitive `contains("comment")`.
    // Char literals share the single-quoted syntax with strings; a single
    // character gets higher precedence so `'a'` parses as CharLiteral while
    // `'ab'` stays a StringLiteral.
    CharLiteral: $ => prec(1, seq("'", choice($.escape_sequence, $._sq_char), "'")),
    // The star-run form mirrors templates/grammar.js: inside a comment body a
    // run of '*' may only be followed by a non-'/' char, with the closing
    // delimiter matched as `\*+/`. The old `([^\*]|(\*[^\/]))*` form fails on
    // EVEN-length star runs before the closing '/' (e.g. `/***/`, `/* x **/`):
    // stars pair up internally and strand the '/'.
    block_comment: _ => /\/\*([^*]|\*+[^*/])*\*+\//,
    line_comment: _ => /\/\/[^\n\r]*/,
  }
});

// `optionalSeq(a, b, c, ...)` is
// `choice(
//   seq(a, optional(b), optional(c)),
//   seq(optional(a), b, optional(c)),
//   seq(optional(a), optional(b), c)
//  )`
//  This gives us a tree-sitter compatible representation of rules like
//  `header = ["package" namespaceStatement] [usesStatementList] .`
//  where every subrule in the sequence is optional.
function optionalSeq(...rules) {
  if (rules.length === 0) {
    throw new Error("optionalSeq requires at least one rule.");
  }
  let optional_rules = rules.map(
    (_, non_optional_rule_idx) => {
      let all_but_one_rule_optional = rules.map(
        (rule, rule_idx) =>
          non_optional_rule_idx === rule_idx
            ? rule
            : optional(rule)
      )
      return seq(...all_but_one_rule_optional)
    }
  )
  return choice(...optional_rules)
}

// TODO: Maybe use these rules?
// header: $ => optionalSeq(
//   seq("package", $.namespaceStatement),
//   $.usesStatementList
// ),
// annotation: $ => seq("@", $.idAll, repeat(seq(".", $.idAll)), optional($.annotationArguments)),
// gInterfaceOrStructure: $ => seq(
//   choice("interface", "structure"),
//   $.id,
//   PossiblyEmpty.typeVariableDefs($),
//   optional(seq("extends", $.classOrInterfaceType, repeat(seq(",", $.classOrInterfaceType)))),
//   // $.interfaceBody,
// ),
// gEnum: $ => seq(
//   "enum",
//   $.id,
//   PossiblyEmpty.typeVariableDefs($),
//   optional(seq("implements", $.classOrInterfaceType, repeat(seq(",", $.classOrInterfaceType)))),
//   $.enumBody,
// ),
// // gEnhancement: $ => seq(
// //   "enhancement",
// //   $.id,
// //   PossiblyEmpty.typeVariableDefs($),
// //   ":",
// //   $.classOrInterfaceType,
// //   repeat(seq("[", "]")),
// //   $.enhancementBody,
// // ),
// // enhancementBody: $ => seq("{", PossiblyEmpty.enhancementMembers($), "}"),
// // interfaceBody: $ => seq("{", PossiblyEmpty.interfaceMembers($), "}"),
// enumBody: $ => seq("{", optional($.enumConstants), PossiblyEmpty.classMembers($), "}"),
// enumConstants: $ => seq($.enumConstant, repeat(seq(",", $.enumConstant)), optional(","), optional(";")),
// enumConstant: $ => seq($.id, PossiblyEmpty.optionalArguments($)),
// // "interfaceMembers" is possibly empty
// // "classMembers" is possibly empty
//   seq($.functionDefn, optional($.functionBody)),
//   seq($.constructorDefn, $.functionBody),
//   seq($.propertyDefn, optional($.functionBody)),
//   $.delegateDefn,
//   $.gClass,
//   $.gInterfaceOrStructure,
//   $.gEnum,
// // "enhancementMembers" is possibly empty
// delegateDefn: $ => seq("delegate", $.id, $.delegateStatement),
// delegateStatement: $ => seq(
//   optional(seq(":", $.typeLiteral)),
//   "represents",
//   $.typeLiteral,
//   repeat(seq(",", $.typeLiteral)),
//   optional(seq("=", $.expression)),
// ),
// // "optionalType" is possibly empty
// propertyDefn: $ => seq("property", choice("get", "set"), $.id, $.parameters, optional(seq(":", $.typeLiteral))),
// dotPathWord: $ => prec.right(seq($.idAll, repeat(seq(".", $.idAll)))),
// namespaceStatement: $ => seq($.dotPathWord, repeat(";")),
// usesStatementList: $ => seq("uses", $.usesStatement, repeat(seq("uses", $.usesStatement))),
// usesStatement: $ => seq($.dotPathWord, optional(seq(".", "*")), repeat(";")),
// // "typeVariableDefs" is possibly empty
// typeVariableDefinition: $ => seq($.id, optional(seq("extends", $.typeLiteralList))),
// functionBody: $ => $.statementBlock,
// parameters: $ => seq("(", optional($.parameterDeclarationList), ")"),
// functionDefn: $ => seq("function", $.id, PossiblyEmpty.typeVariableDefs($), $.parameters, optional(seq(":", $.typeLiteral))),
// constructorDefn: $ => seq("construct", $.parameters, optional(seq(":", $.typeLiteral))),
// // "modifiers" is possibly empty
// statement: $ => {
//   // Gosu's grammar explicitly that statements may end with semicolons, but
//   // also that a semicolon on its own is a statement. This is ambiguous
//   // since it's unclear whether the following should be considered one or
//   // two statements: `foo;`. Statements are parsed right-associatively so
//   // that statements ending with semicolons are treated as single
//   // statements rather than a pair of statements.
//   return choice(prec.right(seq(choice(
//     $.ifStatement,
//     $.tryCatchFinallyStatement,
//     $.throwStatement,
//     "continue",
//     "break",
//     $.returnStatement,
//     $.forEachStatement,
//     $.whileStatement,
//     $.doWhileStatement,
//     $.switchStatement,
//     $.usingStatement,
//     $.assertStatement,
//     seq("final", $.localVarStatement),
//     $.localVarStatement,
//     $.evalExpr,
//     $.assignmentOrMethodCall,
//     $.statementBlock,
//   ), optional(";"))), ";");
// },
// ifStatement: $ => {
//   // Right-associative so that the semicolon after the statement is considered part of the if-statement
//   return prec.right(seq("if", "(", $.expression, ")", $.statement, optional(";"), optional(seq("else", $.statement))));
// },
// tryCatchFinallyStatement: $ => seq("try", $.statementBlock, choice(
//   seq($.catchClause, repeat($.catchClause), optional(seq("finally", $.statementBlock))),
//   seq("finally", $.statementBlock),
// )),
// catchClause: $ => seq("catch", "(", optional("var"), $.id, optional(seq(":", $.typeLiteral)), ")", $.statementBlock),
// assertStatement: $ => seq("assert", $.expression, optional(seq(":", $.expression))),
// usingStatement: $ => seq(
//   "using",
//   "(",
//   choice(seq($.localVarStatement, repeat(seq(",", $.localVarStatement))), $.expression),
//   ")",
//   $.statementBlock,
//   optional(seq("finally", $.statementBlock)),
// ),
// returnStatement: $ => prec.right(seq("return", optional($.expression))),
// whileStatement: $ => seq("while", "(", $.expression, ")", $.statement),
// doWhileStatement: $ => seq("do", $.statement, "while", "(", $.expression, ")"),
// switchStatement: $ => seq("switch", "(", $.expression, ")", "{", repeat($.switchBlockStatementGroup), "}"),
// switchBlockStatementGroup: $ => seq(choice(seq("case", $.expression, ":"), seq("default", ":")), $.statement),
// throwStatement: $ => seq("throw", $.expression),
// localVarStatement: $ => {
//   // XXX check that it's correct for this to be right-associative
//   return prec.right(seq("var", $.id, PossiblyEmpty.optionalType($), optional(seq("=", $.expression))));
// },
// forEachStatement: $ => seq(
//   choice("foreach", "for"),
//   "(",
//   choice(seq($.expression, optional($.indexVar)), seq(optional("var"), $.id, "in", $.expression, optional($.indexRest))),
//   ")",
//   $.statement,
// ),
// indexRest: $ => choice(
//   seq($.indexVar, $.iteratorVar),
//   seq($.iteratorVar, $.indexVar),
//   $.indexVar,
//   $.iteratorVar,
// ),
// indexVar: $ => seq("index", $.id),
// iteratorVar: $ => seq("iterator", $.id),
// thisSuperExpr: _ => choice("this", "super"),
// assignmentOrMethodCall: $ => {
//   // Without specifying an associativity for this rule the grammar
//   // ambiguous. An example of the ambiguity is whether the following should
//   // be interpreted as one or two statements: `foo(bar)`. Parenthesized
//   // expressions (`parenthExpr`) are valid statements according to the
//   // grammar, as are identifiers, and statement separators are entirely
//   // optional. The choice of right associativity here treats the example
//   // text as a single statement since otherwise function calls would not be
//   // parsed as such.
//   return prec.right(seq(
//     choice($.newExpr, $.thisSuperExpr, $.typeLiteralExpr, $.parenthExpr, $.StringLiteral),
//     PossiblyEmpty.indirectMemberAccess($),
//     optional(choice(
//       $.incrementOp,
//       seq($.assignmentOp, $.expression),
//     )),
//   ));
// },
// statementBlock: $ => $.statementBlockBody,
// statementBlockBody: $ => seq("{", repeat($.statement), "}"),
// blockTypeLiteral: $ => $.blockLiteral,
// blockLiteral: $ => {
//   // XXX check that it's correct for this to be right-associative
//   return prec.right(seq("(", optional(seq($.blockLiteralArg, repeat(seq(",", $.blockLiteralArg)))), ")", optional(seq(":", $.typeLiteral))));
// },
// blockLiteralArg: $ => choice(
//   seq($.id, optional(choice(seq("=", $.expression), $.blockTypeLiteral))),
//   seq(optional(seq($.id, ":")), $.typeLiteral, optional(seq("=", $.expression))),
// ),
// typeLiteral: $ => {
//   // XXX check that the "&" operator is indeed left-associative
//   return prec.left(seq($.type, optional(seq("&", $.type))));
// },
// typeLiteralType: $ => $.typeLiteral,
// typeLiteralExpr: $ => $.typeLiteral,
// typeLiteralList: $ => $.typeLiteral,
// XXX check associativity
// classOrInterfaceType: $ => {
//   // XXX is it correct that this is left-associative?
//   return prec.left(seq($.idclassOrInterfaceType, PossiblyEmpty.typeArguments($), repeat(seq(".", $.id, PossiblyEmpty.typeArguments($)))));
// },
// // "typeArguments" is possibly empty
// typeArgument: $ => choice($.typeLiteralType, seq("?", optional(seq(choice("extends", "super"), $.typeLiteralType)))),
// In EBNF, defined as `conditionalExpr`
// conditionalExpr: $ => {
//   // XXX check that the associativity is correct
//   return prec.right(seq($.conditionalOrExpr, optional(choice(seq("?", $.conditionalExpr, ":", $.conditionalExpr), seq("?:", $.conditionalExpr)))));
// },
// conditionalOrExpr: $ => prec.left(seq($.conditionalAndExpr, repeat(seq($.orOp, $.conditionalAndExpr)))),
// conditionalAndExpr: $ => prec.left(seq($.bitwiseOrExpr, repeat(seq($.andOp, $.bitwiseOrExpr)))),
// bitwiseOrExpr: $ => prec.left(seq($.bitwiseXorExpr, repeat(seq("|", $.bitwiseXorExpr)))),
// bitwiseXorExpr: $ => prec.left(seq($.bitwiseAndExpr, repeat(seq("^", $.bitwiseAndExpr)))),
// bitwiseAndExpr: $ => prec.left(seq($.equalityExpr, repeat(seq("&", $.equalityExpr)))),
// equalityExpr: $ => prec.left(seq($.relationalExpr, repeat(seq($.equalityOp, $.relationalExpr)))),
// relationalExpr: $ => prec.left(seq($.intervalExpr, repeat(choice(seq($.relOp, $.intervalExpr), seq("typeis", $.typeLiteralType))))),
// intervalExpr: $ => prec.left(seq($.bitshiftExpr, optional(seq($.intervalOp, $.bitshiftExpr)))),
// bitshiftExpr: $ => prec.left(seq($.additiveExpr, repeat(seq($.bitshiftOp, $.additiveExpr)))),
// additiveExpr: $ => prec.left(seq($.multiplicativeExpr, repeat(seq($.additiveOp, $.multiplicativeExpr)))),
// multiplicativeExpr: $ => prec.left(seq($.typeAsExpr, repeat(seq($.multiplicativeOp, $.typeAsExpr)))),
// typeAsExpr: $ => prec.left(seq($.unaryExpr, repeat(seq($.typeAsOp, $.unaryExpr)))),
// unaryExpr: $ => choice(seq(choice("+", "-", "!-"), $.unaryExprNotPlusMinus), $.unaryExprNotPlusMinus),
// unaryExprNotPlusMinus: $ => {
//   /// XXX check that this precedence is correct
//   return prec(1, choice(seq($.unaryOp, $.unaryExpr), seq("\\", $.blockExpr), $.evalExpr, $.primaryExpr));
// },
// blockExpr: $ => seq(optional($.parameterDeclarationList), "->", choice($.expression, $.statementBlock)),
// parameterDeclarationList: $ => seq($.parameterDeclaration, repeat(seq(",", $.parameterDeclaration))),
// parameterDeclaration: $ => seq(
//   repeat($.annotation),
//   optional("final"),
//   $.id,
//   optional(choice(
//     seq(":", $.typeLiteral, optional(seq("=", $.expression))),
//     $.blockTypeLiteral,
//     seq("=", $.expression),
//   )),
// ),
// annotationArguments: $ => $.arguments,
//   arguments: $ => seq("(", optional(seq($.argExpression, repeat(seq(",", $.argExpression)))), ")"),
//   // "optionArguments" is possibly empty
//   argExpression: $ => choice($.namedArgExpression, $.expression),
//   namedArgExpression: $ => seq(":", $.id, "=", $.expression),
//   evalExpr: $ => seq("eval", "(", $.expression, ")"),
//   featureLiteral: $ => {
//     // XXX check that it's correct for this to be right-associative
//     return prec.right(seq("#", choice($.id, "construct"), PossiblyEmpty.typeArguments($), PossiblyEmpty.optionalArguments($)));
//   },
//   standAloneDataStructureInitialization: $ => {
//     // XXX check that the precedence is correct here
//     // This needs higher precedence than the "statementBlockBody" rule as their syntaxes overlap.
//     return prec(1, seq("{", optional($.initializerExpression), "}"));
//   },
//   primaryExpr: $ => {
//     // XXX check that it's correct for this to be right-associative
//     // XXX check that giving primaryExpr higher precedence is correct. The
//     // intuition is that if some text can be interpreted as an expression
//     // then it should be interpreted as an expression (rather than as a
//     // statement for example).
//     return prec(1, prec.right(seq(choice(
//       $.newExpr,
//       $.thisSuperExpr,
//       $.literal,
//       $.typeLiteralExpr,
//       $.parenthExpr,
//       $.standAloneDataStructureInitialization,
//     ), PossiblyEmpty.indirectMemberAccess($))));
//   },
//   parenthExpr: $ => seq("(", $.expression, ")"),
//   newExpr: $ => {
//     // XXX check associativity
//     return prec.right(seq(
//       "new",
//       optional($.classOrInterfaceType),
//       choice(
//         seq($.arguments, optional(seq("{", choice(PossiblyEmpty.initializer($), PossiblyEmpty.anonymousInnerClass($)), "}"))),
//         seq("[", choice(
//           seq("]", repeat(seq("[", "]")), $.arrayInitializer),
//           seq($.expression, "]", repeat(seq("[", $.expression, "]")), repeat(seq("[", "]"))),
//         )),
//       ),
//     ));
//   },
//   // "anonymousInnerClass" is possibly empty
//   arrayInitializer: $ => seq("{", optional(seq($.expression, repeat(seq(",", $.expression)))), "}"),
//   // "initializer" is possibly empty
//   initializerExpression: $ => choice($.mapInitializerList, $.arrayValueList),
//   arrayValueList: $ => seq($.expression, repeat(seq(",", $.expression))),
//   mapInitializerList: $ => seq($.expression, "->", $.expression, repeat(seq(",", $.expression, "->", $.expression))),
//   objectInitializer: $ => seq($.initializerAssignment, repeat(seq(",", $.initializerAssignment))),
//   initializerAssignment: $ => seq(":", $.id, "=", $.expression),
//   // "indirectMemberAccess" is possibly empty
//   literal: $ => prec(1, choice($.NumberLiteral, $.featureLiteral, $.StringLiteral, $.CharLiteral, "true", "false", "null")),
//   orOp: _ => choice("||", "or"),
//   andOp: _ => choice("&&", "and"),
//   assignmentOp: _ => choice("=", "+=", "-=", "*=", "/=", "&=", "&&=", "|=", "||=", "^=", "%=", seq("<", "<", "="), seq(">", ">", ">", "="), seq(">", ">", "=")),
//   incrementOp: _ => choice("++", "--"),
//   equalityOp: _ => choice("===", "!==", "==", "!="),
//   intervalOp: _ => choice("..", "|..", "..|", "|..|"),
//   relOp: _ => choice(seq("<", "="), seq(">", "="), "<", ">"),
//   bitshiftOp: _ => choice(seq("<", "<"), seq(">", ">", ">"), seq(">", ">")),
//   additiveOp: _ => choice("+", "-", "?+", "?-", "!+", "!-"),
//   multiplicativeOp: _ => choice("*", "/", "%", "?*", "!*", "?/", "?%"),
//   typeAsOp: _ => choice("typeas", "as"),
//   unaryOp: _ => choice("~", "!", "not", "typeof", "statictypeof"),
  // In EBNF, defined as `Ident`
  // Gosu's grammar explicitly matches keywords with this rule but keywords
  // are already naturally matched by "Ident".
  // XXX arbitrarily gave "id" precedence over "idclassOrInterfaceType". Need to check if this is correct.
//   IntegerTypeSuffix: _ => choice("l", "L", "s", "S", "bi", "BI", "b", "B"),
//   // "Letter" is defined above
//   // "NonZeroDigit" is unused in any rule
//   Exponent: $ => seq(choice("e", "E"), optional(choice("+", "-")), $.Digit, repeat($.Digit)),
//   FloatTypeSuffix: _ => choice("f", "F", "d", "D", "bd", "BD"),
//   idclassOrInterfaceType: $ => {
//     // Gosu's grammar explicitly matches keywords with this rule but keywords
//     // are already naturally matched by "Ident".
//     // XXX is it correct that this is left associative?
//     return prec.left($.Ident);
//   },
//   idAll: $ => {
//     // Gosu's grammar explicitly matches keywords with this rule but keywords
//     // are already naturally matched by "Ident".
//     return $.Ident;
//   },
//   NumberLiteral: $ => choice("NaN", "Infinity", $.HexLiteral, $.BinLiteral, $.IntOrFloatPointLiteral),
//   BinLiteral: $ => seq(choice("0b", "0B"), choice("0", "1"), repeat(choice("0", "1")), optional($.IntegerTypeSuffix)),
//   HexLiteral: $ => seq(choice("0x", "0X"), $.HexDigit, repeat($.HexDigit), optional(choice("s", "S", "l", "L"))),
//   IntOrFloatPointLiteral: $ => {
//     // XXX check associatiivty
//     return prec.right(choice(
//       seq(".", $.Digit, repeat($.Digit), optional($.FloatTypeSuffix)),
//       seq($.Digit, repeat($.Digit),
//         // In Gosu's grammar this is not explicitly optional but of the choices is the empty pattern which is equivalent but not allowed in tree-sitter.
//         optional(
//           choice(
//             seq(".", $.Digit, repeat($.Digit), optional($.Exponent), optional($.FloatTypeSuffix)),
//             seq($.Exponent, optional($.FloatTypeSuffix)),
//             $.FloatTypeSuffix,
//             $.IntegerTypeSuffix,
//           ),
//         ),
//       ),
//     ));
//   },
//   CharLiteral: $ => {
//     // In Gosu's syntax, char literals have the same syntax as
//     // single-character single-quoted string literals. Give char literals
//     // higher precedence to break the conflict.
//     return  prec(1, seq("'", choice($.EscapeSequence, /[^'\\]/), "'"));
//   },

// TODO: rm
// Pseudo-rules corresponding to rules in Gosu's grammar which match the empty
// string. Tree-sitter does not permit rules to match the empty string except
// for the start rule. These functions can be called in other rules but cannot
// be a rule on their own.
// const PossiblyEmpty = {
//   // modifiers: $ => repeat(choice($.annotation, "private", "internal", "protected", "public", "static", "abstract", "override", "final", "transient")),
//   optionalType: $ => optional(choice(seq(":", $.typeLiteral), $.blockTypeLiteral)),
//   indirectMemberAccess: $ => repeat(choice(
//     seq(choice(".", "?.", "*."), $.idAll, PossiblyEmpty.typeArguments($)),
//     $.featureLiteral,
//     seq(choice("[", "?["), $.expression, "]"),
//     $.arguments,
//   )),
//   typeVariableDefs: $ => optional(seq("<", $.typeVariableDefinition, repeat(seq(",", $.typeVariableDefinition)), ">")),
//   typeArguments: $ => optional(seq("<", $.typeArgument, repeat(seq(",", $.typeArgument)), ">")),
//   // interfaceMembers: $ => repeat(seq(
//   //   PossiblyEmpty.modifiers($),
//   //   choice(
//   //     $.functionDefn,
//   //     $.propertyDefn,
//   //     $.fieldDefn,
//   //     $.gClass,
//   //     $.gInterfaceOrStructure,
//   //     $.gEnum,
//   //   ),
//   //   optional(";"),
//   // )),
//   classMembers: $ => repeat($.declaration),
//   // enhancementMembers: $ => repeat(seq(
//   //   PossiblyEmpty.modifiers($),
//   //   choice(
//   //     seq($.functionDefn, $.functionBody),
//   //     seq($.propertyDefn, $.functionBody),
//   //   ),
//   //   optional(";"),
//   // )),
//   optionalArguments: $ => optional($.arguments),
//   initializer: $ => optional(choice($.initializerExpression, $.objectInitializer)),
//   anonymousInnerClass: $ => PossiblyEmpty.classMembers($),
// };
