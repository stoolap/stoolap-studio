"use client";

import { useCallback, useRef, useMemo, useEffect } from "react";
import CodeMirror, { ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { sql, SQLDialect } from "@codemirror/lang-sql";
import { oneDark } from "@codemirror/theme-one-dark";
import { keymap } from "@codemirror/view";
import {
  type CompletionContext,
  type CompletionSource,
} from "@codemirror/autocomplete";
import { useEditorStore } from "@/stores/editor-store";
import { useQueryExecution } from "@/hooks/use-query-execution";

// Stoolap SQL dialect with Stoolap-specific keywords and functions
const StoolapDialect = SQLDialect.define({
  keywords:
    // Standard SQL
    "select from where and or not in between like is null true false as on " +
    "join inner left right cross outer full natural using " +
    "insert into values update set delete " +
    "create drop alter table view index column " +
    "group by order asc desc limit offset having distinct all any exists " +
    "union except intersect " +
    "case when then else end " +
    "primary key foreign references check unique default auto_increment " +
    "add rename to modify truncate " +
    "with recursive " +
    "over partition rows range unbounded preceding following current row " +
    // Stoolap specific
    "show tables views indexes describe explain analyze " +
    "if not memory of timestamp " +
    "rollup cube grouping sets " +
    "using hnsw with",
  types: "integer float text boolean timestamp json vector int bool",
  builtin:
    // Aggregate functions
    "count sum avg min max group_concat " +
    // String functions
    "length upper lower trim ltrim rtrim substr substring replace concat " +
    "starts_with ends_with contains char_length position lpad rpad repeat reverse left right " +
    // Math functions
    "abs ceil ceiling floor round power sqrt mod sign " +
    "ln log log2 log10 exp pi degrees radians " +
    "sin cos tan asin acos atan atan2 " +
    "random rand " +
    // Date/time functions
    "now current_timestamp current_date current_time " +
    "year month day hour minute second " +
    "date_add date_sub date_diff date_trunc date_part extract " +
    "to_timestamp to_date format_timestamp " +
    // Type conversion
    "cast coalesce nullif typeof " +
    // Conditional
    "if ifnull iif " +
    // JSON functions
    "json_extract json_type json_valid json_array_length json_keys " +
    "json_object json_array json_set json_remove json_contains " +
    // Vector functions
    "vec_distance_l2 vec_distance_cosine vec_distance_ip " +
    "vec_dims vec_norm vec_to_text embed " +
    // Window functions
    "row_number rank dense_rank ntile " +
    "lag lead first_value last_value nth_value " +
    "cume_dist percent_rank",
});

interface SqlEditorProps {
  tabId: string;
  value: string;
  isDark: boolean;
  schema?: Record<string, string[]>;
}

export function SqlEditor({ tabId, value, isDark, schema }: SqlEditorProps) {
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const updateTabSql = useEditorStore((s) => s.updateTabSql);
  const { executeQuery } = useQueryExecution();

  // Use refs for values that change frequently to keep keymap stable
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);
  const tabIdRef = useRef(tabId);
  useEffect(() => {
    tabIdRef.current = tabId;
  }, [tabId]);

  const handleChange = useCallback(
    (val: string) => {
      updateTabSql(tabId, val);
    },
    [tabId, updateTabSql],
  );

  const runQueryRef = useRef(() => true);
  useEffect(() => {
    runQueryRef.current = () => {
      const view = editorRef.current?.view;
      const id = tabIdRef.current;
      if (view) {
        const selection = view.state.sliceDoc(
          view.state.selection.main.from,
          view.state.selection.main.to,
        );
        const toExecute = selection || valueRef.current;
        if (toExecute.trim()) executeQuery(id, toExecute);
      } else if (valueRef.current.trim()) {
        executeQuery(id, valueRef.current);
      }
      return true;
    };
  }, [executeQuery]);

  /* eslint-disable react-hooks/refs -- ref is read in key handler, not during render */
  const customKeymap = useMemo(
    () =>
      keymap.of([
        {
          key: "Mod-Enter",
          run: () => runQueryRef.current(),
        },
      ]),
    [],
  );
  /* eslint-enable react-hooks/refs */

  // Custom completion source for unqualified column and table names
  const columnCompletion: CompletionSource = useMemo(() => {
    if (!schema) return () => null;
    const seen = new Set<string>();
    const completions: { label: string; type: string; boost: number }[] = [];
    // Add table/view names
    for (const table of Object.keys(schema)) {
      completions.push({ label: table, type: "type", boost: 1 });
      // Add column names
      for (const col of schema[table]) {
        if (!seen.has(col)) {
          seen.add(col);
          completions.push({ label: col, type: "property", boost: 0 });
        }
      }
    }
    return (context: CompletionContext) => {
      const word = context.matchBefore(/\w+/);
      if (!word && !context.explicit) return null;
      return {
        from: word?.from ?? context.pos,
        options: completions,
      };
    };
  }, [schema]);

  const extensions = useMemo(
    () => [
      sql({
        dialect: StoolapDialect,
        schema: schema,
        upperCaseKeywords: true,
      }),
      StoolapDialect.language.data.of({
        autocomplete: columnCompletion,
      }),
      customKeymap,
    ],
    [schema, customKeymap, columnCompletion],
  );

  return (
    <div className="h-full overflow-auto border-b">
      <CodeMirror
        ref={editorRef}
        value={value}
        onChange={handleChange}
        theme={isDark ? oneDark : undefined}
        extensions={extensions}
        placeholder="Type your SQL query here... (Ctrl/Cmd+Enter to run)"
        basicSetup={{
          lineNumbers: true,
          highlightActiveLineGutter: true,
          foldGutter: true,
          autocompletion: true,
          bracketMatching: true,
          closeBrackets: true,
        }}
        className="text-sm"
        height="100%"
      />
    </div>
  );
}
