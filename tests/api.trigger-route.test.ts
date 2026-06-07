import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  revalidatePath,
  getCurrentUser,
  getDb,
  acknowledgeTrigger,
  rescheduleTrigger,
  logTriggerAction,
  syncTriggerToNotion,
  archiveTriggerInNotion,
  regenerateCsv,
} = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  getCurrentUser: vi.fn(),
  getDb: vi.fn(),
  acknowledgeTrigger: vi.fn(),
  rescheduleTrigger: vi.fn(),
  logTriggerAction: vi.fn(),
  syncTriggerToNotion: vi.fn(),
  archiveTriggerInNotion: vi.fn(),
  regenerateCsv: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath,
}))

vi.mock('@/lib/auth', () => ({
  getCurrentUser,
}))

vi.mock('@/lib/db/client', () => ({
  getDb,
}))

vi.mock('@/lib/db/triggers', () => ({
  acknowledgeTrigger,
  rescheduleTrigger,
}))

vi.mock('@/lib/dev/triggerActionLogger', () => ({
  logTriggerAction,
}))

vi.mock('@/lib/services/notionSync', () => ({ syncTriggerToNotion, archiveTriggerInNotion }))
vi.mock('@/lib/services/csvExport', () => ({ regenerateCsv }))

import { PATCH, DELETE } from '@/app/api/triggers/[id]/route'

// The best-effort mirrors are fired without await but with a .catch(), so their mocks must
// return promises (the real services are async). Re-establish resolved impls before each test.
beforeEach(() => {
  syncTriggerToNotion.mockResolvedValue(undefined)
  archiveTriggerInNotion.mockResolvedValue(undefined)
  regenerateCsv.mockResolvedValue(undefined)
})

describe('trigger detail route cache invalidation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('revalidates reminder-derived pages after acknowledge', async () => {
    getCurrentUser.mockResolvedValue({ id: 'user-1' })

    const ownershipQuery = {
      limit: vi.fn().mockResolvedValue([
        { id: 'trigger-1', userId: 'user-1', categoryId: 'cat-1' },
      ]),
    }

    getDb.mockReturnValue({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ownershipQuery),
        })),
      })),
    })

    acknowledgeTrigger.mockResolvedValue({
      id: 'trigger-1',
      userId: 'user-1',
      categoryId: 'cat-1',
      title: 'Review docs',
      reviewIntervalDays: 7,
      lastReviewedAt: new Date('2026-04-12T12:00:00.000Z'),
      nextReviewAt: new Date('2026-04-19T13:05:00.000Z'),
    })

    const request = new Request('http://localhost/api/triggers/trigger-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acknowledge: true }),
    })

    const response = await PATCH(request, {
      params: Promise.resolve({ id: 'trigger-1' }),
    })

    expect(response.status).toBe(200)
    expect(revalidatePath).toHaveBeenCalledWith('/')
    expect(revalidatePath).toHaveBeenCalledWith('/review')
    expect(revalidatePath).toHaveBeenCalledWith('/category/cat-1')
    expect(logTriggerAction).toHaveBeenCalledWith('acknowledge', expect.objectContaining({
      id: 'trigger-1',
    }))
    expect(syncTriggerToNotion).toHaveBeenCalledOnce()
    expect(regenerateCsv).toHaveBeenCalledOnce()
  })

  it('responds without waiting for the Notion/CSV mirror to settle (non-blocking side effects)', async () => {
    getCurrentUser.mockResolvedValue({ id: 'user-1' })

    const ownershipQuery = {
      limit: vi.fn().mockResolvedValue([
        { id: 'trigger-1', userId: 'user-1', categoryId: 'cat-1' },
      ]),
    }
    getDb.mockReturnValue({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ownershipQuery),
        })),
      })),
    })
    acknowledgeTrigger.mockResolvedValue({
      id: 'trigger-1', userId: 'user-1', categoryId: 'cat-1', title: 'Review docs',
    })

    // Gate the mirrors on a promise we never resolve — simulates a slow/hung Notion API.
    // If the route awaited these, PATCH would hang and this test would time out.
    let releaseNotion: () => void = () => {}
    let releaseCsv: () => void = () => {}
    syncTriggerToNotion.mockReturnValue(new Promise<void>(r => { releaseNotion = r }))
    regenerateCsv.mockReturnValue(new Promise<void>(r => { releaseCsv = r }))

    const response = await PATCH(
      new Request('http://localhost/api/triggers/trigger-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acknowledge: true }),
      }),
      { params: Promise.resolve({ id: 'trigger-1' }) }
    )

    expect(response.status).toBe(200)
    expect(syncTriggerToNotion).toHaveBeenCalledOnce()
    expect(regenerateCsv).toHaveBeenCalledOnce()

    // Release the gates so the floating promises settle (avoids open handles).
    releaseNotion()
    releaseCsv()
  })
})

describe('PATCH rescheduleDate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls rescheduleTrigger and returns 200 when date is valid and user owns the trigger', async () => {
    getCurrentUser.mockResolvedValue({ id: 'user-1' })

    const ownershipQuery = {
      limit: vi.fn().mockResolvedValue([
        { id: 'trigger-1', userId: 'user-1', categoryId: 'cat-1' },
      ]),
    }
    const rescheduledTrigger = {
      id: 'trigger-1',
      userId: 'user-1',
      categoryId: 'cat-1',
      title: 'Test',
      nextReviewAt: new Date('2026-08-01T12:00:00.000Z'),
    }
    rescheduleTrigger.mockResolvedValue(rescheduledTrigger)

    getDb.mockReturnValue({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ownershipQuery),
        })),
      })),
    })

    const res = await PATCH(
      new Request('http://localhost/api/triggers/trigger-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rescheduleDate: '2026-08-01T12:00:00.000Z' }),
      }),
      { params: Promise.resolve({ id: 'trigger-1' }) }
    )

    expect(res.status).toBe(200)
    expect(rescheduleTrigger).toHaveBeenCalledWith(
      expect.anything(),
      'trigger-1',
      expect.any(Date)
    )
    expect(logTriggerAction).toHaveBeenCalledWith('reschedule', expect.objectContaining({
      id: 'trigger-1',
    }))
    expect(syncTriggerToNotion).toHaveBeenCalledOnce()
    expect(regenerateCsv).toHaveBeenCalledOnce()
  })

  it('returns 404 and does NOT call rescheduleTrigger when trigger belongs to a different user', async () => {
    getCurrentUser.mockResolvedValue({ id: 'user-2' })

    const ownershipQuery = {
      limit: vi.fn().mockResolvedValue([]),
    }
    getDb.mockReturnValue({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ownershipQuery),
        })),
      })),
    })

    const res = await PATCH(
      new Request('http://localhost/api/triggers/trigger-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rescheduleDate: '2026-08-01T12:00:00.000Z' }),
      }),
      { params: Promise.resolve({ id: 'trigger-1' }) }
    )

    expect(res.status).toBe(404)
    expect(rescheduleTrigger).not.toHaveBeenCalled()
    expect(logTriggerAction).not.toHaveBeenCalled()
  })

  it('returns 400 when rescheduleDate is in the past', async () => {
    getCurrentUser.mockResolvedValue({ id: 'user-1' })

    // Ownership check returns the trigger (so the guard is actually reached)
    const ownershipQuery = {
      limit: vi.fn().mockResolvedValue([
        { id: 'trigger-1', userId: 'user-1', categoryId: 'cat-1' },
      ]),
    }
    getDb.mockReturnValue({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ownershipQuery),
        })),
      })),
    })

    const res = await PATCH(
      new Request('http://localhost/api/triggers/trigger-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rescheduleDate: '2020-01-01T12:00:00.000Z' }),
      }),
      { params: Promise.resolve({ id: 'trigger-1' }) }
    )

    expect(res.status).toBe(400)
    expect(rescheduleTrigger).not.toHaveBeenCalled()
    expect(logTriggerAction).not.toHaveBeenCalled()
  })

  it('returns 400 when rescheduleDate is not a valid ISO datetime', async () => {
    getCurrentUser.mockResolvedValue({ id: 'user-1' })
    getDb.mockReturnValue({})

    const res = await PATCH(
      new Request('http://localhost/api/triggers/trigger-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rescheduleDate: 'not-a-date' }),
      }),
      { params: Promise.resolve({ id: 'trigger-1' }) }
    )

    expect(res.status).toBe(400)
    expect(logTriggerAction).not.toHaveBeenCalled()
  })
})

describe('PATCH reviewIntervalDays', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('recomputes nextReviewAt from createdAt when the trigger has never been reviewed', async () => {
    getCurrentUser.mockResolvedValue({ id: 'user-1' })

    const owned = {
      id: 'trigger-1',
      userId: 'user-1',
      categoryId: 'cat-1',
      createdAt: new Date('2026-04-15T12:00:00.000Z'),
      lastReviewedAt: null,
      nextReviewAt: new Date('2026-04-20T12:00:00.000Z'),
      reviewIntervalDays: 7,
    }

    let setPayload: Record<string, unknown> | undefined
    const returning = vi.fn().mockResolvedValue([{
      ...owned,
      reviewIntervalDays: 3,
      nextReviewAt: new Date('2026-04-18T12:00:00.000Z'),
    }])

    getDb.mockReturnValue({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([owned]),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn((payload: Record<string, unknown>) => {
          setPayload = payload
          return {
            where: vi.fn(() => ({ returning })),
          }
        }),
      })),
    })

    const res = await PATCH(
      new Request('http://localhost/api/triggers/trigger-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewIntervalDays: 3 }),
      }),
      { params: Promise.resolve({ id: 'trigger-1' }) }
    )

    expect(res.status).toBe(200)
    expect(setPayload).toMatchObject({
      reviewIntervalDays: 3,
      nextReviewAt: new Date('2026-04-18T12:00:00.000Z'),
    })
    expect(logTriggerAction).toHaveBeenCalledWith('edit', expect.objectContaining({
      id: 'trigger-1',
    }))
    expect(syncTriggerToNotion).toHaveBeenCalledOnce()
    expect(regenerateCsv).toHaveBeenCalledOnce()
  })
})

describe('DELETE /api/triggers/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('logs the deleted trigger snapshot before removing it', async () => {
    getCurrentUser.mockResolvedValue({ id: 'user-1' })

    const owned = {
      id: 'trigger-1',
      userId: 'user-1',
      categoryId: 'cat-1',
      title: 'Delete me',
    }

    getDb.mockReturnValue({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([owned]),
          })),
        })),
      })),
      delete: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    })

    const res = await DELETE(
      new Request('http://localhost/api/triggers/trigger-1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'trigger-1' }) }
    )

    expect(res.status).toBe(204)
    expect(logTriggerAction).toHaveBeenCalledWith('delete', expect.objectContaining({
      id: 'trigger-1',
      title: 'Delete me',
    }))
    expect(archiveTriggerInNotion).toHaveBeenCalledOnce()
    expect(regenerateCsv).toHaveBeenCalledOnce()
  })
})
