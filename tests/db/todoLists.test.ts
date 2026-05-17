import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getDb } = vi.hoisted(() => ({
  getDb: vi.fn(),
}))

vi.mock('@/lib/db/client', () => ({ getDb }))

import { ensureTodoListsForUser } from '@/lib/db/todoLists'

const mockList = { id: 'l1', userId: 'u1', name: 'Inbox', color: null, emoji: null, createdAt: new Date(), updatedAt: new Date() }

beforeEach(() => vi.clearAllMocks())

describe('ensureTodoListsForUser', () => {
  it('returns existing lists without creating Inbox again', async () => {
    const db = {
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([mockList]) })) })),
      insert: vi.fn(),
    }
    getDb.mockReturnValue(db)
    const lists = await ensureTodoListsForUser('u1')
    expect(lists).toEqual([mockList])
    expect(db.insert).not.toHaveBeenCalled()
  })

  it('creates Inbox when the user has no lists', async () => {
    const db = {
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) })),
      insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([mockList]) })) })),
    }
    getDb.mockReturnValue(db)
    const lists = await ensureTodoListsForUser('u1')
    expect(lists).toEqual([mockList])
    expect(db.insert).toHaveBeenCalled()
  })
})
