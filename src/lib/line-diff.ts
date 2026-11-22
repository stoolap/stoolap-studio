export type DiffLine = { type: "same" | "add" | "remove"; text: string };

/** Line diff by longest common subsequence; fine for editor-sized SQL. */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  // lcs[i][j] = LCS length of a[i..] and b[j..]
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] =
        a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ type: "same", text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ type: "remove", text: a[i++] });
    } else {
      out.push({ type: "add", text: b[j++] });
    }
  }
  while (i < a.length) out.push({ type: "remove", text: a[i++] });
  while (j < b.length) out.push({ type: "add", text: b[j++] });
  return out;
}

export type DiffRow = DiffLine | { type: "skip"; count: number };

/**
 * Keep `context` unchanged lines around each change; fold longer runs. A
 * run of one line is shown, as its marker would take the same space.
 */
export function foldUnchanged(lines: DiffLine[], context = 2): DiffRow[] {
  const near = lines.map(() => false);
  lines.forEach((l, i) => {
    if (l.type === "same") return;
    for (let k = Math.max(0, i - context); k <= Math.min(lines.length - 1, i + context); k++) {
      near[k] = true;
    }
  });
  const out: DiffRow[] = [];
  let run: DiffLine[] = [];
  const flush = () => {
    if (run.length === 1) out.push(run[0]);
    else if (run.length > 1) out.push({ type: "skip", count: run.length });
    run = [];
  };
  lines.forEach((l, i) => {
    if (l.type !== "same" || near[i]) {
      flush();
      out.push(l);
    } else {
      run.push(l);
    }
  });
  flush();
  return out;
}
