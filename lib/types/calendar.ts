// Shared calendar types. RepeatFrequency and RepeatValue are retired; use RRULE strings.

export interface EventOccurrence {
  occurrenceId: string
  sourceEventId: string
  title: string
  startAt: Date
  endAt: Date
  notes: string | null
  color: string | null
  categoryId: string | null
  rrule: string | null
  isOverride: boolean
  originalDate: string | null
}
