export type RepeatFrequency = 'day' | 'week' | 'month' | 'year'

export interface RepeatValue {
  frequency: RepeatFrequency | null
  interval: number
}
