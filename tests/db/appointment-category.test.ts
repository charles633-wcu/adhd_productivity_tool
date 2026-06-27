import { describe, it, expect, vi } from 'vitest'
import { ensureAppointmentCategory } from '@/lib/db/calendar'
import type { DrizzleDb } from '@/lib/db/client'

// Builds a mock matching the chains used by ensureAppointmentCategory:
//   db.select({...}).from(...).where(...).limit(1)  -> rows
//   db.insert(...).values(...)
function mockDb(existing: boolean) {
  const insertValues = vi.fn().mockResolvedValue(undefined)
  const insert = vi.fn(() => ({ values: insertValues }))
  const limit = vi.fn().mockResolvedValue(existing ? [{ id: 'cat-existing' }] : [])
  const where = vi.fn(() => ({ limit }))
  const from = vi.fn(() => ({ where }))
  const select = vi.fn(() => ({ from }))
  return { db: { select, insert } as unknown as DrizzleDb, insert, insertValues }
}

describe('ensureAppointmentCategory', () => {
  it('inserts an Appointment category when none exists', async () => {
    const { db, insert, insertValues } = mockDb(false)
    await ensureAppointmentCategory(db, 'u1')
    expect(insert).toHaveBeenCalledTimes(1)
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', name: 'Appointment' }))
  })

  it('does nothing when an Appointment category already exists', async () => {
    const { db, insert } = mockDb(true)
    await ensureAppointmentCategory(db, 'u1')
    expect(insert).not.toHaveBeenCalled()
  })
})
