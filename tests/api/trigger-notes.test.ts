import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getCurrentUser, getDb, makeNote, mergeMetadata, maybeAutoCompact, logTriggerAction } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getDb: vi.fn(),
  makeNote: vi.fn(),
  mergeMetadata: vi.fn((existing: unknown, patch: unknown) => ({ ...(existing as object ?? {}), ...(patch as object) })),
  maybeAutoCompact: vi.fn(async (meta: unknown) => meta),
  logTriggerAction: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ getCurrentUser }))
vi.mock('@/lib/db/client', () => ({ getDb }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/db/notes', () => ({
  makeNote,
  mergeMetadata,
  maybeAutoCompact,
  NOTE_LIMIT: 50,
  AUTO_COMPACT_THRESHOLD: 8,
}))

vi.mock('@/lib/dev/triggerActionLogger', () => ({
  logTriggerAction,
}))

import { POST } from '@/app/api/triggers/[id]/notes/route'
import { PATCH, DELETE } from '@/app/api/triggers/[id]/notes/[noteId]/route'

function makeDb(trigger: unknown) {
  return {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([trigger]) })) })) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([trigger]) })) })) })),
  }
}

describe('POST /api/triggers/[id]/notes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCurrentUser.mockResolvedValue({ id: 'user-1' })
    makeNote.mockReturnValue({ id: 'note-1', date: '2026-04-16T12:00:00.000Z', text: 'new note' })
  })

  it('appends note and returns updated trigger', async () => {
    const trigger = { id: 'trig-1', userId: 'user-1', categoryId: 'cat-1', agentMetadata: { notes: [] } }
    getDb.mockReturnValue(makeDb(trigger))

    const res = await POST(
      new Request('http://localhost/api/triggers/trig-1/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'new note' }),
      }),
      { params: Promise.resolve({ id: 'trig-1' }) }
    )
    expect(res.status).toBe(200)
    expect(makeNote).toHaveBeenCalledWith('new note')
    expect(logTriggerAction).toHaveBeenCalledWith('add_note', expect.objectContaining({
      id: 'trig-1',
    }))
  })

  it('returns 404 when trigger not owned by user', async () => {
    getDb.mockReturnValue({
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })) })) })),
    })

    const res = await POST(
      new Request('http://localhost/api/triggers/trig-1/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'a note' }),
      }),
      { params: Promise.resolve({ id: 'trig-1' }) }
    )
    expect(res.status).toBe(404)
    expect(logTriggerAction).not.toHaveBeenCalled()
  })

  it('returns 400 NOTE_LIMIT when notes array is full', async () => {
    const notes = Array.from({ length: 50 }, (_, i) => ({ id: `n${i}`, date: '2026-04-01', text: 'note' }))
    const trigger = { id: 'trig-1', userId: 'user-1', categoryId: 'cat-1', agentMetadata: { notes } }
    getDb.mockReturnValue(makeDb(trigger))

    const res = await POST(
      new Request('http://localhost/api/triggers/trig-1/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'overflow note' }),
      }),
      { params: Promise.resolve({ id: 'trig-1' }) }
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('NOTE_LIMIT')
    expect(logTriggerAction).not.toHaveBeenCalled()
  })

  it('calls maybeAutoCompact after appending', async () => {
    const trigger = { id: 'trig-1', userId: 'user-1', categoryId: 'cat-1', agentMetadata: { notes: [], autoCompact: true } }
    getDb.mockReturnValue(makeDb(trigger))

    await POST(
      new Request('http://localhost/api/triggers/trig-1/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'a note' }),
      }),
      { params: Promise.resolve({ id: 'trig-1' }) }
    )
    expect(maybeAutoCompact).toHaveBeenCalled()
    expect(logTriggerAction).toHaveBeenCalledWith('add_note', expect.objectContaining({
      id: 'trig-1',
    }))
  })

  it('returns 400 for empty text', async () => {
    const trigger = { id: 'trig-1', userId: 'user-1', categoryId: 'cat-1', agentMetadata: null }
    getDb.mockReturnValue(makeDb(trigger))

    const res = await POST(
      new Request('http://localhost/api/triggers/trig-1/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '   ' }),
      }),
      { params: Promise.resolve({ id: 'trig-1' }) }
    )
    expect(res.status).toBe(400)
    expect(logTriggerAction).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/triggers/[id]/notes/[noteId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCurrentUser.mockResolvedValue({ id: 'user-1' })
  })

  it('updates note text by ID', async () => {
    const notes = [
      { id: 'note-1', date: '2026-04-01', text: 'original text' },
      { id: 'note-2', date: '2026-04-10', text: 'other note' },
    ]
    const trigger = { id: 'trig-1', userId: 'user-1', categoryId: 'cat-1', agentMetadata: { notes } }
    getDb.mockReturnValue(makeDb(trigger))

    const res = await PATCH(
      new Request('http://localhost/api/triggers/trig-1/notes/note-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'updated text' }),
      }),
      { params: Promise.resolve({ id: 'trig-1', noteId: 'note-1' }) }
    )
    expect(res.status).toBe(200)
    expect(mergeMetadata).toHaveBeenCalled()
    expect(logTriggerAction).toHaveBeenCalledWith('edit_note', expect.objectContaining({
      id: 'trig-1',
    }))
  })

  it('returns 404 when noteId not found', async () => {
    const trigger = { id: 'trig-1', userId: 'user-1', categoryId: 'cat-1', agentMetadata: { notes: [] } }
    getDb.mockReturnValue(makeDb(trigger))

    const res = await PATCH(
      new Request('http://localhost/api/triggers/trig-1/notes/ghost', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'new text' }),
      }),
      { params: Promise.resolve({ id: 'trig-1', noteId: 'ghost' }) }
    )
    expect(res.status).toBe(404)
    expect(logTriggerAction).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/triggers/[id]/notes/[noteId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCurrentUser.mockResolvedValue({ id: 'user-1' })
  })

  it('removes note by ID', async () => {
    const notes = [
      { id: 'note-1', date: '2026-04-01', text: 'to delete' },
      { id: 'note-2', date: '2026-04-10', text: 'to keep' },
    ]
    const trigger = { id: 'trig-1', userId: 'user-1', categoryId: 'cat-1', agentMetadata: { notes } }
    getDb.mockReturnValue(makeDb(trigger))

    const res = await DELETE(
      new Request('http://localhost/api/triggers/trig-1/notes/note-1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'trig-1', noteId: 'note-1' }) }
    )
    expect(res.status).toBe(200)
    expect(logTriggerAction).toHaveBeenCalledWith('delete_note', expect.objectContaining({
      id: 'trig-1',
    }))
  })

  it('returns 404 when noteId not found', async () => {
    const trigger = { id: 'trig-1', userId: 'user-1', categoryId: 'cat-1', agentMetadata: { notes: [] } }
    getDb.mockReturnValue(makeDb(trigger))

    const res = await DELETE(
      new Request('http://localhost/api/triggers/trig-1/notes/ghost', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'trig-1', noteId: 'ghost' }) }
    )
    expect(res.status).toBe(404)
    expect(logTriggerAction).not.toHaveBeenCalled()
  })

  it('returns 404 for IDOR (wrong user)', async () => {
    getCurrentUser.mockResolvedValue({ id: 'attacker' })
    getDb.mockReturnValue({
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })) })) })),
    })

    const res = await DELETE(
      new Request('http://localhost/api/triggers/trig-1/notes/note-1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'trig-1', noteId: 'note-1' }) }
    )
    expect(res.status).toBe(404)
    expect(logTriggerAction).not.toHaveBeenCalled()
  })
})
