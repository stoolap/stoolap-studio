/**
 * Basic SQL formatter for Stoolap Studio.
 * Uppercases keywords, adds newlines/indentation at logical boundaries.
 */

const KEYWORDS = new Set([
  "SELECT",
  "FROM",
  "WHERE",
  "AND",
  "OR",
  "NOT",
  "IN",
  "BETWEEN",
  "LIKE",
  "IS",
  "NULL",
  "AS",
  "ON",
  "JOIN",
  "INNER",
  "LEFT",
  "RIGHT",
  "CROSS",
  "OUTER",
  "FULL",
  "NATURAL",
  "USING",
  "INSERT",
  "INTO",
  "VALUES",
  "UPDATE",
  "SET",
  "DELETE",
  "CREATE",
  "DROP",
  "ALTER",
  "TABLE",
  "VIEW",
  "INDEX",
  "GROUP",
  "BY",
  "ORDER",
  "ASC",
  "DESC",
  "LIMIT",
  "OFFSET",
  "HAVING",
  "DISTINCT",
  "ALL",
  "ANY",
  "EXISTS",
  "UNION",
  "EXCEPT",
  "INTERSECT",
  "CASE",
  "WHEN",
  "THEN",
  "ELSE",
  "END",
  "PRIMARY",
  "KEY",
  "FOREIGN",
  "REFERENCES",
  "CHECK",
  "UNIQUE",
  "DEFAULT",
  "AUTO_INCREMENT",
  "ADD",
  "RENAME",
  "TO",
  "MODIFY",
  "TRUNCATE",
  "WITH",
  "RECURSIVE",
  "OVER",
  "PARTITION",
  "ROWS",
  "RANGE",
  "UNBOUNDED",
  "PRECEDING",
  "FOLLOWING",
  "CURRENT",
  "ROW",
  "SHOW",
  "TABLES",
  "VIEWS",
  "INDEXES",
  "DESCRIBE",
  "EXPLAIN",
  "ANALYZE",
  "IF",
  "ROLLUP",
  "CUBE",
  "GROUPING",
  "SETS",
  "TRUE",
  "FALSE",
]);

const NEWLINE_BEFORE = new Set([
  "SELECT",
  "FROM",
  "WHERE",
  "AND",
  "OR",
  "JOIN",
  "INNER",
  "LEFT",
  "RIGHT",
  "CROSS",
  "FULL",
  "NATURAL",
  "GROUP",
  "ORDER",
  "HAVING",
  "LIMIT",
  "OFFSET",
  "UNION",
  "EXCEPT",
  "INTERSECT",
  "SET",
  "VALUES",
  "ON",
]);

const INDENT_AFTER = new Set(["SELECT", "FROM", "WHERE", "SET", "VALUES"]);

export function formatSQL(sql: string): string {
  // Tokenize preserving strings, identifiers, and whitespace
  const tokens: {
    type: "word" | "string" | "symbol" | "space";
    value: string;
  }[] = [];
  let i = 0;

  while (i < sql.length) {
    // Whitespace
    if (/\s/.test(sql[i])) {
      let ws = "";
      while (i < sql.length && /\s/.test(sql[i])) ws += sql[i++];
      tokens.push({ type: "space", value: ws });
      continue;
    }
    // Line comment
    if (sql[i] === "-" && sql[i + 1] === "-") {
      let c = "";
      while (i < sql.length && sql[i] !== "\n") c += sql[i++];
      tokens.push({ type: "string", value: c });
      continue;
    }
    // Block comment
    if (sql[i] === "/" && sql[i + 1] === "*") {
      let c = sql[i++] + sql[i++];
      while (i < sql.length && !(sql[i] === "*" && sql[i + 1] === "/"))
        c += sql[i++];
      if (i < sql.length) {
        c += sql[i++];
        c += sql[i++];
      }
      tokens.push({ type: "string", value: c });
      continue;
    }
    // Single-quoted string
    if (sql[i] === "'") {
      let s = sql[i++];
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          s += "''";
          i += 2;
        } else if (sql[i] === "'") {
          s += sql[i++];
          break;
        } else {
          s += sql[i++];
        }
      }
      tokens.push({ type: "string", value: s });
      continue;
    }
    // Double-quoted identifier
    if (sql[i] === '"') {
      let s = sql[i++];
      while (i < sql.length) {
        if (sql[i] === '"' && sql[i + 1] === '"') {
          s += '""';
          i += 2;
        } else if (sql[i] === '"') {
          s += sql[i++];
          break;
        } else {
          s += sql[i++];
        }
      }
      tokens.push({ type: "string", value: s });
      continue;
    }
    // Word
    if (/[a-zA-Z_]/.test(sql[i])) {
      let w = "";
      while (i < sql.length && /[a-zA-Z0-9_]/.test(sql[i])) w += sql[i++];
      tokens.push({ type: "word", value: w });
      continue;
    }
    // Number (including decimals and scientific notation like 1e10, 3.14e-2)
    if (/[0-9]/.test(sql[i])) {
      let n = "";
      while (i < sql.length && /[0-9]/.test(sql[i])) n += sql[i++];
      if (
        i < sql.length &&
        sql[i] === "." &&
        i + 1 < sql.length &&
        /[0-9]/.test(sql[i + 1])
      ) {
        n += sql[i++];
        while (i < sql.length && /[0-9]/.test(sql[i])) n += sql[i++];
      }
      if (i < sql.length && (sql[i] === "e" || sql[i] === "E")) {
        const next = sql[i + 1];
        if (
          next &&
          (/[0-9]/.test(next) ||
            ((next === "+" || next === "-") &&
              sql[i + 2] &&
              /[0-9]/.test(sql[i + 2])))
        ) {
          n += sql[i++]; // e/E
          if (sql[i] === "+" || sql[i] === "-") n += sql[i++]; // sign
          while (i < sql.length && /[0-9]/.test(sql[i])) n += sql[i++];
        }
      }
      tokens.push({ type: "word", value: n });
      continue;
    }
    // Symbols (operators, parentheses, etc.)
    tokens.push({ type: "symbol", value: sql[i++] });
  }

  // Format
  let result = "";
  let indent = 0;
  let prevKeyword = "";

  for (let t = 0; t < tokens.length; t++) {
    const token = tokens[t];

    if (token.type === "space") {
      // Replace all whitespace with a single space (we add our own newlines)
      continue;
    }

    if (token.type === "word") {
      const upper = token.value.toUpperCase();
      const isKeyword = KEYWORDS.has(upper);

      if (isKeyword && NEWLINE_BEFORE.has(upper)) {
        // GROUP BY, ORDER BY -> don't newline before BY
        if (
          upper === "BY" &&
          (prevKeyword === "GROUP" ||
            prevKeyword === "ORDER" ||
            prevKeyword === "PARTITION")
        ) {
          result += " " + upper;
          prevKeyword = upper;
          continue;
        }
        // JOIN modifiers stay on the same newline as JOIN
        if (
          (upper === "INNER" ||
            upper === "LEFT" ||
            upper === "RIGHT" ||
            upper === "CROSS" ||
            upper === "FULL" ||
            upper === "NATURAL") &&
          t + 1 < tokens.length
        ) {
          // peek ahead for JOIN keyword — if found, emit modifier + JOIN together
          let peek = t + 1;
          while (peek < tokens.length && tokens[peek].type === "space") peek++;
          if (
            peek < tokens.length &&
            tokens[peek].type === "word" &&
            tokens[peek].value.toUpperCase() === "JOIN"
          ) {
            if (INDENT_AFTER.has(prevKeyword)) {
              indent = Math.max(0, indent - 1);
            }
            result += "\n" + "  ".repeat(indent) + upper + " " + "JOIN";
            prevKeyword = "JOIN";
            t = peek; // skip to JOIN token
            continue;
          }
        }
        // ON stays on same line as JOIN target
        if (upper === "ON") {
          result += " " + upper;
          prevKeyword = upper;
          continue;
        }
        // AND/OR in WHERE get newline + indent
        if (upper === "AND" || upper === "OR") {
          result += "\n" + "  ".repeat(indent) + upper;
          prevKeyword = upper;
          continue;
        }

        if (INDENT_AFTER.has(prevKeyword)) {
          indent = Math.max(0, indent - 1);
        }
        result += "\n" + "  ".repeat(indent) + upper;
        if (INDENT_AFTER.has(upper)) {
          indent++;
        }
        prevKeyword = upper;
        continue;
      }

      result +=
        (result.length > 0 && !/[(\n]$/.test(result.trimEnd()) ? " " : "") +
        (isKeyword ? upper : token.value);
      if (isKeyword) prevKeyword = upper;
      continue;
    }

    if (token.type === "string") {
      result +=
        (result.length > 0 && !/[(\n]$/.test(result.trimEnd()) ? " " : "") +
        token.value;
      continue;
    }

    if (token.type === "symbol") {
      if (token.value === ",") {
        result += ",";
      } else if (token.value === "(") {
        result += (result.length > 0 && !/\s$/.test(result) ? " " : "") + "(";
      } else if (token.value === ")") {
        result += ")";
      } else if (token.value === ";") {
        result += ";\n";
        indent = 0;
        prevKeyword = "";
      } else {
        result +=
          (result.length > 0 && !/[(\n\s]$/.test(result) ? " " : "") +
          token.value;
      }
    }
  }

  return result.trim();
}
