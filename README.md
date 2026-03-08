# Stoolap Studio

A visual database management studio for [Stoolap](https://github.com/stoolap/stoolap), built with Next.js. Runs entirely in the browser with the Stoolap engine embedded via WebAssembly/native bindings.

## Features

### SQL Editor
- Multi-tab CodeMirror editor with Stoolap SQL dialect highlighting and autocomplete
- Schema-aware completion (table names, column names, SQL keywords, built-in functions)
- Execute queries with Cmd+Enter, view EXPLAIN plans with Cmd+E
- SQL formatting, query history, and bookmarks
- Open/save `.sql` files from disk
- Multi-statement execution with automatic transaction wrapping

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
- CSV import with batch insert

### Table & View Management
- Create tables with a visual dialog: column types, constraints (PK, NOT NULL, UNIQUE, AUTO_INCREMENT), foreign keys, and default values
- Alter tables (add/modify/drop columns)
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
- Create standard (BTree, Hash, Bitmap) and HNSW indexes via dialog
- Index metadata display in schema tree (type, columns, uniqueness)
- k-NN search template generation from HNSW index context menu

### Foreign Key Navigation
- Visual FK indicators in schema tree and data grid
- Click FK values to navigate to the referenced row in a new data tab
- FK constraint configuration during table creation (CASCADE, RESTRICT, SET NULL, NO ACTION)

### Backup & Restore
- SQL dump export with configurable options (tables, data, views, indexes, DROP IF EXISTS)
- FK dependency-aware table ordering
- SQL dump import with progress tracking and transaction safety

### Theming
- 6 accent color themes (Zinc, Blue, Green, Violet, Orange, Rose)
- 4 IDE themes (Dracula, Nord, Catppuccin, GitHub Dark)
- Light/Dark/System mode toggle
- Persisted across sessions

### Example Database
- One-click example database with `customers`, `products`, `orders` tables, an `order_summary` view, and a `knowledge_base` table with 16-dimensional vector embeddings
- Pre-built indexes and foreign key relationships
- Sample queries demonstrating JOINs, aggregations, vector k-NN search, hybrid search, and vector utilities

## Getting Started

### Prerequisites

- Node.js 18+
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
| Ctrl + Tab | Next tab |
| Ctrl + Shift + Tab | Previous tab |
| Cmd/Ctrl + ? | Shortcuts help |

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Database**: [@stoolap/node](https://www.npmjs.com/package/@stoolap/node) (embedded Stoolap engine)
- **Editor**: CodeMirror 6 with SQL language support
- **UI**: Radix UI primitives, shadcn/ui components, Tailwind CSS 4
- **State**: Zustand with persist middleware
- **Data**: TanStack Query (caching), TanStack Table (grid), TanStack Virtual (scrolling)
- **Language**: TypeScript

## Project Structure

```
src/
  app/              # Next.js pages and API routes
    api/            # REST API (connections, query, schema, data)
  components/
    layout/         # AppShell, Toolbar, Sidebar
    editor/         # SqlEditor, EditorTabs, QueryToolbar
    results/        # ResultsPanel, DataGrid
    data/           # TableViewer, RowEditor
    schema/         # TableTree (sidebar schema browser)
    dialogs/        # Connect, CreateTable, CreateView, CreateIndex,
                    #   AlterTable, VectorSearch, Backup, Restore, etc.
    common/         # ThemeSelector, KeyboardShortcuts, Providers
    explain/        # ExplainView (EXPLAIN plan renderer)
  hooks/            # useQueryExecution, useSchema, useConnection, useModKey
  stores/           # Zustand stores (editor, connection, bookmark, history)
  lib/              # API client, utilities, SQL formatter, vector utils, types
```

## License

Apache License 2.0 — see [LICENSE](LICENSE) for details.
