import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

// Mock the DB client
const mockDb = {
  select: vi.fn(),
}
vi.mock('@/lib/db/client', () => ({ getDb: () => mockDb }))

// Mock fs for regenerateCsv
vi.mock('fs', () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}))

import { getCsvString, regenerateCsv } from '@/lib/services/csvExport'

const mockTriggers = [
  {
    id: 't1',
    title: 'Drink water',
    categoryName: 'Health',
    priority: 1,
    reviewIntervalDays: 2,
    summary: 'Stay hydrated.',
  },
  {
    id: 't2',
    title: 'Title with, comma',
    categoryName: 'Work',
    priority: 0,
    reviewIntervalDays: 7,
    summary: null,
  },
]

describe('getCsvString', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const chainMock = { from: vi.fn(), leftJoin: vi.fn(), where: vi.fn() }
    chainMock.where.mockResolvedValue(mockTriggers)
    chainMock.leftJoin.mockReturnValue(chainMock)
    chainMock.from.mockReturnValue(chainMock)
    mockDb.select.mockReturnValue(chainMock)
  })

  it('returns a CSV string with correct header', async () => {
    const csv = await getCsvString(mockDb as any)
    const lines = csv.split('\n')
    expect(lines[0]).toBe('Idea,Category,Last Reviewed,Review Deadline,Priority,Increment,AI summary,Formula')
  })

  it('maps priority 0 → Extremely High, 1 → High, 2 → Medium, 3 → Low', async () => {
    const csv = await getCsvString(mockDb as any)
    const lines = csv.split('\n')
    expect(lines[1]).toContain('High')
    expect(lines[2]).toContain('Extremely High')
  })

  it('quotes fields containing commas', async () => {
    const csv = await getCsvString(mockDb as any)
    expect(csv).toContain('"Title with, comma"')
  })

  it('outputs 0 for Last Reviewed placeholder', async () => {
    const csv = await getCsvString(mockDb as any)
    const lines = csv.split('\n')
    // First data row is "Drink water,Health,..." — no commas in earlier fields, safe to split
    const firstDataLine = lines[1]
    const fields = firstDataLine.split(',')
    expect(fields[2]).toBe('0') // index 2 = Last Reviewed
  })

  it('outputs empty string for null summary', async () => {
    const csv = await getCsvString(mockDb as any)
    const lines = csv.split('\n')
    expect(lines[2]).toContain(',,')
  })

  it('outputs empty string when categoryName is null (left join miss)', async () => {
    const chainMock = { from: vi.fn(), leftJoin: vi.fn(), where: vi.fn() }
    chainMock.where.mockResolvedValue([
      { id: 't3', title: 'No category', categoryName: null, priority: 2, reviewIntervalDays: 7, summary: null },
    ])
    chainMock.leftJoin.mockReturnValue(chainMock)
    chainMock.from.mockReturnValue(chainMock)
    mockDb.select.mockReturnValue(chainMock)

    const csv = await getCsvString(mockDb as any)
    const lines = csv.split('\n')
    // Category field should be empty, not "null"
    expect(lines[1]).toMatch(/^No category,,/)
  })
})

describe('regenerateCsv', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const chainMock = { from: vi.fn(), leftJoin: vi.fn(), where: vi.fn() }
    chainMock.where.mockResolvedValue(mockTriggers)
    chainMock.leftJoin.mockReturnValue(chainMock)
    chainMock.from.mockReturnValue(chainMock)
    mockDb.select.mockReturnValue(chainMock)
  })

  it('calls mkdirSync and writeFileSync', async () => {
    await regenerateCsv(mockDb as any)
    expect(fs.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('notion_backup'),
      { recursive: true }
    )
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining(path.join('notion_backup', 'latest', 'triggers_export.csv')),
      expect.stringContaining('Idea,Category')
    )
  })

  it('swallows fs errors without throwing', async () => {
    vi.mocked(fs.writeFileSync).mockImplementation(() => { throw new Error('disk full') })
    await expect(regenerateCsv(mockDb as any)).resolves.toBeUndefined()
  })
})
