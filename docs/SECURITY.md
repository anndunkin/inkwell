# Inkwell Security Model

Inkwell is a **local-first desktop application**. It has no backend, no user
accounts, and makes no network requests. This document describes the security
boundaries that matter for a desktop app built on Electron + SQLite, and how
Inkwell addresses each one.

## Threat model at a glance

Inkwell's data is a single `.inkwell` SQLite file on the user's own machine. The
primary things worth protecting against are:

- Untrusted **text input** (typed on any page) being interpreted as code — SQL
  injection into the database layer.
- A **compromised or buggy renderer** gaining direct Node/OS access.
- **Malformed input** corrupting the database or crashing the app.
- **Data-integrity** failures that leave orphaned or duplicated rows.

There is no remote attacker surface: the app never opens a socket, never fetches
a URL, and ships no server.

## No network, no server

All persistence happens in-process via `better-sqlite3` against a local file.
There is no HTTP server, no REST/GraphQL API, and no telemetry. The only I/O to
the outside world is reading and writing the user's chosen `.inkwell` file on
disk. This eliminates the entire class of remote-network vulnerabilities.

## Process isolation (Electron hardening)

The renderer is treated as untrusted and is sandboxed away from Node and the OS:

- `contextIsolation: true` — the renderer's JavaScript context is isolated from
  the preload/Electron internals.
- `nodeIntegration: false` — the renderer has no direct access to Node APIs
  (`fs`, `child_process`, `require`, etc.).
- The renderer communicates only through a **typed, allow-listed** API exposed on
  `window.inkwell` via `contextBridge` (`electron/preload.ts`). It cannot invoke
  arbitrary IPC channels — only the specific handlers registered in
  `electron/main.ts` (ideas, projects, deadlines, milestones, publications,
  settings, and file operations).

All SQLite access lives in the **main process** (`electron/db.ts`). The renderer
never touches the database or the filesystem directly.

## SQL injection prevention

Every database query uses **parameterized/prepared statements** — either
`better-sqlite3` prepared statements with `?` placeholders or Drizzle ORM's typed
query builder, which binds values as parameters. User-supplied strings (project
titles, milestone names, publication names, notes, tags) are always bound as
**data**, never concatenated into SQL text.

This means a value like `'; DROP TABLE projects; --` is stored and retrieved
verbatim as a literal string and is never executed. The
`tests/unit/security.test.ts` suite asserts this for project titles, milestone
names, and publication names/notes, and verifies the schema is intact afterward.

## Input validation and safe failure

The db layer relies on SQLite's schema constraints (`NOT NULL`, `UNIQUE`) as the
last line of defense:

- Empty strings are permitted where the schema allows them and are stored as-is.
- Very long strings (tested at 20,000+ characters) are stored without truncation.
- Special characters, path-like strings (`../../etc/passwd`), HTML/script
  fragments (`<script>…</script>`), Unicode, and embedded null bytes are all
  preserved verbatim as data — never interpreted.
- A `null`/`undefined` value for a `NOT NULL` column raises a SQLite constraint
  error, which surfaces as a rejected IPC promise rather than a silent bad write
  or a process crash.
- Deleting a non-existent row returns `false` instead of throwing.

## File path safety

`InkwellDB` opens whatever filename it is given and performs no path validation
itself. Path safety is enforced one layer up in `electron/main.ts`: the app only
ever passes paths that the **user selected through the native OS file dialog**,
which is filtered to the `inkwell` extension (see `doNewFile`, `doOpen`,
`doSaveAs`). The renderer cannot supply an arbitrary path over IPC — it can only
trigger the dialog. This keeps file access under explicit user control.

## Data integrity

- **Cascade delete** — deleting a project also deletes that project's milestones
  and deadlines in a single transaction, so no orphaned child rows remain (there
  are no SQL foreign-key constraints, so this cleanup is done explicitly in
  `deleteProject`).
- **Publication history is preserved** — publications are stored as a list in
  `settings`; removing a publication from that list does **not** delete
  `publication_history` rows. History is intentionally retained (just unlinked).
- **Settings are keyed and idempotent** — `settings` is a key/value store using
  `INSERT OR REPLACE`, so repeated writes to the same key update in place and
  never create duplicate rows.

These guarantees are covered by `tests/unit/security.test.ts`.

## Reporting

Because Inkwell is a local, offline application, there is no server to attack and
no data leaves the user's machine. If you discover a security issue in the app
itself, please open an issue at
<https://github.com/anndunkin/inkwell/issues>.
