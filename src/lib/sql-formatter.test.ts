import { describe, expect, it } from "vitest";
import { formatSQL } from "./sql-formatter";

describe("formatSQL", () => {
  it("keeps operators of more than one character whole", () => {
    expect(formatSQL("SELECT a FROM t WHERE a >= 1 AND b != 2 AND c <> 3 AND d <= 4")).toBe(
      "SELECT a\nFROM t\nWHERE a >= 1\n  AND b != 2\n  AND c <> 3\n  AND d <= 4",
    );
    expect(formatSQL("SELECT j ->> 'k', j -> 'k', a::TEXT, b || c FROM t")).toBe(
      "SELECT j ->> 'k', j -> 'k', a :: TEXT, b || c\nFROM t",
    );
  });

  it("ends the line after a -- comment, so what follows stays code", () => {
    expect(formatSQL("SELECT 1 -- x\n; SELECT 2")).toBe("SELECT 1 -- x\n;\n\nSELECT 2");
    expect(formatSQL("SELECT a, -- first\nb FROM t")).toBe("SELECT a, -- first\n  b\nFROM t");
    expect(formatSQL("SELECT a -- note\nFROM t")).toBe("SELECT a -- note\nFROM t");
  });

  it("separates statements with a blank line", () => {
    expect(formatSQL("insert into t values (1); delete from t")).toBe("INSERT INTO t\nVALUES (1);\n\nDELETE\nFROM t");
  });

  it("leaves strings and quoted names as written", () => {
    expect(formatSQL("select 'a\\'  ,b' , `x  y` from t")).toBe("SELECT 'a\\'  ,b', `x  y`\nFROM t");
    expect(formatSQL("SELECT 1 # note\nFROM t")).toBe("SELECT 1 # note\nFROM t");
  });
});
