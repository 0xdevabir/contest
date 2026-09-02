/**
 * Reserved-word sets per language family. Kept as-is during normalization
 * (everything else identifier-shaped gets renamed to `V`) so that control
 * structure survives — `for`/`while`/`if` staying literal is what lets the
 * winnowing fingerprint compare *structure*, not just "both files have
 * variables named V".
 */
const C_LIKE = new Set([
  "auto", "break", "case", "char", "const", "continue", "default", "do", "double",
  "else", "enum", "extern", "float", "for", "goto", "if", "inline", "int", "long",
  "register", "restrict", "return", "short", "signed", "sizeof", "static", "struct",
  "switch", "typedef", "union", "unsigned", "void", "volatile", "while",
  "_Bool", "_Complex", "_Imaginary",
]);

const CPP_EXTRA = new Set([
  "asm", "bool", "catch", "class", "const_cast", "delete", "dynamic_cast", "explicit",
  "export", "false", "friend", "mutable", "namespace", "new", "operator", "private",
  "protected", "public", "reinterpret_cast", "static_cast", "template", "this", "throw",
  "true", "try", "typeid", "typename", "using", "virtual", "wchar_t",
  "std", "cin", "cout", "endl", "vector", "string", "map", "set", "pair",
  "include", "define", "ifndef", "ifdef", "endif", "pragma",
]);

const JAVA = new Set([
  "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char", "class",
  "const", "continue", "default", "do", "double", "else", "enum", "extends", "final",
  "finally", "float", "for", "goto", "if", "implements", "import", "instanceof", "int",
  "interface", "long", "native", "new", "package", "private", "protected", "public",
  "return", "short", "static", "strictfp", "super", "switch", "synchronized", "this",
  "throw", "throws", "transient", "try", "void", "volatile", "while", "true", "false",
  "null", "System", "String",
]);

const JS = new Set([
  "break", "case", "catch", "class", "const", "continue", "debugger", "default",
  "delete", "do", "else", "export", "extends", "finally", "for", "function", "if",
  "import", "in", "instanceof", "new", "return", "super", "switch", "this", "throw",
  "try", "typeof", "var", "void", "while", "with", "yield", "let", "async", "await",
  "true", "false", "null", "undefined", "console", "require", "module", "exports",
]);

const PYTHON = new Set([
  "False", "None", "True", "and", "as", "assert", "async", "await", "break", "class",
  "continue", "def", "del", "elif", "else", "except", "finally", "for", "from",
  "global", "if", "import", "in", "is", "lambda", "nonlocal", "not", "or", "pass",
  "raise", "return", "try", "while", "with", "yield", "self", "print", "range", "len",
]);

export function keywordSetFor(family: string): Set<string> {
  switch (family) {
    case "c":
      return C_LIKE;
    case "cpp":
      return new Set([...C_LIKE, ...CPP_EXTRA]);
    case "java":
      return JAVA;
    case "js":
      return JS;
    case "python":
      return PYTHON;
    default:
      return C_LIKE;
  }
}
