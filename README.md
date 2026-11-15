# tree-sitter-gosu

A [tree-sitter](https://tree-sitter.github.io/tree-sitter/) grammar for
[Gosu](https://gosu-lang.github.io/), a statically typed general-purpose
programming language that runs on the Java Virtual Machine.

The grammar is based on the [official Gosu EBNF
grammar](https://github.com/gosu-lang/gosu-lang/blob/78c5f6c839597a81ac5ec75a46259cbb6ad40545/gosu-core/src/main/java/gw/internal/gosu/parser/ebnf/Gosu.ebnf).

Forked from [tarides/tree-sitter-gosu](https://github.com/tarides/tree-sitter-gosu) — thanks for the foundation.

## Supported syntax

This grammar covers the Gosu core language across `.gs` (classes, interfaces,
structures, enums), `.gsp` (programs), `.gsx` (enhancements), and `.gst`
(templates via `LANGUAGE_TEMPLATES`):

- `package` declarations, `uses` statements (including wildcards), `classpath`
  statements, and leading `#!` shebang comments (`shebang_comment`)
- Type declarations: classes (`extends`, `implements`, generic type variables),
  `interface` and `structure` types, `enum` types (constants with arguments +
  members), `enhancement` declarations (`enhancement X<T> : T[]`), inner and
  anonymous classes
- Members: constructors (`construct`), properties (`property get`/`set`),
  functions (generic type parameters, return types, block parameters), fields
  (`var` with `as`/`readonly` property aliases), `delegate ... represents`,
  `static` initializer blocks, annotations (`@Foo(...)` with named arguments),
  and modifiers (`public`, `private`, `internal`, `protected`, `static`,
  `abstract`, `override`, `final`, `transient`, `reified`)
- Types: qualified names, generics (`<T, ? extends U, ? super V>`),
  intersection types (`A & B`), array types (`T[]`), and `block(...)` types
- Statements: `if`/`else`, `while`, `do`/`while`, `for`/`foreach` (with
  `index` and `iterator` clauses), `switch`/`case`/`default`,
  `try`/`catch`/`finally`, `using (...)` with `finally`, `return`, `throw`,
  `break`, `continue`, `assert`, `eval`, local `var` declarations, and blocks
- Expressions: full EBNF operator precedence hierarchy (ternary `? :`, Elvis
  `?:`, logical `||`/`or` and `&&`/`and`, bitwise, equality `===`/`!==`/`==`/`!=`,
  relational + `typeis`, intervals `..`/`|..`/`..|`/`|..|`, bitshift, additive
  and multiplicative including null-safe/checked `?+`/`?*`, casts `as`/`typeas`,
  unary including `not`/`typeof`/`statictypeof`), null-safe member access
  (`?.`, `*.`, `?[...]`), generic method calls, lambdas (`\ x -> expr`),
  collection/map initializers (`{a, b}`, `{k -> v}`), feature literals (`#Foo`),
  and `new` expressions
- Literals & strings: integer, float, hex (`0x`), and binary (`0b`) literals
  with suffixes (`L`, `S`, `B`, `BI`, `F`, `D`, `BD`), `true`/`false`/`null`,
  `NaN`/`Infinity`, `CharLiteral`, multi-line strings, escape sequences, and
  `"${expr}"` string interpolation parsed as child nodes
- Comments: `line_comment` (`//`), `block_comment` (`/* ... */`, including
  GSDoc `/** ... */`), and `template_comment` (`<%-- ... --%>` in `.gst`)

## License

MIT
