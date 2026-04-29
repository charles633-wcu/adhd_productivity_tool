## 2026-04-22 — Calendar Hydration Nested Button Guard

- Month-view day cells in `CalendarClient` use a non-button container with `role="button"` so the expand control is not nested inside a native `<button>`.
- Added a regression test that selects a day and asserts the `Expand day` control is not rendered under a native button ancestor.
- This guards against the invalid `<button><button /></button>` structure that causes hydration mismatches in Next.js.
