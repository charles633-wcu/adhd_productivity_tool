import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  revalidatePath,
  getCurrentUser,
  getDb,
  acknowledgeTrigger,
  rescheduleTrigger,
} = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  getCurrentUser: vi.fn(),
  getDb: vi.fn(),
  acknowledgeTrigger: vi.fn(),
  rescheduleTrigger: vi.fn(),
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

import { PATCH } from '@/app/api/triggers/[id]/route'

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
  })
})
