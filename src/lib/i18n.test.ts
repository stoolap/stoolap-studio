import { describe, expect, it } from "vitest";
import { LANGUAGES, resources } from "./i18n";

/** "a.b.c" for every string in a namespace */
function keys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

/** Plural forms differ between languages (Russian has _few/_many, Japanese only _other) */
const base = (key: string) => key.replace(/_(zero|one|two|few|many|other)$/, "");

describe("translations", () => {
  it("cover every language in the list, and nothing else", () => {
    expect(Object.keys(resources).sort()).toEqual(LANGUAGES.map((l) => l.code).sort());
  });

  it("have every English key in every language", () => {
    for (const [ns, english] of Object.entries(resources.en)) {
      const wanted = new Set(keys(english).map(base));
      for (const { code } of LANGUAGES) {
        const have = new Set(keys(resources[code]?.[ns] ?? {}).map(base));
        const missing = [...wanted].filter((k) => !have.has(k));
        expect(missing, `${code}/${ns}.json lacks`).toEqual([]);
      }
    }
  });

  it("keep each {{variable}} of the English text", () => {
    for (const [ns, english] of Object.entries(resources.en)) {
      const vars = (s: unknown) => [...String(s).matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
      const get = (obj: unknown, path: string) =>
        path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], obj);
      for (const key of keys(english)) {
        // A language without that plural form has nothing to compare
        for (const { code } of LANGUAGES) {
          const text = get(resources[code]?.[ns], key);
          if (text === undefined) continue;
          const want = vars(get(english, key)).filter((v) => v !== "count");
          const has = vars(text).filter((v) => v !== "count");
          expect(has, `${code}/${ns}.json ${key}`).toEqual(want);
        }
      }
    }
  });
});
