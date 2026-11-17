/**
 * @file Gosu is a statically typed general-purpose programming language that runs on the Java Virtual Machine.
 * @author Marek Kubica <marek@tarides.com>
 * @license MIT
 */

#include "tree_sitter/parser.h"

#include <stdbool.h>
#include <wctype.h>

enum TokenType {
  TRAILING_DOT_FLOAT,
};

static bool is_ascii_digit(int32_t c) {
  return '0' <= c && c <= '9';
}

static bool is_ident_start(int32_t c) {
  return ('a' <= c && c <= 'z') ||
         ('A' <= c && c <= 'Z') ||
         c == '_' ||
         c == '$' ||
         c >= 0x80;
}

void *tree_sitter_gosu_external_scanner_create(void) {
  return NULL;
}

void tree_sitter_gosu_external_scanner_destroy(void *payload) {
  (void)payload;
}

unsigned tree_sitter_gosu_external_scanner_serialize(
  void *payload,
  char *buffer
) {
  (void)payload;
  (void)buffer;
  return 0;
}

void tree_sitter_gosu_external_scanner_deserialize(
  void *payload,
  const char *buffer,
  unsigned length
) {
  (void)payload;
  (void)buffer;
  (void)length;
}

bool tree_sitter_gosu_external_scanner_scan(
  void *payload,
  TSLexer *lexer,
  const bool *valid_symbols
) {
  (void)payload;

  if (!valid_symbols[TRAILING_DOT_FLOAT]) {
    return false;
  }

  while (lexer->lookahead > 0 && iswspace((wint_t)lexer->lookahead)) {
    lexer->advance(lexer, true);
  }

  if (!is_ascii_digit(lexer->lookahead)) {
    return false;
  }

  while (is_ascii_digit(lexer->lookahead)) {
    lexer->advance(lexer, false);
  }

  if (lexer->lookahead != '.') {
    return false;
  }

  lexer->advance(lexer, false);

  int32_t next = lexer->lookahead;
  if (next == '.' || is_ascii_digit(next) || is_ident_start(next)) {
    return false;
  }

  lexer->mark_end(lexer);
  lexer->result_symbol = TRAILING_DOT_FLOAT;
  return true;
}
