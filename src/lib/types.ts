export interface ConnectionMeta {
  id: string;
  name: string;
  path: string;
  type: "memory" | "file";
  createdAt?: number;
}

export interface QueryResult {
  columns: string[];
  rows: unknown[][];
  time: number;
  totalRows?: number;
  error?: undefined;
}

export interface ExecResult {
  changes: number;
  time: number;
  error?: undefined;
}

export interface DdlResult {
  ddl: string;
  time: number;
  error?: undefined;
}

export interface ErrorResult {
  error: string;
}

export type ApiResult = QueryResult | ExecResult | DdlResult | ErrorResult;

/** One statement's result in a script, with the statement */
export type StatementResult = (QueryResult | ExecResult | DdlResult) & { sql: string };

/** What a script of several statements returns */
export interface ScriptResult {
  results: StatementResult[];
  time: number;
  /** The statement that failed, after the ones in `results` ran, and those after it */
  error?: string;
  failed?: string;
  notRun?: string[];
  /** What ran before the failure was rolled back with it */
  rolledBack?: boolean;
}

export interface ColumnInfo {
  field: string;
  type: string;
  nullable: boolean;
  key: string;
  defaultValue: string;
  extra: string;
}

export interface IndexInfo {
  tableName: string;
  indexName: string;
  /** As SHOW INDEXES lists it: one name, or "(a, b)" for several */
  columnName: string;
  /** The indexed columns, in order */
  columns: string[];
  indexType: string;
  isUnique: boolean;
  options?: string;
}

export interface ForeignKeyInfo {
  columnName: string;
  referencedTable: string;
  referencedColumn: string;
  onDelete: string;
  onUpdate: string;
}

export interface TableSchema {
  name: string;
  columns: ColumnInfo[];
  indexes: IndexInfo[];
}

export interface FilterCondition {
  column: string;
  operator: string;
  value: string;
}

export interface EditorTab {
  id: string;
  title: string;
  sql: string;
  result: ApiResult | null;
  isRunning: boolean;
  mode: "query" | "data";
  tableName?: string;
  lastExecutedSql?: string;
  /** The database it last ran on (path, or id when in memory), and when (epoch ms) */
  lastDb?: string;
  /** That database's name then (it stays known once the database is closed) */
  lastDbName?: string;
  lastRunAt?: number;
  initialFilter?: { column: string; value: string };
  /** Every statement's result when a script ran; `result` is the one shown */
  results?: StatementResult[];
  resultIndex?: number;
  /** How long the user waited for the script (ms), request to parsed rows */
  resultsTime?: number;
  /** The statement the script failed on, after `results` ran */
  resultsError?: string;
  /** Not saved across launches (the example database's query tab) */
  transient?: boolean;
}
