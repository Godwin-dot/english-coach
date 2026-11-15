# English Coach architecture and data rules

- Preserve the existing separation between `src/app/api/*`, `src/domain/*`, `src/llm/*`, and UI components.
- Store all persisted dates as complete ISO 8601 UTC strings (`new Date().toISOString()`).
- SQLite must keep `journal_mode = WAL` and `foreign_keys = ON` enabled when opening a connection.
- Never expose provider credentials or server-only secrets in client components, HTML, logs, or API responses.
- Keep persistence and provider calls on the server; validate external input and generated payloads at the boundary.
- Before considering a change complete, run `pnpm exec tsc --noEmit` and `pnpm build` with no errors.
