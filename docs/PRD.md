# PRD: `tree-sitter-gosu` — a tree-sitter grammar for Gosu, for `loc`

## Problem statement

`loc` (https://github.com/patrickkelley/loc) counts comment-aware lines of code
for ten languages via tree-sitter. Gosu is unsupported: `.gs`/`.gsp`/`.gsx`/`.gst`
files fall back to naive non-blank line counts that include comments and blank
lines. The existing community grammar (`tarides/tree-sitter-gosu`, MIT, based on
the official Gosu EBNF) is explicitly partial — no interfaces, enums,
enhancements, control flow, string interpolation, or numeric literals — is
dormant, and has never been published to crates.io. This PRD covers forking it,
finishing it, publishing it, and integrating it into `loc` exactly the way
`tree-sitter-java` is integrated.

## Reference spec

The grammar targets the official Gosu EBNF at
`gosu-lang/gosu-lang@78c5f6c839597a81ac5ec75a46259cbb6ad40545`
(`gosu-core/src/main/java/gw/internal/gosu/parser/ebnf/Gosu.ebnf`) — the same
commit the tarides grammar cites. Divergences from the EBNF are allowed but
must be noted in `grammar.js` comments. The specified divergences are:

- Error-tolerant start: optional shebang, `classpath`, `package`, `uses`, and a
  sequence of type declarations, functions, properties, and statements.
  Function and property bodies may be absent. The EBNF start rule is one type
  declaration.
- `"${expr}"` interpolation as a child of `StringLiteral`. The EBNF string is
  only escapes and any character. A `$` that does not begin `${` is that
  character, including a `$` immediately before the closing quote.
- A fractional literal may also end with the dot, so `100000.` is a float.
  Trailing-dot floats are lexed via a 1-char-lookahead external scanner
  (`src/scanner.c`) that rejects a following `.`, digit, or identifier-start
  character, keeping `0..5` intervals and `1.toString()` member calls
  unambiguous without GLR.
- `reified` is a modifier. It is absent from that EBNF's modifier list.
- `{ expr -> expr }` is only a map initializer. Blocks are the backslash form.
- `uses` accepts static-member tails (`#method`, `#method(Type, ...)`, `#*`,
  `#construct`, `#construct(Type, ...)`) with `member` and `parameters` fields,
  in addition to `.*` (`wildcard`).
- Generic and array type literals (`Map<String, Integer>`, `Outer.Inner<K, V>`,
  `Vehicle[]`) are accepted as primary expressions and call/member receivers.
- Identifiers accept JVM/Unicode identifier characters (`\p{L}`, `\p{Nl}`,
  combining marks, connector punctuation, Unicode digits).
- Block types allow omitting the `block` keyword (`(x: T): R`, `()`), and
  annotations accept `typeArguments` (`@Argument<Date>(...)`).

## Decisions (locked)

| Decision           | Choice                                                            |
|--------------------|-------------------------------------------------------------------|
| Source             | Fork `tarides/tree-sitter-gosu` (GitHub fork, MIT preserved)       |
| File types         | `.gs`, `.gsp`, `.gsx` first; `.gst` templates as a gated phase      |
| Feature scope      | Full core language (Java-level coverage)                           |
| Quality bar        | Corpus tests + real-repo audit                                     |
| Distribution       | Publish `tree-sitter-gosu` to crates.io (crate name is free)        |
| Workflow           | Strict TDD — corpus test first per feature, red-green-refactor      |
| Toolchain          | tree-sitter CLI 0.25.x (pinned); must compile against `tree-sitter` crate 0.27 (`tree-sitter-java` 0.23.5 is the compatibility reference) |
| Scope              | One end-to-end PRD through `loc` integration                       |
| String `$`         | `${expr}` is the only interpolation. A `$` that does not start `${`, including immediately before the closing quote, is string content and must not produce an `ERROR` or an `id` child. `$ident` is literal text. |
| Lambdas            | Blocks are `\ args -> expr` and `\ args -> { statements }` only. `{ expr -> expr }` is a map initializer, not a lambda. |
| Version            | First crates.io release is 0.1.0; 0.1.1 added the string-`$` contract; 0.1.2 and 0.1.3 carry the real-repo audit bug fixes. |

## Goals

- A maintained fork at `patrickkelley/tree-sitter-gosu` that parses the Gosu
  core language for the four Gosu file types.
- Published as `tree-sitter-gosu` on crates.io with a `LANGUAGE` (and
  `LANGUAGE_TEMPLATES`) constant, consumable by `loc` like `tree-sitter-java`.
- `loc` counts Gosu comment-aware, with fixture tests proving it.

## Non-goals

- Full IDE-grade grammar (highlight queries, goto-def) — queries are
  future work; only the parser and node kinds matter for `loc`.
- Byte-exact parity with the Gosu compiler's parser for exotic syntax;
  error-tolerant approximation is acceptable outside the audit corpus.
- Template highlight/injection queries for `.gst`.

## Requirements

### R1 — Fork baseline
- Repo: `patrickkelley/tree-sitter-gosu`, forked from `tarides/tree-sitter-gosu`
  (`main`); MIT `LICENSE` preserved with original attribution.
- Regenerate with tree-sitter CLI **0.25.x** (pinned in `package.json`);
  commit generated `src/parser.c` and `src/node-types.json` (adjust
  `.gitignore` so they are tracked).
- Fix metadata: `license: "MIT"` and fork repository URLs in every manifest
  that carries them (`Cargo.toml`, `package.json`, `package-lock.json`,
  `tree-sitter.json`, `templates/tree-sitter.json`, `pyproject.toml`,
  `grammar.js`, `templates/grammar.js`, `go.mod`, `CMakeLists.txt`,
  `Makefile`); original author attribution retained.
- Existing corpus (`test/corpus/basics.txt`) green after regeneration.

### R2 — Core language (`.gs`, `.gsp`, `.gsx`)
Corpus-test-first per feature (red → green → refactor, one commit per unit):
1. Comments: `//`, `/* */` (also covers GSDoc `/** */`), as `extras`.
2. Strings: escape sequences, multi-line, `${expr}` interpolation with the
   embedded expression parsed as children. A `$` that does not start `${`,
   including immediately before the closing quote (`"$"`, `"cost $"`), is
   string content: no `ERROR`, no `id` child. `$ident` is not interpolation.
   `CharLiteral` for single chars, including `'$'`.
3. Literals: int/float/hex/bin with suffixes, `true`/`false`/`null`, `Infinity`/`NaN`.
4. Types: qualified names, generics (`typeArguments`, `? extends/super`),
   intersections (`&`), arrays (`[]`), function/block types.
5. Type declarations: classes (extends/implements, type variables), interfaces
   and structures, enums (constants + members), enhancements
   (`enhancement X : Type`), inner/anonymous classes.
6. Members: constructors (`construct`), properties (`property get/set`),
   functions with bodies, fields (`var`/`property var`), `delegate`, static
   initializer blocks, modifiers (`public/private/internal/protected`,
   `static/abstract/override/final/transient/reified`), annotations (`@Foo(...)`).
7. Statements: if/else, while, do-while, for/foreach (incl. `index`/`iterator`
   clauses), switch/case/default, try/catch/finally, throw, return, break,
   continue, `using (...)`, `assert`, `eval`, blocks, `;`.
8. Expressions: full EBNF precedence chain (ternary `? :`, Elvis `?:`, `or/and`,
   bitwise, equality, relational + `typeis`, intervals `..`/`|..`/`..|`/`|..|`,
   bitshift, additive incl. `?+`, multiplicative incl. `?*`, `as`/`typeas`,
   unary incl. `not`/`~`/`typeof`), member access (`.`/`?.`/`*.`), indexing,
   `new` (incl. anonymous classes and array initializers), map/list literals
   (`{k -> v}`), feature literals (`#foo`), lambda blocks (`\ args -> expr` and
   `\ args -> { statements }` only), assignment and increment operators.
9. Program files (`.gsp`): top-level statements after `package`/`uses`,
   `classpath`, shebang lines (`shebang_comment`); enhancement files (`.gsx`)
   via the enhancement rule.

### R3 — Comment & string contract (the `loc` lifeline)
- **Every** comment node kind must contain the lowercase substring `comment`
  (`line_comment`, `block_comment`, `shebang_comment`, and `template_comment`
  for `.gst`), because `loc`'s counter matches `node.kind().contains("comment")`
  **case-sensitively**. The inherited `COMMENT`/`LINE_COMMENT` kinds violate
  this and MUST be renamed.
- Comments are `extras`, so they attach inside broken/ERROR regions and their
  ranges remain discoverable.
- String literals own their content. The only expression child is
  `template_substitution` for `${expr}`. A `$` that does not start `${` is
  content, not an `id` and not an `ERROR`. `//` or `/*` inside a string is
  never a comment.
- Locked by fixture tests: `loc`-side `gosu_comments` and grammar-side corpus
  cases, including `"$"` / `"cost $"` and comment text inside a string. A
  regression here is a release blocker.

### R4 — Templates (`.gst`), gated phase
- Sub-grammar in `templates/` (the `tree-sitter-typescript` multi-grammar
  pattern): own `grammar.js`, own corpus (`templates/test/corpus/`), self-contained
  (no shared-module refactor of the root grammar).
- Surface: markup text, `<% statements %>`, `<%= expression %>`,
  `<%@ directive %>`, `<%-- comment --%>` as `template_comment`, and inline
  `${...}` in markup. Scriptlet, expression, and directive interiors recognize
  strings and comments so markers inside strings are not comments. They are not
  a second copy of the statement grammar.
- Gate: ships only after the R7 audit passes for the three code file types.
- Exposed as `LANGUAGE_TEMPLATES` from the same crate.

### R5 — Packaging & publish
- `Cargo.toml`: MIT, description, `repository` = fork, version 0.1.3,
  `dev-dependencies.tree-sitter = "0.27"` (proves `loc`-side compatibility in the
  crate's own tests). 0.1.0 is the first crates.io publish; 0.1.1 added the
  string-`$` contract; 0.1.2 and 0.1.3 carry the real-repo audit bug fixes.
- `cargo publish --dry-run` green (package includes `src/*`, `grammar.js`,
  `templates/**` as needed, `tree-sitter.json`, `LICENSE`, queries).
- Publish to crates.io by the owner (requires `cargo login`); `loc` switches to
  the versioned crates.io dep once 0.1.3 is live; until then `loc` may stay on
  the published crate.
- README updated: supported syntax list kept current, fork/credit note for
  tarides, EBNF link, usage (`LANGUAGE` and `LANGUAGE_TEMPLATES`), and publish
  instructions.

### R6 — `loc` integration (exact `tree-sitter-java` mirror)
- `Cargo.toml` dep (git dep → crates.io dep post-publish).
- `src/langs.rs`: `Lang::Gosu` and `Lang::GosuTemplate` variants;
  extensions `gs|gsp|gsx` → `Gosu`, `gst` → `GosuTemplate`; `ts_language()`
  maps to `tree_sitter_gosu::LANGUAGE` / `LANGUAGE_TEMPLATES`; both report
  language name `gosu`.
- `tests/languages.rs`: `gosu_comments` fixture (comments excluded; `//` inside
  a string counts as code) and a `.gst` fixture (markup counted, template
  comments excluded).
- `docs/PRD.md` R3 table + README supported-languages table rows added.
- CI gates green: `cargo fmt --all --check`, `cargo clippy --all-targets
  -- -D warnings`, `cargo test --all-features`.

### R7 — Validation
- Grammar-side corpus: ≥1 case per R2 feature area (strict TDD — written before
  the grammar change that makes them pass).
- Real-world audit, public: a set of real Gosu files (Apache-2.0, from
  `gosu-lang`) under `examples/` with attribution; CI parses them and fails on
  unexpected ERROR or MISSING nodes. Expected exceptions are listed in
  `examples/allowlist.txt` (paths relative to the audit directory; an empty
  file means every example must parse clean).
- Real-world audit, local: `scripts/audit.sh <path-to-gosu-repo>` reports
  (a) % of files parsing without ERROR nodes and (b) `loc` vs `tokei`/`cloc`
  delta on tracked files. Targets: **≥95% error-free files**; **line counts
  within ±2%** of `tokei`/`cloc` on the same non-blank, non-comment basis on a
  fixture repo. Owner runs it against real Gosu repos (proprietary repos stay
  local; nothing committed).

## Implementation workflow — strict TDD

Every unit of work follows red-green-refactor, matching `loc`'s AGENTS.md:
1. **Red**: add the corpus test (or `loc` fixture) first; show it fail.
2. **Green**: minimal grammar/crate change to pass.
3. **Refactor**: clean up with tests staying green.

Grammar repo CI gates (`.github/workflows/ci.yml`):
`npx tree-sitter generate` then `git diff --exit-code` (root and `templates/`),
`npx tree-sitter test` for both grammars, `cargo test`, plus the `examples/`
audit step. A generate that dirties committed parser sources fails CI. Loc repo
gates as in R6.

## Work breakdown

| Milestone | Work |
|-----------|------|
| M0 | Fork, PRD (this file), AGENTS.md, metadata/license/comment-kind fixes, generate + baseline corpus green, CI scaffold |
| M1 | R2 features 1–9, corpus-first, README syntax list updated |
| M2 | R7 audits (public examples in CI; `scripts/audit.sh` for owner-run local audits) |
| M3 | R4 templates sub-grammar + corpus + `LANGUAGE_TEMPLATES` |
| M4 | R5 packaging; `cargo publish --dry-run`; owner publishes 0.1.3 |
| M5 | R6 `loc` integration on branch `gosu-support` + PR; switch dep to crates.io after publish |

## Dependencies

- Grammar repo: node ≥ 20 + `tree-sitter-cli` 0.25.x (devDep, pinned);
  Rust: `tree-sitter-language`, `cc` (build), `tree-sitter` 0.27 (dev).
- `loc`: unchanged toolchain; new grammar dep as in R6.
- Audit tooling: `tokei` or `cloc` for cross-checks (best-effort; fallback is
  hand-verified fixtures).

## Module structure

```
tree-sitter-gosu/
  docs/PRD.md            — this file
  AGENTS.md              — verification commands + gotchas (house style)
  grammar.js             — code-file grammar (.gs/.gsp/.gsx)
  templates/             — .gst sub-grammar (grammar.js, test/corpus/)
  test/corpus/*.txt      — code-grammar corpus (TDD anchor)
  src/                   — scanner.c + generated parser.c, node-types.json (committed)
  bindings/rust/         — LANGUAGE + LANGUAGE_TEMPLATES via tree-sitter-language
  examples/              — real Gosu samples (Apache-2.0, attributed) for CI audit
  examples/allowlist.txt — expected ERROR/MISSING paths; empty means none
  scripts/audit.sh       — local real-repo audit (% error-free, loc vs tokei delta)
  .github/workflows/ci.yml
```

## Acceptance criteria

- Both repos' full gates green (fmt/clippy/tests; generate + corpus).
- Corpus covers every R2 feature area; examples audit passes in CI with a
  documented allowlist.
- `cargo publish --dry-run` succeeds; crate metadata MIT + fork URLs.
- `loc` on branch `gosu-support` counts a real Gosu repo within the R7 targets,
  `gosu_comments`/`.gst` fixtures green, PR open against `patrickkelley/loc`.
- After the owner publishes 0.1.3 to crates.io, `loc`'s dependency is switched
  to that version and this PRD's R5/R6 are re-verified. Until that publish,
  `loc` may remain on the already-published crate.
