## 2026-04-22 — Calendar Interaction Decisions

- Standardized calendar layout to Sunday-first across `CalendarClient` and `ScheduleCalendar`.
- Added roving-tabindex arrow-key navigation to `ScheduleCalendar`, with focus starting on today.
- Fixed the month-view hydration issue in `CalendarClient` by avoiding a native `<button>` inside another button-like day cell.
- Replaced the old selected-day double-click / expand flow in `CalendarClient` with an explicit animated `Add event` pill.
- The selected-day action now opens `DayDetailModal` directly in add mode via `startInAddMode`, so event creation starts on the form instead of requiring an extra click inside the modal.
- Regression coverage now exists for Sunday-first headers, keyboard navigation, nested-button prevention, and the selected-day add-event flow.
