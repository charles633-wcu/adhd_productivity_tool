import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getCurrentUser } = vi.hoisted(() => ({ getCurrentUser: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getCurrentUser }))
vi.mock('@/lib/db/scratchNotes', () => ({
  listScratchNotes: vi.fn(),
  createScratchNote: vi.fn(),
  updateScratchNote: vi.fn(),
  deleteScratchNote: vi.fn(),
  promoteScratchNote: vi.fn(),
}))

import { GET, POST } from '@/app/api/scratch-notes/route'
import { PATCH, DELETE } from '@/app/api/scratch-notes/[id]/route'
import { POST as PROMOTE } from '@/app/api/scratch-notes/[id]/promote/route'
import {
  listScratchNotes, createScratchNote, updateScratchNote,
  deleteScratchNote, promoteScratchNote,
} from '@/lib/db/scratchNotes'

beforeEach(() => { vi.clearAllMocks(); getCurrentUser.mockResolvedValue({ id: 'u1' }) })

// ── Task 3: list + create ─────────────────────────────────────────────
describe('GET /api/scratch-notes', () => {
  it('returns notes', async () => {
    ;(listScratchNotes as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'n1', content: 'a' }])
    const res = await GET(new Request('http://localhost/api/scratch-notes'))
    expect(res.status).toBe(200)
    expect(await res.json()).toHaveLength(1)
  })
})

describe('POST /api/scratch-notes', () => {
  it('201 on valid create', async () => {
    ;(createScratchNote as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'n1', content: 'milk' })
    const res = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ content: 'milk' }) }))
    expect(res.status).toBe(201)
  })

  it('trims content before persisting', async () => {
    ;(createScratchNote as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'n1', content: 'milk' })
    await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ content: '  milk  ' }) }))
    expect(createScratchNote).toHaveBeenCalledWith('u1', 'milk')
  })

  it('400 on empty content', async () => {
    const res = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ content: '   ' }) }))
    expect(res.status).toBe(400)
  })

  it('400 on oversized content', async () => {
    const res = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ content: 'x'.repeat(2001) }) }))
    expect(res.status).toBe(400)
  })
})

// ── Task 4: patch + delete ────────────────────────────────────────────
describe('PATCH /api/scratch-notes/[id]', () => {
  it('200 when owned', async () => {
    ;(updateScratchNote as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'n1', checked: 1 })
    const res = await PATCH(new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ checked: true }) }),
      { params: Promise.resolve({ id: 'n1' }) })
    expect(res.status).toBe(200)
  })

  it('404 when not owned', async () => {
    ;(updateScratchNote as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    const res = await PATCH(new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ checked: true }) }),
      { params: Promise.resolve({ id: 'other' }) })
    expect(res.status).toBe(404)
  })

  it('400 when no fields to update', async () => {
    const res = await PATCH(new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({}) }),
      { params: Promise.resolve({ id: 'n1' }) })
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/scratch-notes/[id]', () => {
  it('204 when owned', async () => {
    ;(deleteScratchNote as ReturnType<typeof vi.fn>).mockResolvedValue(true)
    const res = await DELETE(new Request('http://localhost', { method: 'DELETE' }), { params: Promise.resolve({ id: 'n1' }) })
    expect(res.status).toBe(204)
  })
  it('404 when not owned', async () => {
    ;(deleteScratchNote as ReturnType<typeof vi.fn>).mockResolvedValue(false)
    const res = await DELETE(new Request('http://localhost', { method: 'DELETE' }), { params: Promise.resolve({ id: 'other' }) })
    expect(res.status).toBe(404)
  })
})

// ── Task 5: promote ───────────────────────────────────────────────────
describe('POST /api/scratch-notes/[id]/promote', () => {
  it('200 with linked note', async () => {
    ;(promoteScratchNote as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'n1', promotedTodoId: 't1' })
    const res = await PROMOTE(new Request('http://localhost', { method: 'POST' }), { params: Promise.resolve({ id: 'n1' }) })
    expect(res.status).toBe(200)
    expect((await res.json()).promotedTodoId).toBe('t1')
  })

  it('404 when not owned', async () => {
    ;(promoteScratchNote as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    const res = await PROMOTE(new Request('http://localhost', { method: 'POST' }), { params: Promise.resolve({ id: 'x' }) })
    expect(res.status).toBe(404)
  })
})
