import { getTableColumns } from 'drizzle-orm'
import { describe, it, expect } from 'vitest'
import { heapNodes, heapEdges, heapNodeTodos } from '@/lib/db/schema'

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
})
