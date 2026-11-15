# AGENTS.md

## What this is

`tree-sitter-gosu` — a tree-sitter grammar for Gosu, a statically typed JVM
language, maintained as a fork of `tarides/tree-sitter-gosu` to be consumed by
`loc` (https://github.com/patrickkelley/loc) for comment-aware line counting.
The spec is `docs/PRD.md` and is authoritative for scope; it mandates strict TDD
(failing corpus test first) for every grammar feature.

## Verification (run in this order before declaring done)

```
npx tree-sitter generate
git diff
npx tree-sitter test
cd templates && npx tree-sitter generate && npx tree-sitter test
git diff
cargo test
```

`generate` must produce no conflicts. `git diff` must be empty after each
generate (regenerated sources are committed with the grammar edit, not left
dirty). `test` runs the corpus in `test/corpus/` (and `templates/test/corpus/`
for the templates grammar). `cargo test` compiles `src/parser.c` via the `cc`
crate and runs the Rust binding tests + doctests.
Single corpus test: `npx tree-sitter test --include 'test name'`.

## Gotchas

- **Comment node kinds MUST contain the lowercase substring `comment`**
  (`line_comment`, `block_comment`, `shebang_comment`, and `template_comment`).
  `loc`'s counter matches `node.kind().contains("comment")` **case-sensitively**
  (`src/counter.rs`); docs/PRD.md R3. A regression here is a release blocker —
  add a corpus test whenever comment handling changes.
- The comment kinds were renamed from the inherited uppercase
  `COMMENT`/`LINE_COMMENT` in this fork (commit "Rename comment node kinds");
  any tooling keyed on the old names must use the lowercase ones.
- **Regenerate + commit `src/` and `templates/src/` after every `grammar.js`
  edit**: `parser.c`, `node-types.json`, `grammar.json`, and the
  `tree_sitter/` headers in both trees are tracked. A grammar change without
  regenerated sources means Rust tests silently test the old parser.
- The tree-sitter CLI is pinned to the **0.25.x** line (`package.json`
  devDependency `^0.25.9`). Do not jump major CLI versions; the grammar is
  generated and tested with 0.25.x only.
- Strict TDD per `docs/PRD.md`: write the failing corpus case first, then the
  grammar change that makes it pass, one commit per unit of work.
- The grammar intentionally accepts incomplete files (e.g. function signatures
  without bodies at top level) for Semgrep-style patterns — divergences from
  the official Gosu EBNF are noted in comments in `grammar.js`. Keep the EBNF
  reference README link intact when editing docs.
- Local machines using **zig cc shims** for `cc` (Rust-style
  `--target=x86_64-unknown-linux-gnu` is rejected by zig): sanitize the target
  flag via a PATH-prefixed wrapper (e.g. rewrite it to `x86_64-linux-gnu`)
  before running `npx tree-sitter test` or `cargo test`. CI (ubuntu-latest,
  real gcc) is unaffected.
