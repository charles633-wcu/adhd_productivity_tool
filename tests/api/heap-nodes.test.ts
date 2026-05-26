import { getTableColumns } from 'drizzle-orm'
import { existsSync, readFileSync } from 'node:fs'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { heapNodes, heapEdges, heapNodeTodos } from '@/lib/db/schema'

const { getCurrentUser, getDb } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getDb: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ getCurrentUser }))
vi.mock('@/lib/db/client', () => ({ getDb }))

import { GET, POST } from '@/app/api/heap/nodes/route'
import { GET as GET_ONE, PATCH, DELETE } from '@/app/api/heap/nodes/[id]/route'

describe('heap schema columns', () => {
  it('heap_nodes has required columns', () => {
    const cols = getTableColumns(heapNodes) as Record<string, { name: string }>
    expect(cols.id.name).toBe('id')
    expect(cols.userId.name).toBe('user_id')
    expect(cols.type.name).toBe('type')
    expect(cols.posX.name).toBe('pos_x')
    expect(cols.posY.name).toBe('pos_y')
  })

  it('heap_edges has required columns', () => {
    const cols = getTableColumns(heapEdges) as Record<string, { name: string }>
    expect(cols.sourceId.name).toBe('source_id')
    expect(cols.targetId.name).toBe('target_id')
  })

  it('heap_node_todos has composite PK columns', () => {
    const cols = getTableColumns(heapNodeTodos) as Record<string, { name: string }>
    expect(cols.nodeId.name).toBe('node_id')
    expect(cols.todoId.name).toBe('todo_id')
  })

  it('heap_nodes has shape, width, height columns', () => {
    const cols = getTableColumns(heapNodes) as Record<string, { name: string }>
    expect(cols.shape.name).toBe('shape')
    expect(cols.width.name).toBe('width')
    expect(cols.height.name).toBe('height')
  })

  it('heap_nodes has priority column', () => {
    const cols = getTableColumns(heapNodes) as Record<string, { name: string }>
    expect(cols.priority.name).toBe('priority')
  })

  it('heap_nodes has projectId column', () => {
    const cols = getTableColumns(heapNodes) as Record<string, { name: string }>
    expect(cols.projectId.name).toBe('project_id')
  })
})

describe('heap migrations', () => {
  it('adds project_id column in migration 0012', () => {
    const migrationPath = 'lib/db/migrations/0012_mind_projects.sql'
    expect(existsSync(migrationPath)).toBe(true)
    const sql = readFileSync(migrationPath, 'utf8').trim()
    expect(sql).toContain('project_id')
    expect(sql).toContain('heap_nodes')

    const journal = JSON.parse(readFileSync('lib/db/migrations/meta/_journal.json', 'utf8')) as {
      entries: Array<{ idx: number; tag: string }>
    }
    expect(journal.entries.some((e) => e.idx === 12 && e.tag === '0012_mind_projects')).toBe(true)
  })

  it('adds priority column to migrated heap_nodes tables', () => {
    const migrationPath = 'lib/db/migrations/0010_heap_node_priority.sql'
    expect(existsSync(migrationPath)).toBe(true)
    expect(readFileSync(migrationPath, 'utf8').trim()).toBe(
      "ALTER TABLE `heap_nodes` ADD `priority` text NOT NULL DEFAULT 'normal';"
    )

    const journal = JSON.parse(readFileSync('lib/db/migrations/meta/_journal.json', 'utf8')) as {
      entries: Array<{ idx: number; tag: string; when: number; version: string; breakpoints: boolean }>
    }
    expect(journal.entries).toContainEqual({
      idx: 10,
      version: '6',
      when: 1778300000000,
      tag: '0010_heap_node_priority',
      breakpoints: true,
    })
  })
})

function mockNode(overrides = {}) {
  return {
    id: 'node-1',
    userId: 'u1',
    type: 'brain_dump',
    title: 'Test node',
    body: null,
    color: null,
    priority: 'normal',
    posX: 0,
    posY: 0,
    shape: 'rectangle',
    width: null,
    height: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function mockDb(rows: unknown[] = []) {
  const chain: Record<string, unknown> = {}
  chain.select = vi.fn(() => chain)
  chain.from = vi.fn(() => chain)
  chain.where = vi.fn(() => Promise.resolve(rows))
  chain.insert = vi.fn(() => chain)
  chain.values = vi.fn(() => chain)
  chain.returning = vi.fn(() => Promise.resolve(rows))
  chain.update = vi.fn(() => chain)
  chain.set = vi.fn(() => chain)
  chain.delete = vi.fn(() => chain)
  return chain
}

describe('GET /api/heap/nodes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCurrentUser.mockResolvedValue({ id: 'u1' })
  })

  it('returns nodes for current user', async () => {
    const node = mockNode()
    const db = {
      select: vi.fn(() => db),
      from: vi.fn(() => db),
      leftJoin: vi.fn(() => db),
      where: vi.fn(() => db),
      groupBy: vi.fn(() => Promise.resolve([node])),
    }
    getDb.mockReturnValue(db)
    const res = await GET(new Request('http://localhost/api/heap/nodes'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].id).toBe('node-1')
  })

  it('includes linked todo counts for node badges', async () => {
    const node = mockNode({ todoCount: 2 })
    const db = {
      select: vi.fn(() => db),
      from: vi.fn(() => db),
      leftJoin: vi.fn(() => db),
      where: vi.fn(() => db),
      groupBy: vi.fn(() => Promise.resolve([node])),
    }
    getDb.mockReturnValue(db)
    const res = await GET(new Request('http://localhost/api/heap/nodes'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body[0].todoCount).toBe(2)
    expect(db.leftJoin).toHaveBeenCalledWith(heapNodeTodos, expect.anything())
    expect(db.groupBy).toHaveBeenCalledWith(heapNodes.id)
    const selectArgs = db.select.mock.calls as unknown as Array<[Record<string, unknown>]>
    expect(selectArgs[0][0]).toEqual(expect.objectContaining({
      todoCount: expect.anything(),
    }))
  })
})

describe('GET /api/heap/nodes/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCurrentUser.mockResolvedValue({ id: 'u1' })
  })

  it('returns 404 when node not found or wrong user', async () => {
    getDb.mockReturnValue(mockDb([]))
    const res = await GET_ONE(
      new Request('http://localhost/api/heap/nodes/node-1'),
      { params: Promise.resolve({ id: 'node-1' }) }
    )
    expect(res.status).toBe(404)
  })

  it('returns node by id', async () => {
    const node = mockNode()
    getDb.mockReturnValue(mockDb([node]))
    const res = await GET_ONE(
      new Request('http://localhost/api/heap/nodes/node-1'),
      { params: Promise.resolve({ id: 'node-1' }) }
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe('node-1')
  })
})

describe('POST /api/heap/nodes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCurrentUser.mockResolvedValue({ id: 'u1' })
  })

  it('creates a node with defaults', async () => {
    const node = mockNode()
    const db = mockDb([node])
    getDb.mockReturnValue(db)
    const res = await POST(new Request('http://localhost/api/heap/nodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test node' }),
    }))
    expect(res.status).toBe(201)
  })

  it('rejects missing title with 400', async () => {
    const res = await POST(new Request('http://localhost/api/heap/nodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }))
    expect(res.status).toBe(400)
  })

  it('rejects invalid color with 400', async () => {
    const res = await POST(new Request('http://localhost/api/heap/nodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'X', color: 'red' }),
    }))
    expect(res.status).toBe(400)
  })

  it('creates a node with manual priority', async () => {
    const db = mockDb([mockNode({ priority: 'high' })])
    getDb.mockReturnValue(db)
    const res = await POST(new Request('http://localhost/api/heap/nodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'High node', priority: 'high' }),
    }))
    expect(res.status).toBe(201)
    expect(db.values).toHaveBeenCalledWith(expect.objectContaining({ priority: 'high' }))
  })

  it('rejects invalid priority with 400', async () => {
    const res = await POST(new Request('http://localhost/api/heap/nodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'X', priority: 'urgent' }),
    }))
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/heap/nodes/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCurrentUser.mockResolvedValue({ id: 'u1' })
  })

  it('returns 404 when node not found or wrong user', async () => {
    getDb.mockReturnValue(mockDb([]))
    const res = await PATCH(
      new Request('http://localhost/api/heap/nodes/node-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New' }),
      }),
      { params: Promise.resolve({ id: 'node-1' }) }
    )
    expect(res.status).toBe(404)
  })

  it('updates node fields and returns 200', async () => {
    const node = mockNode({ title: 'New' })
    // select chain (existing check) uses mockDb's where() → Promise
    const db = mockDb([node])
    // update chain needs where() → chain so .returning() can be chained
    const updateChain = {
      set: vi.fn(() => updateChain),
      where: vi.fn(() => updateChain),
      returning: vi.fn(() => Promise.resolve([node])),
    }
    db.update = vi.fn(() => updateChain)
    getDb.mockReturnValue(db)
    const res = await PATCH(
      new Request('http://localhost/api/heap/nodes/node-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New' }),
      }),
      { params: Promise.resolve({ id: 'node-1' }) }
    )
    expect(res.status).toBe(200)
  })

  it('updates node priority and returns 200', async () => {
    const existing = mockNode()
    const updated = mockNode({ priority: 'critical' })
    const db = mockDb([existing])
    const updateChain = {
      set: vi.fn(() => updateChain),
      where: vi.fn(() => updateChain),
      returning: vi.fn(() => Promise.resolve([updated])),
    }
    db.update = vi.fn(() => updateChain)
    getDb.mockReturnValue(db)
    const res = await PATCH(
      new Request('http://localhost/api/heap/nodes/node-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority: 'critical' }),
      }),
      { params: Promise.resolve({ id: 'node-1' }) }
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.priority).toBe('critical')
    expect(updateChain.set).toHaveBeenCalledWith({ priority: 'critical' })
  })

  it('rejects invalid priority with 400', async () => {
    const res = await PATCH(
      new Request('http://localhost/api/heap/nodes/node-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority: 'urgent' }),
      }),
      { params: Promise.resolve({ id: 'node-1' }) }
    )
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/heap/nodes/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCurrentUser.mockResolvedValue({ id: 'u1' })
  })

  it('returns 404 when node not found or wrong user', async () => {
    getDb.mockReturnValue(mockDb([]))
    const res = await DELETE(
      new Request('http://localhost/api/heap/nodes/node-1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'node-1' }) }
    )
    expect(res.status).toBe(404)
  })

  it('deletes node and returns 204', async () => {
    const db = mockDb([mockNode()])
    getDb.mockReturnValue(db)
    const res = await DELETE(
      new Request('http://localhost/api/heap/nodes/node-1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'node-1' }) }
    )
    expect(res.status).toBe(204)
  })
})

describe('PATCH /api/heap/nodes/[id] — shape and dimensions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCurrentUser.mockResolvedValue({ id: 'u1' })
  })

  it('persists a valid shape change and returns updated node', async () => {
    const existing = mockNode()
    const updated = mockNode({ shape: 'circle' })
    const db = mockDb([existing])
    // The PATCH route calls db.update(...).set(...).where(...).returning()
    // mockDb's chain.where() returns a Promise, so we need a separate updateChain
    // where .where() stays chainable so .returning() can be called on it.
    const updateChain = {
      set: vi.fn(() => updateChain),
      where: vi.fn(() => updateChain),
      returning: vi.fn(() => Promise.resolve([updated])),
    }
    db.update = vi.fn(() => updateChain)
    getDb.mockReturnValue(db)
    const req = new Request('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ shape: 'circle' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'node-1' }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.shape).toBe('circle')
  })

  it('returns 400 for an invalid shape value', async () => {
    // Zod validation runs before any DB call — no updateChain needed
    const db = mockDb([mockNode()])
    getDb.mockReturnValue(db)
    const req = new Request('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ shape: 'hexagon' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'node-1' }) })
    expect(res.status).toBe(400)
  })

  it('persists width and height and returns them', async () => {
    const existing = mockNode()
    const updated = mockNode({ width: 120, height: 120 })
    const db = mockDb([existing])
    const updateChain = {
      set: vi.fn(() => updateChain),
      where: vi.fn(() => updateChain),
      returning: vi.fn(() => Promise.resolve([updated])),
    }
    db.update = vi.fn(() => updateChain)
    getDb.mockReturnValue(db)
    const req = new Request('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ width: 120, height: 120 }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'node-1' }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.width).toBe(120)
    expect(body.height).toBe(120)
  })
})

describe('GET /api/heap/nodes with type filter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCurrentUser.mockResolvedValue({ id: 'u1' })
  })

  it('filters nodes by type=project', async () => {
    const mockSelect = {
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockResolvedValue([
        { id: 'p1', userId: 'u1', type: 'project', title: 'My Project', projectId: null, todoCount: 0 },
      ]),
    }
    getDb.mockReturnValue({ select: vi.fn().mockReturnValue(mockSelect) })
    const request = new Request('http://localhost/api/heap/nodes?type=project')
    const response = await GET(request)
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(Array.isArray(data)).toBe(true)
  })

  it('filters nodes by projectId', async () => {
    const mockSelect = {
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockResolvedValue([
        { id: 'n1', userId: 'u1', type: 'note', title: 'Node 1', projectId: 'p1', todoCount: 0 },
      ]),
    }
    getDb.mockReturnValue({ select: vi.fn().mockReturnValue(mockSelect) })
    const request = new Request('http://localhost/api/heap/nodes?projectId=p1')
    const response = await GET(request)
    expect(response.status).toBe(200)
  })

  it('returns 400 for an invalid type value', async () => {
    const request = new Request('http://localhost/api/heap/nodes?type=invalid_type')
    const response = await GET(request)
    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.code).toBe('VALIDATION_ERROR')
  })
})

describe('POST /api/heap/nodes projectId validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCurrentUser.mockResolvedValue({ id: 'u1' })
  })

  it('rejects type=project with projectId (nested project)', async () => {
    // Zod + nesting guard runs before any DB call — no db mock needed
    const request = new Request('http://localhost/api/heap/nodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Nested', type: 'project', projectId: 'p1' }),
    })
    const response = await POST(request)
    expect(response.status).toBe(400)
  })

  it('rejects projectId that does not belong to user', async () => {
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),  // no node found for user
    }
    getDb.mockReturnValue({ select: vi.fn().mockReturnValue(selectChain) })
    const request = new Request('http://localhost/api/heap/nodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New', type: 'note', projectId: 'other-project' }),
    })
    const response = await POST(request)
    expect(response.status).toBe(400)
  })

  it('rejects projectId pointing to a non-project node', async () => {
    // Returns a node that exists but is not type=project
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([mockNode({ id: 'n1', type: 'note' })]),
    }
    getDb.mockReturnValue({ select: vi.fn().mockReturnValue(selectChain) })
    const request = new Request('http://localhost/api/heap/nodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New', type: 'note', projectId: 'n1' }),
    })
    const response = await POST(request)
    expect(response.status).toBe(400)
  })
})

describe('DELETE /api/heap/nodes/[id] project guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCurrentUser.mockResolvedValue({ id: 'u1' })
  })

  it('returns 409 when deleting a project node that has children', async () => {
    const projectNode = { id: 'p1', userId: 'u1', type: 'project', title: 'My Project' }
    const childNode = { id: 'n1', userId: 'u1', type: 'note', projectId: 'p1' }

    // First select() call: fetch existing node — resolves to projectNode array
    // Second select() call: check for children — resolves to chain with .limit()
    let callCount = 0
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) return Promise.resolve([projectNode])
        return { limit: vi.fn().mockResolvedValue([childNode]) }
      }),
    }
    getDb.mockReturnValue({ select: vi.fn().mockReturnValue(selectChain) })

    const context = { params: Promise.resolve({ id: 'p1' }) }
    const response = await DELETE(new Request('http://localhost'), context)
    expect(response.status).toBe(409)
    const data = await response.json()
    expect(data.code).toBe('HAS_CHILDREN')
  })

  it('deletes a project node with no children and returns 204', async () => {
    const projectNode = { id: 'p1', userId: 'u1', type: 'project', title: 'Empty Project' }

    let callCount = 0
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) return Promise.resolve([projectNode])
        // No children found
        return { limit: vi.fn().mockResolvedValue([]) }
      }),
    }
    const deleteChain = {
      where: vi.fn().mockResolvedValue(undefined),
    }
    getDb.mockReturnValue({
      select: vi.fn().mockReturnValue(selectChain),
      delete: vi.fn().mockReturnValue(deleteChain),
    })

    const context = { params: Promise.resolve({ id: 'p1' }) }
    const response = await DELETE(new Request('http://localhost'), context)
    expect(response.status).toBe(204)
  })
})
