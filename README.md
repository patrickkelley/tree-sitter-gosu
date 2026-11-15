# tree-sitter-gosu

A [tree-sitter](https://tree-sitter.github.io/tree-sitter/) grammar for
[Gosu](https://gosu-lang.github.io/), a statically typed general-purpose
programming language that runs on the Java Virtual Machine.

The grammar is based on the [official Gosu EBNF
grammar](https://github.com/gosu-lang/gosu-lang/blob/78c5f6c839597a81ac5ec75a46259cbb6ad40545/gosu-core/src/main/java/gw/internal/gosu/parser/ebnf/Gosu.ebnf).

Forked from [tarides/tree-sitter-gosu](https://github.com/tarides/tree-sitter-gosu) — thanks for the foundation.

## Supported syntax

This grammar is a partial implementation of Gosu, covering:

- `package` declarations and `uses` statements
- classes with modifiers (`public`/`private`/`internal`/`protected`,
  `static`/`abstract`/`override`/`final`/`transient`)
- field declarations (`var`), optionally typed, with `as` property aliases
  (including `readonly`) and initializers
- functions with typed/default parameters and optional bodies
- basic statements: local `var` declarations, method calls, `new` expressions
- basic expressions: identifiers, string literals, additive operators
  (`+`, `-`, `?+`, `?-`), member access and function calls
- comments (`//` line comments and `/* */` block comments)

Not yet supported: interfaces, structures, enums, enhancements, control flow,
numeric literals, string interpolation, and more — see `docs/PRD.md` for the
planned completion of the grammar.

## License

MIT
