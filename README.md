# Stoolap Studio

A visual database management studio for [Stoolap](https://github.com/stoolap/stoolap), built with Next.js. The Stoolap engine runs in-process on the Next.js server through the [@stoolap/node](https://www.npmjs.com/package/@stoolap/node) native driver, so there is no separate database server to run. Stoolap Studio 0.5.1 works with Stoolap 0.5.1 (`@stoolap/node` 0.5.1). Its interface is [Stoolap Desktop](https://github.com/stoolap/stoolap-desktop)'s, in the browser.

## Features

### SQL Editor
- Multi-tab CodeMirror editor with Stoolap SQL dialect highlighting and autocomplete
- Schema-aware completion (table names, column names, SQL keywords, built-in functions)
- Execute queries with Cmd+Enter, view EXPLAIN plans with Cmd+E
- SQL formatting, query history, and bookmarks
- Open/save `.sql` files from disk
- **Run** and **Explain** run only the selected text when there is a selection
- Scripts: each statement's result shows as a tab ("Result #1: 10 rows"); writes are wrapped in a transaction that a failure rolls back, and the error says which statement failed and which never ran
- A transaction you begin with BEGIN stays open across runs, shown in the status bar, and a script that begins one and fails never leaves it open
- INSERT, UPDATE and DELETE with RETURNING show the rows they return
- A query timeout in the status bar stops queries that run too long (5 minutes by default)

### Schema Browser
- Sidebar tree view of all tables and views with search filtering
- Expandable details: columns (type, PK, FK, NOT NULL), indexes, foreign keys
- Row count per table
- Context menu actions: View Data, SELECT *, Show DDL, Insert Row, Create Index, Alter, Truncate, Drop

### Data Viewer
- Interactive grid with virtual scrolling, column sorting, and pagination
- Inline cell editing, row insertion, and row deletion
- Advanced filtering with multiple operators (=, !=, >, LIKE, IN, IS NULL, vector distance)
- Time travel queries (AS OF TIMESTAMP)
- CSV and JSON export (current page or all rows)
- CSV and JSON import with `COPY`
- Integers beyond JavaScript's safe range (2^53) show, edit and delete the right row

### Table & View Management
- Create tables with a visual dialog: column types, constraints (`PRIMARY KEY`, `NOT NULL`, `UNIQUE`, `AUTO_INCREMENT`, `CHECK`), foreign keys with `ON DELETE` / `ON UPDATE` actions, and defaults
- Edit tables: add, rename, retype and drop columns; turn `NOT NULL` and `UNIQUE` on and off; set or remove a column's `DEFAULT` and `CHECK`; set the next `AUTO_INCREMENT` id. The SQL it will run shows before it runs
- Create and drop views
- DDL preview before execution

### Vector Database Support
- Full `VECTOR(N)` column type with dimension presets (128, 256, 384, 512, 768, 1024, 1536)
- Create HNSW indexes with configurable parameters (m, ef_construction, ef_search) and distance metrics (Cosine, L2, Inner Product)
- Dedicated Vector Similarity Search dialog: pick a table, column, metric, paste or pick a query vector, set k limit, add WHERE filters, preview SQL, and run inline
- Distance column auto-detection with color-gradient visualization bars
- Vector cell display: abbreviated in grid, full heatmap in expanded view
- Context menu: Copy Value, Find Similar, Expand

### Index Management
- Create standard and unique indexes (single or multi-column) and HNSW indexes via dialog; the engine picks the index type (B-tree for TEXT columns since Stoolap 0.5.0), and `CREATE INDEX ... USING HASH | BITMAP` in the editor sets it explicitly
- Index metadata display in schema tree (type, columns, uniqueness)
- k-NN search template generation from HNSW index context menu

### Foreign Key Navigation
- Visual FK indicators in schema tree and data grid
- Click FK values to navigate to the referenced row in a new data tab
- FK constraint configuration during table creation (CASCADE, RESTRICT, SET NULL, NO ACTION)

### Backup & Restore
- SQL dump export with configurable options (tables, data, views, indexes, DROP IF EXISTS)
- FK dependency-aware ordering: tables are created parents first and dropped children first
- Index types (BTree, Hash, Bitmap, HNSW) are kept explicit in the dump
- Rows are written by the server from the engine's values, so 64-bit integers, JSON (`null` apart from SQL `NULL`) and backslashes come back exactly
- SQL dump import with progress tracking; it stops at the first error and says what a failure rolls back

### Languages and Look
- 16 languages: English, Türkçe, Deutsch, Français, Español, Português (Brasil), Italiano, Nederlands, Polski, Русский, Українська, 日本語, 한국어, 简体中文, 繁體中文 and Bahasa Indonesia. The app follows the browser's language; the menu's **Language** picks another, kept in the browser
- Follows the system's light and dark mode

### Example Database
- One-click example database with `customers`, `products`, `orders` tables, an `order_summary` view, and a `knowledge_base` table with 16-dimensional vector embeddings
- Pre-built indexes and foreign key relationships
- Sample queries demonstrating JOINs, aggregations, vector k-NN search, hybrid search, and vector utilities

## Getting Started

### Prerequisites

- Node.js 20.9+ (required by Next.js 16)
- npm

### Install & Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Production Build

```bash
npm run build
npm start
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd/Ctrl + Enter | Execute query |
| Cmd/Ctrl + E | Explain query plan |
| Cmd/Ctrl + Shift + F | Format SQL |
| Cmd/Ctrl + T | New tab |
| Cmd/Ctrl + W | Close tab |
| Cmd/Ctrl + B | Toggle sidebar |
| Cmd/Ctrl + F | Search in results |
| Cmd/Ctrl + C | Copy results |
| Ctrl + Tab | Next tab |
| Ctrl + Shift + Tab | Previous tab |
| Cmd/Ctrl + ? | Shortcuts help |

## How It Works

The interface calls the server through one endpoint, `POST /api/rpc` with `{ cmd, args }`, by the names and arguments of Stoolap Desktop's Tauri commands, so the two apps share their interface code. The commands (`src/server/commands.ts`) run on `@stoolap/node`; `POST /api/import` takes an uploaded CSV or JSON file for `COPY`. Database paths are paths on the server's machine.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Database**: [@stoolap/node](https://www.npmjs.com/package/@stoolap/node) (embedded Stoolap engine)
- **Editor**: CodeMirror 6 with SQL language support
- **UI**: Radix UI primitives, shadcn/ui components, Tailwind CSS 4
- **State**: Zustand with persist middleware
- **Data**: TanStack Query (caching), TanStack Table (grid), TanStack Virtual (scrolling)
- **Translations**: i18next, react-i18next
- **Language**: TypeScript

## Project Structure

```
src/
  app/              # Next.js page and API routes
    api/rpc/        # The UI's commands
    api/import/     # CSV / JSON import with COPY
  server/           # Connections, commands and values on @stoolap/node
  components/
    layout/         # AppShell, AppMenu, Toolbar, Sidebar, Welcome
    editor/         # SqlEditor, EditorTabs, QueryToolbar
    results/        # ResultsPanel, DataGrid
    data/           # TableViewer, RowEditor
    schema/         # TableTree (sidebar schema browser)
    dialogs/        # Connect, CreateTable, AlterTable, CreateView, CreateIndex,
                    #   VectorSearch, Backup, Restore, About, ShortcutsHelp
    common/         # KeyboardShortcuts, NativeHost (confirmations, context menus)
    explain/        # ExplainView (EXPLAIN plan renderer)
  hooks/            # useQueryExecution, useSchema, useConnection, useModKey
  stores/           # Zustand stores (editor, connection, bookmark, history, settings)
  locales/          # Translations, one folder per language
  lib/              # API client, i18n, SQL utilities and formatter, vector utils, types
```

## Tests

```bash
npm test          # UI and server tests; the server's run on the engine
npm run typecheck
```

## License

Apache License 2.0 — see [LICENSE](LICENSE) for details.
