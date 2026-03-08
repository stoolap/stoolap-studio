/** Quote a SQL identifier with double-quotes, escaping embedded quotes. Server-safe. */
export function quoteId(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** Extract a safe error message: first line only, file system paths stripped. */
export function safeErrorMessage(e: unknown, fallback: string): string {
  if (!(e instanceof Error)) return fallback;
  return e.message.split("\n")[0].replace(/(?:\/[\w.\-/]+)+/g, "[path]");
}

/** Split SQL on semicolons, respecting strings, identifiers, and comments. */
export function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let i = 0;
  while (i < sql.length) {
    // Single-quoted string literal
    if (sql[i] === "'") {
      current += sql[i++];
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          current += "''";
          i += 2;
        } else if (sql[i] === "'") {
          current += sql[i++];
          break;
        } else {
          current += sql[i++];
        }
      }
      continue;
    }
    // Double-quoted identifier
    if (sql[i] === '"') {
      current += sql[i++];
      while (i < sql.length) {
        if (sql[i] === '"' && sql[i + 1] === '"') {
          current += '""';
          i += 2;
        } else if (sql[i] === '"') {
          current += sql[i++];
          break;
        } else {
          current += sql[i++];
        }
      }
      continue;
    }
    // Line comment
    if (sql[i] === "-" && sql[i + 1] === "-") {
      while (i < sql.length && sql[i] !== "\n") {
        current += sql[i++];
      }
      continue;
    }
    // Block comment
    if (sql[i] === "/" && sql[i + 1] === "*") {
      current += sql[i++];
      current += sql[i++];
      while (i < sql.length && !(sql[i] === "*" && sql[i + 1] === "/")) {
        current += sql[i++];
      }
      if (i < sql.length) {
        current += sql[i++];
        current += sql[i++];
      }
      continue;
    }
    // Statement separator
    if (sql[i] === ";") {
      const trimmed = current.trim();
      if (trimmed.length > 0) statements.push(trimmed);
      current = "";
      i++;
      continue;
    }
    current += sql[i++];
  }
  const trimmed = current.trim();
  if (trimmed.length > 0) statements.push(trimmed);
  return statements;
}
