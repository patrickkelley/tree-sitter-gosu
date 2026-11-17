//! This crate provides Gosu language support for the [tree-sitter] parsing library.
//!
//! Typically, you will use the [`LANGUAGE`] constant to add this language to a
//! tree-sitter [`Parser`], and then use the parser to parse some code:
//!
//! ```
//! let code = r#"
//! class Foo {}
//! "#;
//! let mut parser = tree_sitter::Parser::new();
//! let language = tree_sitter_gosu::LANGUAGE;
//! parser
//!     .set_language(&language.into())
//!     .expect("Error loading Gosu parser");
//! let tree = parser.parse(code, None).unwrap();
//! assert!(!tree.root_node().has_error());
//! ```
//!
//! [`Parser`]: https://docs.rs/tree-sitter/0.27.0/tree_sitter/struct.Parser.html
//! [tree-sitter]: https://tree-sitter.github.io/

use tree_sitter_language::LanguageFn;

extern "C" {
    fn tree_sitter_gosu() -> *const ();
    fn tree_sitter_gosu_templates() -> *const ();
}

/// The tree-sitter [`LanguageFn`] for this grammar (`.gs`, `.gsp`, `.gsx`).
pub const LANGUAGE: LanguageFn = unsafe { LanguageFn::from_raw(tree_sitter_gosu) };

/// The tree-sitter [`LanguageFn`] for Gosu templates (`.gst`).
pub const LANGUAGE_TEMPLATES: LanguageFn =
    unsafe { LanguageFn::from_raw(tree_sitter_gosu_templates) };

/// The content of the [`node-types.json`] file for this grammar.
///
/// [`node-types.json`]: https://tree-sitter.github.io/tree-sitter/using-parsers/6-static-node-types
pub const NODE_TYPES: &str = include_str!("../../src/node-types.json");

/// The content of the [`node-types.json`] file for the Gosu templates grammar.
pub const NODE_TYPES_TEMPLATES: &str = include_str!("../../templates/src/node-types.json");

// NOTE: uncomment these to include any queries that this grammar contains:

// pub const HIGHLIGHTS_QUERY: &str = include_str!("../../queries/highlights.scm");
// pub const INJECTIONS_QUERY: &str = include_str!("../../queries/injections.scm");
// pub const LOCALS_QUERY: &str = include_str!("../../queries/locals.scm");
// pub const TAGS_QUERY: &str = include_str!("../../queries/tags.scm");

#[cfg(test)]
mod tests {
    #[test]
    fn test_can_load_grammar() {
        let mut parser = tree_sitter::Parser::new();
        parser
            .set_language(&super::LANGUAGE.into())
            .expect("Error loading Gosu parser");
        let src = concat!(
            "uses a.B#m(String[])\n",
            "@Argument<Date>(\"EffectiveDate\", Date.Today)\n",
            "class Foo<T> {\n",
            "  private var _f(t : T) : Boolean as Própérty = \\t -> true\n",
            "  function run(action : ()) {\n",
            "    var x = 2\n",
            "    var s = 1.toString()\n",
            "    var n = 100000.\n",
            "    g(Outer.Inner<String, Integer>, Vehicle[])\n",
            "  }\n",
            "}\n",
        );
        let tree = parser.parse(src, None).unwrap();
        assert!(!tree.root_node().has_error());
        assert_eq!(tree.root_node().child_count(), 3);
        assert!(super::NODE_TYPES.contains("line_comment"));
        assert!(super::NODE_TYPES.contains("block_comment"));
        assert!(super::NODE_TYPES.contains("shebang_comment"));
    }

    #[test]
    fn test_can_load_templates_grammar() {
        let mut parser = tree_sitter::Parser::new();
        parser
            .set_language(&super::LANGUAGE_TEMPLATES.into())
            .expect("Error loading Gosu templates parser");
        let src = "<%-- comment --%>\n<%@ params(x: String) %>\nHello ${x}\n";
        let tree = parser.parse(src, None).unwrap();
        assert!(!tree.root_node().has_error());
        assert!(super::NODE_TYPES_TEMPLATES.contains("template_comment"));
    }
}
