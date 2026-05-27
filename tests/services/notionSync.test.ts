import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @notionhq/client before importing the service
// Note: the Notion SDK exposes pages.update() (not pages.patch()) for both edits and archives
const mockPagesCreate = vi.fn()
const mockPagesUpdate = vi.fn()
vi.mock('@notionhq/client', () => ({
  Client: vi.fn().mockImplementation(() => ({
    pages: {
      create: mockPagesCreate,
      update: mockPagesUpdate,
    },
  })),
}))

// Mock env vars
vi.stubEnv('NOTION_API_KEY', 'secret_test')
vi.stubEnv('NOTION_DATABASE_ID', 'db_test_id')

// Mock DB
const mockSelect = vi.fn()
const mockUpdate = vi.fn()
const mockDb: any = { select: mockSelect, update: mockUpdate }

vi.mock('@/lib/db/client', () => ({ getDb: () => mockDb }))

import { syncTriggerToNotion, archiveTriggerInNotion } from '@/lib/services/notionSync'

const baseTrigger: any = {
  id: 'trig1',
  categoryId: 'cat1',
  title: 'Test trigger',
  priority: 1,
  reviewIntervalDays: 7,
  summary: 'A summary.',
  notionPageId: null,
}

function setupCategoryMock(name: string) {
  const chain = { from: vi.fn(), where: vi.fn(), limit: vi.fn() }
  chain.limit.mockResolvedValue([{ name }])
  chain.where.mockReturnValue(chain)
  chain.from.mockReturnValue(chain)
  mockSelect.mockReturnValue(chain)
}

function setupUpdateMock() {
  const chain = { set: vi.fn(), where: vi.fn() }
  chain.where.mockResolvedValue([])
  chain.set.mockReturnValue(chain)
  mockUpdate.mockReturnValue(chain)
}

describe('syncTriggerToNotion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupCategoryMock('Health')
    setupUpdateMock()
    mockPagesCreate.mockResolvedValue({ id: 'page_new' })
    mockPagesUpdate.mockResolvedValue({ id: 'page_existing' })
  })

  it('creates a Notion page when notionPageId is null', async () => {
    await syncTriggerToNotion({ ...baseTrigger, notionPageId: null }, mockDb)
    expect(mockPagesCreate).toHaveBeenCalledOnce()
    const call = mockPagesCreate.mock.calls[0][0]
    expect(call.parent.database_id).toBe('db_test_id')
    expect(call.properties['Idea'].title[0].text.content).toBe('Test trigger')
    expect(call.properties['Category'].select.name).toBe('Health')
    expect(call.properties['Priority'].select.name).toBe('High')
    expect(call.properties['Review Deadline'].number).toBe(7)
  })

  it('stores the returned page ID back in the DB with correct payload', async () => {
    await syncTriggerToNotion({ ...baseTrigger, notionPageId: null }, mockDb)
    expect(mockUpdate).toHaveBeenCalledOnce()
    const setPayload = mockUpdate.mock.results[0].value.set.mock.calls[0][0]
    expect(setPayload).toEqual({ notionPageId: 'page_new' })
  })

  it('patches an existing Notion page when notionPageId is set', async () => {
    await syncTriggerToNotion({ ...baseTrigger, notionPageId: 'existing_page' }, mockDb)
    expect(mockPagesUpdate).toHaveBeenCalledOnce()
    expect(mockPagesCreate).not.toHaveBeenCalled()
  })

  it('swallows Notion API errors without throwing', async () => {
    mockPagesCreate.mockRejectedValue(new Error('Notion down'))
    await expect(
      syncTriggerToNotion({ ...baseTrigger, notionPageId: null }, mockDb)
    ).resolves.toBeUndefined()
  })

  it('no-ops when NOTION_API_KEY is missing', async () => {
    vi.stubEnv('NOTION_API_KEY', '')
    await syncTriggerToNotion({ ...baseTrigger, notionPageId: null }, mockDb)
    expect(mockPagesCreate).not.toHaveBeenCalled()
    vi.stubEnv('NOTION_API_KEY', 'secret_test')
  })

  it('maps priority 0 → Extremely High', async () => {
    await syncTriggerToNotion({ ...baseTrigger, priority: 0, notionPageId: null }, mockDb)
    const call = mockPagesCreate.mock.calls[0][0]
    expect(call.properties['Priority'].select.name).toBe('Extremely High')
  })
})

describe('archiveTriggerInNotion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPagesUpdate.mockResolvedValue({})
  })

  it('archives the Notion page when pageId is provided', async () => {
    await archiveTriggerInNotion('page_123')
    expect(mockPagesUpdate).toHaveBeenCalledWith({
      page_id: 'page_123',
      archived: true,
    })
  })

  it('no-ops when pageId is null', async () => {
    await archiveTriggerInNotion(null)
    expect(mockPagesUpdate).not.toHaveBeenCalled()
  })

  it('swallows Notion API errors without throwing', async () => {
    mockPagesUpdate.mockRejectedValue(new Error('Notion down'))
    await expect(archiveTriggerInNotion('page_123')).resolves.toBeUndefined()
  })

  it('no-ops when NOTION_API_KEY is missing', async () => {
    vi.stubEnv('NOTION_API_KEY', '')
    await archiveTriggerInNotion('page_123')
    expect(mockPagesUpdate).not.toHaveBeenCalled()
    vi.stubEnv('NOTION_API_KEY', 'secret_test')
  })
})
