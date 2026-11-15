#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="${1:-"$REPO_ROOT/examples"}"
TARGET_DIR="$(cd "$TARGET_DIR" && pwd)"

total=0
ok=0
failed=0

while IFS= read -r -d '' file; do
  total=$((total + 1))
  ext="${file##*.}"
  if [[ "$ext" == "gst" ]]; then
    out="$(cd "$REPO_ROOT/templates" && npx tree-sitter parse "$file" 2>&1 || true)"
  else
    out="$(cd "$REPO_ROOT" && npx tree-sitter parse "$file" 2>&1 || true)"
  fi
  if echo "$out" | grep -q -E '\((ERROR|MISSING)'; then
    echo "FAIL: ${file#"$TARGET_DIR"/}"
    failed=$((failed + 1))
  else
    echo "OK:   ${file#"$TARGET_DIR"/}"
    ok=$((ok + 1))
  fi
done < <(find "$TARGET_DIR" -type f \( -name '*.gs' -o -name '*.gsp' -o -name '*.gsx' -o -name '*.gst' \) -print0 | sort -z)

if [[ "$total" -eq 0 ]]; then
  echo "No Gosu files found in $TARGET_DIR"
  exit 1
fi

pct="$(python3 -c "print(f'{($ok / $total) * 100:.2f}')")"
echo "Audit summary: $ok/$total files error-free (${pct}%)"

python3 -c "import sys; sys.exit(0 if ($ok / $total) >= 0.95 else 1)" || {
  echo "ERROR: error-free rate ${pct}% is below the 95% target"
  exit 1
}

if [[ -n "${LOC_BIN:-}" ]] && [[ -x "${LOC_BIN}" ]] && command -v cloc >/dev/null 2>&1; then
  tmpdir="$(mktemp -d)"
  trap 'rm -rf "$tmpdir"' EXIT
  git -C "$tmpdir" init -q
  while IFS= read -r -d '' f; do
    cp "$f" "$tmpdir/"
  done < <(find "$TARGET_DIR" -type f \( -name '*.gs' -o -name '*.gsp' -o -name '*.gsx' \) -print0)
  git -C "$tmpdir" add -A
  loc_lines="$(cd "$tmpdir" && "$LOC_BIN" | awk '$1 == "gosu" { print $3 }')"
  cloc_lines="$(cloc --force-lang="Java,gs" --force-lang="Java,gsx" --force-lang="Java,gsp" --json "$tmpdir" 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print(sum(v.get('code',0) for k,v in d.items() if isinstance(v,dict) and k not in ('header','SUM')))")"
  if [[ -n "$loc_lines" ]] && [[ "${cloc_lines:-0}" -gt 0 ]]; then
    delta="$(python3 -c "print(f'{abs($loc_lines - $cloc_lines) / $cloc_lines * 100:.2f}')")"
    echo "Line count comparison (.gs/.gsp/.gsx): loc=$loc_lines, cloc=$cloc_lines (delta=${delta}%)"
    python3 -c "import sys; sys.exit(0 if abs($loc_lines - $cloc_lines) / $cloc_lines <= 0.02 else 1)" || {
      echo "ERROR: loc vs cloc delta ${delta}% exceeds 2% threshold"
      exit 1
    }
  fi
fi
