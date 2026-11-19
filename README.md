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

- `package` declarations, `uses` statements (including `.*` / `#*` wildcards and
  `#method(Type[])` / `#construct(...)` member references with `wildcard`,
  `member`, and `parameters` fields), `classpath` statements, leading `#!`
  shebang comments (`shebang_comment`), and Unicode identifiers
- Type declarations: classes (`extends`, `implements`, generic type variables),
  `interface` and `structure` types, `enum` types (constants with arguments +
  members), `enhancement` declarations (`enhancement X<T> : T[]`), inner and
  anonymous classes
- Members: constructors (`construct`), properties (`property get`/`set` and
  field-style `property Name : T = expr`), functions (generic type parameters,
  return types, block parameters), fields (`var` with `as`/`readonly` property
  aliases and function-signature types like `var _f(t: T): R as F`),
  `delegate ... represents`, `static` initializer blocks, annotations
  (`@Foo<T>(...)` with optional type arguments and named arguments), and
  modifiers (`public`, `private`, `internal`, `protected`, `static`, `abstract`,
  `override`, `final`, `transient`, `reified`)
- Types: qualified names, generics (`<T, ? extends U, ? super V>`),
  intersection types (`A & B`), array types (`T[]`), and `block(...)` /
  shorthand block types (`(x: T): R`, `()`)
- Statements: `if`/`else`, `while`, `do`/`while`, `for`/`foreach` (with
  `index` and `iterator` clauses), `switch`/`case`/`default`,
  `try`/`catch`/`finally`, `using (...)` with `finally`, `return`, `throw`,
  `break`, `continue`, `assert`, `eval`, local `var` declarations, and blocks
- Expressions: full EBNF operator precedence hierarchy (ternary `? :`, Elvis
  `?:`, logical `||`/`or` and `&&`/`and`, bitwise, equality `===`/`!==`/`==`/`!=`,
  relational + `typeis`, intervals `..`/`|..`/`..|`/`|..|`, bitshift, additive
  and multiplicative including null-safe/checked `?+`/`?*`, casts `as`/`typeas`,
  unary including `not`/`typeof`/`statictypeof`), null-safe member access
  (`?.`, `*.`, `?[...]`), generic method calls, generic and array type literals
  (`Map<String, Integer>`, `Outer.Inner<K, V>`, `Vehicle[]`), lambdas
  (`\ x -> expr`), collection/map initializers (`{a, b}`, `{k -> v}`), feature
  literals (`#Foo`), and `new` expressions
- Literals & strings: integer, float (including trailing-dot `100000.`), hex (`0x`), and binary (`0b`) literals
  with suffixes (`L`, `S`, `B`, `BI`, `F`, `D`, `BD`), `true`/`false`/`null`,
  `NaN`/`Infinity`, `CharLiteral`, multi-line strings, escape sequences, and
  `"${expr}"` string interpolation parsed as child nodes. A `$` that does not
  start `${`, including immediately before the closing quote, is string content
- Comments: `line_comment` (`//`), `block_comment` (`/* ... */`, including
  GSDoc `/** ... */`), and `template_comment` (`<%-- ... --%>` in `.gst`)

## Usage

Add to `Cargo.toml`:

```toml
[dependencies]
tree-sitter = "0.27"
tree-sitter-gosu = "0.1.4"
```

`LANGUAGE` parses `.gs`, `.gsp`, and `.gsx`. `LANGUAGE_TEMPLATES` parses `.gst`.
Both are `LanguageFn` values; pass `.into()` to `parser.set_language`. Both
report the language name `gosu` when used by [loc](https://github.com/patrickkelley/loc).

```rust
use tree_sitter::Parser;

let code = "class Foo {}\n";
let mut parser = Parser::new();
parser
    .set_language(&tree_sitter_gosu::LANGUAGE.into())
    .expect("Error loading Gosu parser");
let tree = parser.parse(code, None).unwrap();

let template = "Hello ${name}\n";
parser
    .set_language(&tree_sitter_gosu::LANGUAGE_TEMPLATES.into())
    .expect("Error loading Gosu templates parser");
let template_tree = parser.parse(template, None).unwrap();
```

## Publish

`cargo publish --dry-run` must succeed before publishing. The owner publishes
with `cargo login`, then `cargo publish`. The crate name is `tree-sitter-gosu`.
0.1.0 was the first publish; 0.1.1 added the string-`$` contract; 0.1.2–0.1.4
carry the real-repo audit bug fixes.

## License

MIT
