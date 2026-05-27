import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getCurrentUser, getDb, getCsvString } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getDb: vi.fn(),
  getCsvString: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ getCurrentUser }))
vi.mock('@/lib/db/client', () => ({ getDb }))
vi.mock('@/lib/services/csvExport', () => ({ getCsvString }))

import { GET } from '@/app/api/triggers/export/route'

describe('GET /api/triggers/export', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCurrentUser.mockResolvedValue({ id: 'user1' })
    getDb.mockReturnValue({})
    getCsvString.mockResolvedValue('Idea,Category\nTest,Health')
  })

  it('returns 200 with text/csv content type', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/csv')
  })

  it('returns Content-Disposition attachment header', async () => {
    const res = await GET()
    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename="triggers_export.csv"'
    )
  })

  it('returns the CSV string as body', async () => {
    const res = await GET()
    const text = await res.text()
    expect(text).toBe('Idea,Category\nTest,Health')
  })

  it('returns 500 if getCsvString throws', async () => {
    getCsvString.mockRejectedValue(new Error('DB error'))
    const res = await GET()
    expect(res.status).toBe(500)
  })
})
