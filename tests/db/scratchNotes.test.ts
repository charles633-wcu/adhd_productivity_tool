import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getDb } = vi.hoisted(() => ({ getDb: vi.fn() }))
vi.mock('@/lib/db/client', () => ({ getDb }))

// Mock the todo-list helper used by promote (keeps this a unit test of scratchNotes).
const { ensureTodoListsForUser } = vi.hoisted(() => ({ ensureTodoListsForUser: vi.fn() }))
vi.mock('@/lib/db/todoLists', () => ({ ensureTodoListsForUser }))

import {
  listScratchNotes, createScratchNote, updateScratchNote,
  deleteScratchNote, promoteScratchNote,
} from '@/lib/db/scratchNotes'

beforeEach(() => vi.clearAllMocks())

function row(overrides: Record<string, unknown> = {}) {
  return { id: 'n1', userId: 'u1', content: 'buy milk', checked: 0, sortOrder: 0, promotedTodoId: null, createdAt: new Date(), updatedAt: new Date(), ...overrides }
}

describe('listScratchNotes', () => {
  it('returns the rows ordered by the query', async () => {
    const orderBy = vi.fn().mockResolvedValue([row()])
    getDb.mockReturnValue({ select: () => ({ from: () => ({ where: () => ({ orderBy }) }) }) })
    const notes = await listScratchNotes('u1')
    expect(notes).toHaveLength(1)
    expect(orderBy).toHaveBeenCalled()
  })
})

describe('createScratchNote', () => {
  it('inserts with sortOrder = max + 1 and returns the row', async () => {
    const values = vi.fn(() => ({ returning: vi.fn().mockResolvedValue([row({ sortOrder: 5 })]) }))
    getDb.mockReturnValue({
      select: () => ({ from: () => ({ where: () => ({ orderBy: vi.fn().mockResolvedValue([row({ sortOrder: 4 })]) }) }) }),
      insert: () => ({ values }),
    })
    const created = await createScratchNote('u1', 'buy milk')
    expect(created.content).toBe('buy milk')
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', content: 'buy milk', sortOrder: 5 }))
  })

  it('uses sortOrder 0 for the first note', async () => {
    const values = vi.fn(() => ({ returning: vi.fn().mockResolvedValue([row({ sortOrder: 0 })]) }))
    getDb.mockReturnValue({
      select: () => ({ from: () => ({ where: () => ({ orderBy: vi.fn().mockResolvedValue([]) }) }) }),
      insert: () => ({ values }),
    })
    await createScratchNote('u1', 'first')
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ sortOrder: 0 }))
  })
})

describe('updateScratchNote', () => {
  it('maps checked boolean to 1 and returns the updated row', async () => {
    const set = vi.fn(() => ({ where: () => ({ returning: vi.fn().mockResolvedValue([row({ checked: 1 })]) }) }))
    getDb.mockReturnValue({ update: () => ({ set }) })
    const note = await updateScratchNote('u1', 'n1', { checked: true })
    expect(note?.checked).toBe(1)
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ checked: 1 }))
  })

  it('returns undefined when no row was updated (not owned)', async () => {
    getDb.mockReturnValue({ update: () => ({ set: () => ({ where: () => ({ returning: vi.fn().mockResolvedValue([]) }) }) }) })
    expect(await updateScratchNote('u1', 'other', { checked: true })).toBeUndefined()
  })
})

describe('deleteScratchNote', () => {
  it('returns true when a row was removed', async () => {
    getDb.mockReturnValue({ delete: () => ({ where: () => ({ returning: vi.fn().mockResolvedValue([row()]) }) }) })
    expect(await deleteScratchNote('u1', 'n1')).toBe(true)
  })
  it('returns false when nothing was removed', async () => {
    getDb.mockReturnValue({ delete: () => ({ where: () => ({ returning: vi.fn().mockResolvedValue([]) }) }) })
    expect(await deleteScratchNote('u1', 'x')).toBe(false)
  })
})

describe('promoteScratchNote', () => {
  it('returns undefined when the note is not owned/found', async () => {
    getDb.mockReturnValue({ select: () => ({ from: () => ({ where: vi.fn().mockResolvedValue([]) }) }) })
    expect(await promoteScratchNote('u1', 'x')).toBeUndefined()
    expect(ensureTodoListsForUser).not.toHaveBeenCalled()
  })

  it('is idempotent — already-promoted note returns unchanged without creating a todo', async () => {
    const insert = vi.fn()
    getDb.mockReturnValue({
      select: () => ({ from: () => ({ where: vi.fn().mockResolvedValue([row({ promotedTodoId: 't1' })]) }) }),
      insert,
    })
    const note = await promoteScratchNote('u1', 'n1')
    expect(note?.promotedTodoId).toBe('t1')
    expect(insert).not.toHaveBeenCalled()
  })

  it('creates an Inbox todo and links it on first promote', async () => {
    ensureTodoListsForUser.mockResolvedValue([{ id: 'inbox', name: 'Inbox' }])
    const todoReturning = vi.fn().mockResolvedValue([{ id: 'todo1' }])
    const updateReturning = vi.fn().mockResolvedValue([row({ promotedTodoId: 'todo1' })])
    getDb.mockReturnValue({
      select: () => ({ from: () => ({ where: vi.fn().mockResolvedValue([row()]) }) }),
      insert: () => ({ values: () => ({ returning: todoReturning }) }),
      update: () => ({ set: () => ({ where: () => ({ returning: updateReturning }) }) }),
    })
    const note = await promoteScratchNote('u1', 'n1')
    expect(note?.promotedTodoId).toBe('todo1')
    expect(ensureTodoListsForUser).toHaveBeenCalledWith('u1')
  })
})
