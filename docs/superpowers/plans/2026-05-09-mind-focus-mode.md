# Mind Focus Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add manual node priority, all-shape resizing, size-based visual child slots, and dimmed progressive Focus Mode to the Mind canvas.

**Architecture:** Persist priority and dimensions on `heap_nodes`, keep graph linking unlimited, and implement Focus Mode as a pure derived visual layer in the React Flow client. Use small pure helpers for slot capacity, child selection, and focus visibility so most behavior is covered without browser tests; use Playwright smoke coverage for end-to-end canvas confidence if Playwright is available or can be installed.

**Tech Stack:** Next.js App Router, React 19, React Flow (`@xyflow/react`), Drizzle ORM with SQLite, Vitest + React Testing Library, optional Playwright.

---

## File Structure

- Modify `lib/db/schema.ts`: add `HeapNodePriority` type and `heap_nodes.priority`.
- Create `lib/heap/focus.ts`: pure helpers for child maps, slot capacity, visible child selection, and focus visibility.
- Modify `app/api/heap/nodes/route.ts`: allow priority on create.
- Modify `app/api/heap/nodes/[id]/route.ts`: allow priority on patch; continue accepting dimensions for all shapes.
- Modify `components/heap/HeapNode.tsx`: priority styling, all-shape `NodeResizer`, child preview rendering, focus/dim state classes.
- Modify `components/heap/HeapCanvas.tsx`: compute child previews and focus visibility; add Focus Mode controls; persist all-shape dimensions.
- Modify `components/heap/NodeDetailSheet.tsx`: add priority segmented control and failure-safe PATCH handling.
- Modify existing tests under `tests/api` and `tests/components`.
- Create `tests/lib/heap/focus.test.ts` for pure helper behavior.
- Optionally create `playwright.config.ts` and `tests/e2e/mind-focus.spec.ts` if Playwright is installed or approved for installation.

---

### Task 1: Persist Manual Node Priority

**Files:**
- Modify: `lib/db/schema.ts`
- Modify: `app/api/heap/nodes/route.ts`
- Modify: `app/api/heap/nodes/[id]/route.ts`
- Test: `tests/api/heap-nodes.test.ts`

- [ ] **Step 1: Write the failing schema/API tests**

Add this import shape and tests to `tests/api/heap-nodes.test.ts`:

```ts
it('heap_nodes has priority column', () => {
  const cols = getTableColumns(heapNodes) as Record<string, { name: string }>
  expect(cols.priority.name).toBe('priority')
})

it('creates a node with manual priority', async () => {
  const node = mockNode({ priority: 'high' })
  const db = mockDb([node])
  getDb.mockReturnValue(db)
  const res = await POST(new Request('http://localhost/api/heap/nodes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'High node', priority: 'high' }),
  }))
  expect(res.status).toBe(201)
  expect(db.values).toHaveBeenCalledWith(expect.objectContaining({ priority: 'high' }))
})

it('rejects invalid priority on create', async () => {
  const res = await POST(new Request('http://localhost/api/heap/nodes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'X', priority: 'urgent' }),
  }))
  expect(res.status).toBe(400)
})

it('persists a valid priority change and returns updated node', async () => {
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
  const req = new Request('http://localhost', {
    method: 'PATCH',
    body: JSON.stringify({ priority: 'critical' }),
    headers: { 'Content-Type': 'application/json' },
  })
  const res = await PATCH(req, { params: Promise.resolve({ id: 'node-1' }) })
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.priority).toBe('critical')
  expect(updateChain.set).toHaveBeenCalledWith({ priority: 'critical' })
})

it('returns 400 for an invalid priority value', async () => {
  const db = mockDb([mockNode()])
  getDb.mockReturnValue(db)
  const req = new Request('http://localhost', {
    method: 'PATCH',
    body: JSON.stringify({ priority: 'urgent' }),
    headers: { 'Content-Type': 'application/json' },
  })
  const res = await PATCH(req, { params: Promise.resolve({ id: 'node-1' }) })
  expect(res.status).toBe(400)
})
```

Update `mockNode()` in the same file to include:

```ts
priority: 'normal',
```

- [ ] **Step 2: Run the tests and verify red**

Run:

```bash
cmd /c npx vitest run tests/api/heap-nodes.test.ts
```

Expected: failures mentioning missing `priority` column and validation rejecting unknown field behavior not implemented.

- [ ] **Step 3: Implement the schema and route validation**

In `lib/db/schema.ts`, add:

```ts
export type HeapNodePriority = 'low' | 'normal' | 'high' | 'critical'
```

In `heapNodes`, add after `color`:

```ts
priority: text('priority').$type<HeapNodePriority>().notNull().default('normal'),
```

In `app/api/heap/nodes/route.ts`, add to `CreateNodeSchema`:

```ts
priority: z.enum(['low', 'normal', 'high', 'critical']).default('normal'),
```

In `app/api/heap/nodes/[id]/route.ts`, add to `PatchNodeSchema`:

```ts
priority: z.enum(['low', 'normal', 'high', 'critical']).optional(),
```

- [ ] **Step 4: Run the focused tests and typecheck**

Run:

```bash
cmd /c npx vitest run tests/api/heap-nodes.test.ts
cmd /c npx tsc --noEmit
```

Expected: tests pass; typecheck passes.

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.ts app/api/heap/nodes/route.ts app/api/heap/nodes/[id]/route.ts tests/api/heap-nodes.test.ts
git commit -m "feat: add mind node priority"
```

---

### Task 2: Add Pure Focus and Slot Helpers

**Files:**
- Create: `lib/heap/focus.ts`
- Test: `tests/lib/heap/focus.test.ts`

- [ ] **Step 1: Write the failing helper tests**

Create `tests/lib/heap/focus.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  buildChildMap,
  calculateVisibleChildSlots,
  deriveFocusVisibility,
  pickVisibleChildren,
  type FocusNode,
  type FocusEdge,
} from '@/lib/heap/focus'

const nodes: FocusNode[] = [
  { id: 'a', title: 'Alpha', priority: 'critical', shape: 'rectangle', width: 110, height: 60, updatedAt: new Date('2026-05-09T10:00:00Z') },
  { id: 'b', title: 'Beta', priority: 'high', shape: 'circle', width: 120, height: 120, updatedAt: new Date('2026-05-09T09:00:00Z') },
  { id: 'c', title: 'Gamma', priority: 'normal', shape: 'pill', width: 120, height: 44, updatedAt: new Date('2026-05-09T08:00:00Z') },
  { id: 'd', title: 'Delta', priority: 'low', shape: 'diamond', width: 90, height: 90, updatedAt: new Date('2026-05-09T07:00:00Z') },
  { id: 'e', title: 'Epsilon', priority: 'critical', shape: 'rectangle', width: 180, height: 80, updatedAt: new Date('2026-05-09T06:00:00Z') },
]

const edges: FocusEdge[] = [
  { id: 'ab', source: 'a', target: 'b' },
  { id: 'ac', source: 'a', target: 'c' },
  { id: 'ad', source: 'a', target: 'd' },
  { id: 'be', source: 'b', target: 'e' },
]

describe('mind focus helpers', () => {
  it('builds child lists from directed edges', () => {
    expect(buildChildMap(edges).get('a')).toEqual(['b', 'c', 'd'])
    expect(buildChildMap(edges).get('b')).toEqual(['e'])
  })

  it('calculates visible child slots by shape and size', () => {
    expect(calculateVisibleChildSlots({ shape: 'rectangle', width: 110, height: 60 })).toBe(2)
    expect(calculateVisibleChildSlots({ shape: 'rectangle', width: 250, height: 105 })).toBe(5)
    expect(calculateVisibleChildSlots({ shape: 'pill', width: 300, height: 44 })).toBe(3)
    expect(calculateVisibleChildSlots({ shape: 'circle', width: 160, height: 160 })).toBe(5)
    expect(calculateVisibleChildSlots({ shape: 'diamond', width: 190, height: 190 })).toBe(4)
  })

  it('picks visible children by priority, focus path, recency, then stable title', () => {
    const picked = pickVisibleChildren({
      parentId: 'a',
      nodes,
      childMap: buildChildMap(edges),
      focusPathIds: new Set(['d']),
      slotCount: 2,
    })
    expect(picked.visibleChildIds).toEqual(['b', 'd'])
    expect(picked.overflowCount).toBe(1)
  })

  it('derives bright and dimmed nodes in focus mode', () => {
    const result = deriveFocusVisibility({ nodes, edges, focusPathIds: new Set(['b']) })
    expect(result.brightNodeIds).toEqual(new Set(['a', 'b', 'c', 'd', 'e']))
    expect(result.dimmedNodeIds).toEqual(new Set())
    expect(result.brightEdgeIds).toEqual(new Set(['ab', 'ac', 'ad', 'be']))
  })
})
```

- [ ] **Step 2: Run the tests and verify red**

Run:

```bash
cmd /c npx vitest run tests/lib/heap/focus.test.ts
```

Expected: fail because `lib/heap/focus.ts` does not exist.

- [ ] **Step 3: Implement `lib/heap/focus.ts`**

Create `lib/heap/focus.ts`:

```ts
import type { HeapNodePriority, HeapNodeShape } from '@/lib/db/schema'

export type FocusNode = {
  id: string
  title: string
  priority?: HeapNodePriority | null
  shape?: HeapNodeShape | null
  width?: number | null
  height?: number | null
  updatedAt?: Date | string | number | null
}

export type FocusEdge = {
  id: string
  source: string
  target: string
}

export function buildChildMap(edges: FocusEdge[]): Map<string, string[]> {
  const childMap = new Map<string, string[]>()
  for (const edge of edges) {
    const children = childMap.get(edge.source) ?? []
    children.push(edge.target)
    childMap.set(edge.source, children)
  }
  return childMap
}

export function calculateVisibleChildSlots(node: Pick<FocusNode, 'shape' | 'width' | 'height'>): number {
  const shape = node.shape ?? 'rectangle'
  const width = node.width ?? defaultWidth(shape)
  const height = node.height ?? defaultHeight(shape)

  if (shape === 'pill') return clamp(1 + Math.floor(Math.max(0, width - 120) / 90), 1, 4)
  if (shape === 'circle') {
    const diameter = Math.max(width, height)
    return clamp(3 + Math.floor(Math.max(0, diameter - 80) / 40), 3, 10)
  }
  if (shape === 'diamond') {
    const size = Math.max(width, height)
    return clamp(2 + Math.floor(Math.max(0, size - 90) / 50), 2, 6)
  }

  const widthSlots = Math.floor(Math.max(0, width - 110) / 70)
  const heightSlots = Math.floor(Math.max(0, height - 60) / 45)
  return clamp(2 + widthSlots + heightSlots, 2, 8)
}

export function pickVisibleChildren({
  parentId,
  nodes,
  childMap,
  focusPathIds,
  slotCount,
}: {
  parentId: string
  nodes: FocusNode[]
  childMap: Map<string, string[]>
  focusPathIds: Set<string>
  slotCount: number
}): { visibleChildIds: string[]; overflowCount: number } {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const childIds = childMap.get(parentId) ?? []
  const sorted = [...childIds].sort((a, b) => compareChildren(byId.get(a), byId.get(b), focusPathIds))
  const visibleChildIds = sorted.slice(0, slotCount)
  return { visibleChildIds, overflowCount: Math.max(0, sorted.length - visibleChildIds.length) }
}

export function deriveFocusVisibility({
  nodes,
  edges,
  focusPathIds,
}: {
  nodes: FocusNode[]
  edges: FocusEdge[]
  focusPathIds: Set<string>
}): {
  brightNodeIds: Set<string>
  dimmedNodeIds: Set<string>
  brightEdgeIds: Set<string>
  dimmedEdgeIds: Set<string>
  visibleChildrenByNodeId: Map<string, { visibleChildIds: string[]; overflowCount: number }>
} {
  const childMap = buildChildMap(edges)
  const brightNodeIds = new Set<string>()
  const visibleChildrenByNodeId = new Map<string, { visibleChildIds: string[]; overflowCount: number }>()
  const roots = nodes.filter((node) => node.priority === 'high' || node.priority === 'critical')

  for (const node of [...roots, ...nodes.filter((node) => focusPathIds.has(node.id))]) {
    brightNodeIds.add(node.id)
    const picked = pickVisibleChildren({
      parentId: node.id,
      nodes,
      childMap,
      focusPathIds,
      slotCount: calculateVisibleChildSlots(node),
    })
    visibleChildrenByNodeId.set(node.id, picked)
    for (const childId of picked.visibleChildIds) brightNodeIds.add(childId)
  }

  const allNodeIds = new Set(nodes.map((node) => node.id))
  const dimmedNodeIds = new Set([...allNodeIds].filter((id) => !brightNodeIds.has(id)))
  const brightEdgeIds = new Set(edges.filter((edge) => brightNodeIds.has(edge.source) && brightNodeIds.has(edge.target)).map((edge) => edge.id))
  const dimmedEdgeIds = new Set(edges.filter((edge) => !brightEdgeIds.has(edge.id)).map((edge) => edge.id))

  return { brightNodeIds, dimmedNodeIds, brightEdgeIds, dimmedEdgeIds, visibleChildrenByNodeId }
}

function compareChildren(a: FocusNode | undefined, b: FocusNode | undefined, focusPathIds: Set<string>): number {
  return priorityRank(b) - priorityRank(a)
    || Number(focusPathIds.has(b?.id ?? '')) - Number(focusPathIds.has(a?.id ?? ''))
    || timestamp(b) - timestamp(a)
    || (a?.title ?? '').localeCompare(b?.title ?? '')
    || (a?.id ?? '').localeCompare(b?.id ?? '')
}

function priorityRank(node: FocusNode | undefined): number {
  if (node?.priority === 'critical') return 3
  if (node?.priority === 'high') return 2
  if (node?.priority === 'normal') return 1
  return 0
}

function timestamp(node: FocusNode | undefined): number {
  if (node?.updatedAt == null) return 0
  return new Date(node.updatedAt).getTime()
}

function defaultWidth(shape: HeapNodeShape): number {
  if (shape === 'pill') return 120
  if (shape === 'circle') return 80
  if (shape === 'diamond') return 90
  return 110
}

function defaultHeight(shape: HeapNodeShape): number {
  if (shape === 'pill') return 44
  if (shape === 'circle') return 80
  if (shape === 'diamond') return 90
  return 60
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
```

- [ ] **Step 4: Run the helper tests**

Run:

```bash
cmd /c npx vitest run tests/lib/heap/focus.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add lib/heap/focus.ts tests/lib/heap/focus.test.ts
git commit -m "feat: add mind focus helpers"
```

---

### Task 3: Render Priority, Child Previews, and All-Shape Resizers

**Files:**
- Modify: `components/heap/HeapNode.tsx`
- Test: `tests/components/HeapNode.test.tsx`

- [ ] **Step 1: Write failing component tests**

Add tests to `tests/components/HeapNode.test.tsx`:

```ts
it('renders priority styling for high and critical nodes', () => {
  const high = render(<HeapNode {...makeProps({ data: { title: 'High', type: 'brain_dump', color: null, todoCount: 0, priority: 'high' } })} />)
  expect(high.container.firstChild).toHaveClass('shadow-primary/20')
  high.unmount()

  const critical = render(<HeapNode {...makeProps({ data: { title: 'Critical', type: 'brain_dump', color: null, todoCount: 0, priority: 'critical' } })} />)
  expect(critical.container.firstChild).toHaveClass('ring-destructive/40')
})

it('renders NodeResizer for rectangle, pill, circle, and diamond', () => {
  for (const shape of ['rectangle', 'pill', 'circle', 'diamond'] as const) {
    NodeResizerMock.mockClear()
    render(<HeapNode {...makeProps({ data: { title: shape, type: 'brain_dump', color: null, todoCount: 0, shape }, selected: true })} />)
    expect(NodeResizerMock).toHaveBeenCalledWith(
      expect.objectContaining({ isVisible: true }),
      expect.toSatisfy((v: unknown) => v === undefined || v != null),
    )
  }
})

it('renders focus child previews and overflow count', () => {
  render(<HeapNode {...makeProps({
    data: {
      title: 'Parent',
      type: 'brain_dump',
      color: null,
      todoCount: 0,
      focusMode: true,
      visibleChildren: [
        { id: 'c1', title: 'First child' },
        { id: 'c2', title: 'Second child' },
      ],
      overflowChildCount: 3,
      onPreviewClick: vi.fn(),
    },
  })} />)
  expect(screen.getByRole('button', { name: /focus first child/i })).toBeTruthy()
  expect(screen.getByRole('button', { name: /focus second child/i })).toBeTruthy()
  expect(screen.getByText('+3')).toBeTruthy()
})

it('does not render child previews outside focus mode', () => {
  render(<HeapNode {...makeProps({
    data: {
      title: 'Parent',
      type: 'brain_dump',
      color: null,
      todoCount: 0,
      focusMode: false,
      visibleChildren: [{ id: 'c1', title: 'First child' }],
      overflowChildCount: 1,
      onPreviewClick: vi.fn(),
    },
  })} />)
  expect(screen.queryByRole('button', { name: /focus first child/i })).toBeNull()
  expect(screen.queryByText('+1')).toBeNull()
})
```

Update older tests named `NodeResizer absent...` to expect a resizer call for all shapes when selected, because the feature makes every shape resizable.

- [ ] **Step 2: Run tests and verify red**

Run:

```bash
cmd /c npx vitest run tests/components/HeapNode.test.tsx
```

Expected: fail because priority fields and child preview props do not exist, and non-circle shapes do not render `NodeResizer`.

- [ ] **Step 3: Update `HeapNodeData` and rendering**

In `components/heap/HeapNode.tsx`, extend `HeapNodeData`:

```ts
priority?: HeapNodePriority
focusMode?: boolean
dimmed?: boolean
visibleChildren?: Array<{ id: string; title: string }>
overflowChildCount?: number
onPreviewClick?: (nodeId: string) => void
```

Import `HeapNodePriority`:

```ts
import type { HeapNodePriority, HeapNodeShape, HeapNodeType } from '@/lib/db/schema'
```

Add helper functions near constants:

```ts
function priorityClass(priority: HeapNodePriority | undefined): string {
  if (priority === 'critical') return ' shadow-[0_0_24px_rgba(239,68,68,0.28)] ring-1 ring-destructive/40'
  if (priority === 'high') return ' shadow-primary/20 ring-1 ring-primary/30'
  if (priority === 'low') return ' opacity-85'
  return ''
}

function PreviewSlots({ data }: { data: HeapNodeData }) {
  if (!data.focusMode || !data.visibleChildren?.length && !data.overflowChildCount) return null
  return (
    <div className="pointer-events-auto absolute left-1/2 top-full z-10 mt-1 flex -translate-x-1/2 items-center gap-1">
      {data.visibleChildren?.map((child) => (
        <button
          key={child.id}
          type="button"
          aria-label={`Focus ${child.title}`}
          onClick={(event) => {
            event.stopPropagation()
            data.onPreviewClick?.(child.id)
          }}
          className="max-w-20 truncate rounded-full border border-border bg-popover px-2 py-0.5 text-[10px] text-popover-foreground shadow"
        >
          {child.title}
        </button>
      ))}
      {(data.overflowChildCount ?? 0) > 0 && (
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">+{data.overflowChildCount}</span>
      )}
    </div>
  )
}
```

For each shape root, include:

```tsx
<NodeResizer isVisible={selected} minWidth={60} minHeight={40} keepAspectRatio={shape === 'circle' || shape === 'diamond'} />
```

Use `priorityClass(d.priority)` and `d.dimmed ? ' opacity-25' : ''` in the root class strings, and add `relative` where needed so previews can position around the shape. Add `<PreviewSlots data={d} />` inside each root wrapper.

- [ ] **Step 4: Run tests**

Run:

```bash
cmd /c npx vitest run tests/components/HeapNode.test.tsx
cmd /c npx tsc --noEmit
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add components/heap/HeapNode.tsx tests/components/HeapNode.test.tsx
git commit -m "feat: render mind priority previews"
```

---

### Task 4: Add Priority Control to Node Detail Sheet

**Files:**
- Modify: `components/heap/NodeDetailSheet.tsx`
- Test: `tests/components/NodeDetailSheet.test.tsx`

- [ ] **Step 1: Write failing tests**

Add tests to `tests/components/NodeDetailSheet.test.tsx`:

```ts
describe('NodeDetailSheet - priority picker', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders priority buttons and marks current priority active', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...mockNode, priority: 'high' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
    render(<NodeDetailSheet nodeId="n-1" onClose={vi.fn()} onDeleted={vi.fn()} onUpdated={vi.fn()} />)
    await waitFor(() => screen.getByDisplayValue('My node'))
    expect(screen.getByRole('button', { name: /high priority/i }).className).toContain('ring-2')
  })

  it('clicking priority patches and calls onUpdated after success', async () => {
    const onUpdated = vi.fn()
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...mockNode, priority: 'normal' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...mockNode, priority: 'critical' }) })
    render(<NodeDetailSheet nodeId="n-1" onClose={vi.fn()} onDeleted={vi.fn()} onUpdated={onUpdated} />)
    await waitFor(() => screen.getByDisplayValue('My node'))
    fireEvent.click(screen.getByRole('button', { name: /critical priority/i }))
    await waitFor(() => {
      const patchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find((c: unknown[]) => (c[1] as RequestInit)?.method === 'PATCH')
      expect(JSON.parse((patchCall![1] as RequestInit).body as string)).toEqual({ priority: 'critical' })
    })
    expect(onUpdated).toHaveBeenCalledWith('n-1', expect.objectContaining({ priority: 'critical' }))
  })

  it('does not update priority locally when PATCH fails', async () => {
    const onUpdated = vi.fn()
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...mockNode, priority: 'normal' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'failed' }) })
    render(<NodeDetailSheet nodeId="n-1" onClose={vi.fn()} onDeleted={vi.fn()} onUpdated={onUpdated} />)
    await waitFor(() => screen.getByDisplayValue('My node'))
    fireEvent.click(screen.getByRole('button', { name: /critical priority/i }))
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
      expect(calls.some((c: unknown[]) => (c[1] as RequestInit)?.method === 'PATCH')).toBe(true)
    })
    expect(onUpdated).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /normal priority/i }).className).toContain('ring-2')
  })
})
```

- [ ] **Step 2: Run tests and verify red**

Run:

```bash
cmd /c npx vitest run tests/components/NodeDetailSheet.test.tsx
```

Expected: fail because priority controls do not exist.

- [ ] **Step 3: Implement priority controls**

In `components/heap/NodeDetailSheet.tsx`, import priority type:

```ts
import type { HeapNode, HeapNodePriority, HeapNodeShape, HeapNodeType } from '@/lib/db/schema'
```

Add constants:

```ts
const PRIORITY_OPTIONS: { value: HeapNodePriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
]
```

Add handler:

```ts
async function handlePriorityChange(priority: HeapNodePriority) {
  const updated = await patch({ priority })
  if (!updated) {
    toast.error('Failed to save priority')
    return
  }
  setNode((current) => current ? { ...current, priority } : current)
  onUpdated(currentNodeId, { priority })
}
```

Add section after Type:

```tsx
<div>
  <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Priority</p>
  <div className="grid grid-cols-2 gap-2">
    {PRIORITY_OPTIONS.map((option) => {
      const isActive = (node.priority ?? 'normal') === option.value
      return (
        <button
          type="button"
          key={option.value}
          onClick={() => handlePriorityChange(option.value)}
          aria-label={`${option.label} priority`}
          aria-pressed={isActive}
          className={cn(
            'text-xs px-2 py-1.5 rounded border transition-colors',
            isActive
              ? 'ring-2 ring-primary border-primary bg-primary/10 text-primary'
              : 'border-border text-muted-foreground hover:border-muted-foreground',
          )}
        >
          {option.label}
        </button>
      )
    })}
  </div>
</div>
```

- [ ] **Step 4: Run tests**

Run:

```bash
cmd /c npx vitest run tests/components/NodeDetailSheet.test.tsx
cmd /c npx tsc --noEmit
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add components/heap/NodeDetailSheet.tsx tests/components/NodeDetailSheet.test.tsx
git commit -m "feat: add mind priority control"
```

---

### Task 5: Wire Focus Mode into Heap Canvas

**Files:**
- Modify: `components/heap/HeapCanvas.tsx`
- Test: `tests/components/HeapCanvas.test.tsx`

- [ ] **Step 1: Write failing canvas tests**

Update the `@xyflow/react` mock in `tests/components/HeapCanvas.test.tsx` so `ReactFlow` exposes nodes and edges:

```ts
ReactFlow: ({ children, nodes, edges }: { children: React.ReactNode; nodes: unknown[]; edges: unknown[] }) => (
  <div data-testid="react-flow-mock" data-nodes={JSON.stringify(nodes)} data-edges={JSON.stringify(edges)}>
    {children}
  </div>
),
```

Add tests:

```ts
it('toggles focus mode and dims unrelated nodes', async () => {
  ;(global.fetch as ReturnType<typeof vi.fn>)
    .mockResolvedValueOnce({ ok: true, json: async () => [
      { id: 'a', userId: 'u1', title: 'Alpha', type: 'brain_dump', color: null, priority: 'high', shape: 'rectangle', width: 250, height: 105, posX: 0, posY: 0, body: null, createdAt: new Date(), updatedAt: new Date() },
      { id: 'b', userId: 'u1', title: 'Beta', type: 'brain_dump', color: null, priority: 'normal', shape: 'rectangle', width: null, height: null, posX: 200, posY: 0, body: null, createdAt: new Date(), updatedAt: new Date() },
      { id: 'c', userId: 'u1', title: 'Gamma', type: 'brain_dump', color: null, priority: 'normal', shape: 'rectangle', width: null, height: null, posX: 400, posY: 0, body: null, createdAt: new Date(), updatedAt: new Date() },
    ] })
    .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 'ab', source: 'a', target: 'b' }] })
  render(<HeapCanvas />)
  await waitFor(() => screen.getByRole('button', { name: /focus mode/i }))
  fireEvent.click(screen.getByRole('button', { name: /focus mode/i }))
  const flow = screen.getByTestId('react-flow-mock')
  await waitFor(() => {
    const parsedNodes = JSON.parse(flow.getAttribute('data-nodes') ?? '[]') as Array<{ id: string; data: { dimmed?: boolean; focusMode?: boolean } }>
    expect(parsedNodes.find((node) => node.id === 'a')?.data.focusMode).toBe(true)
    expect(parsedNodes.find((node) => node.id === 'c')?.data.dimmed).toBe(true)
  })
  expect(screen.getByText(/focused: 2 \/ 3/i)).toBeTruthy()
})

it('shows empty focus guidance when no high priority nodes exist', async () => {
  ;(global.fetch as ReturnType<typeof vi.fn>)
    .mockResolvedValueOnce({ ok: true, json: async () => [
      { id: 'a', userId: 'u1', title: 'Alpha', type: 'brain_dump', color: null, priority: 'normal', shape: 'rectangle', width: null, height: null, posX: 0, posY: 0, body: null, createdAt: new Date(), updatedAt: new Date() },
    ] })
    .mockResolvedValueOnce({ ok: true, json: async () => [] })
  render(<HeapCanvas />)
  await waitFor(() => screen.getByRole('button', { name: /focus mode/i }))
  fireEvent.click(screen.getByRole('button', { name: /focus mode/i }))
  expect(screen.getByText(/mark nodes high priority/i)).toBeTruthy()
})
```

- [ ] **Step 2: Run tests and verify red**

Run:

```bash
cmd /c npx vitest run tests/components/HeapCanvas.test.tsx
```

Expected: fail because Focus Mode controls and derived data do not exist.

- [ ] **Step 3: Implement canvas focus state**

In `components/heap/HeapCanvas.tsx`, import helpers:

```ts
import { deriveFocusVisibility, type FocusEdge, type FocusNode } from '@/lib/heap/focus'
```

Extend `toFlowNode` to include priority:

```ts
priority: node.priority ?? 'normal',
```

Add state:

```ts
const [focusMode, setFocusMode] = useState(false)
const [focusPathIds, setFocusPathIds] = useState<Set<string>>(new Set())
```

Before render, derive focused nodes:

```ts
const focusVisibility = focusMode
  ? deriveFocusVisibility({
      nodes: nodes.map((node) => ({
        id: node.id,
        title: String((node.data as HeapNodeData).title),
        priority: (node.data as HeapNodeData).priority,
        shape: (node.data as HeapNodeData).shape,
        width: (node.data as HeapNodeData).width,
        height: (node.data as HeapNodeData).height,
      })) satisfies FocusNode[],
      edges: edges.map((edge) => ({ id: edge.id, source: String(edge.source), target: String(edge.target) })) satisfies FocusEdge[],
      focusPathIds,
    })
  : null

const renderedNodes = focusVisibility
  ? nodes.map((node) => {
      const picked = focusVisibility.visibleChildrenByNodeId.get(node.id)
      const childTitles = new Map(nodes.map((child) => [child.id, String((child.data as HeapNodeData).title)]))
      return {
        ...node,
        data: {
          ...node.data,
          focusMode,
          dimmed: focusVisibility.dimmedNodeIds.has(node.id),
          visibleChildren: picked?.visibleChildIds.map((id) => ({ id, title: childTitles.get(id) ?? 'Untitled' })) ?? [],
          overflowChildCount: picked?.overflowCount ?? 0,
          onPreviewClick: (nodeId: string) => setFocusPathIds((current) => new Set([...current, nodeId])),
        },
      }
    })
  : nodes

const renderedEdges = focusVisibility
  ? edges.map((edge) => ({
      ...edge,
      animated: focusVisibility.brightEdgeIds.has(edge.id),
      style: { ...(edge.style ?? {}), opacity: focusVisibility.dimmedEdgeIds.has(edge.id) ? 0.18 : 1 },
    }))
  : edges
```

Pass `renderedNodes` and `renderedEdges` to `ReactFlow`.

Add controls before `<ReactFlow>`:

```tsx
<div className="absolute right-6 top-6 z-30 flex items-center gap-2 rounded-full border border-border bg-card/90 px-3 py-2 shadow-lg backdrop-blur">
  <button
    type="button"
    aria-pressed={focusMode}
    aria-label="Focus Mode"
    onClick={() => setFocusMode((current) => !current)}
    className={focusMode ? 'text-primary text-sm font-semibold' : 'text-muted-foreground text-sm font-semibold'}
  >
    Focus Mode
  </button>
  {focusMode && focusVisibility && (
    <span className="text-xs text-muted-foreground">Focused: {focusVisibility.brightNodeIds.size} / {nodes.length}</span>
  )}
  {focusMode && focusPathIds.size > 0 && (
    <button type="button" onClick={() => setFocusPathIds(new Set())} className="text-xs text-muted-foreground hover:text-foreground">
      Reset Focus
    </button>
  )}
</div>
{focusMode && focusVisibility?.brightNodeIds.size === 0 && (
  <div className="absolute right-6 top-20 z-30 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground shadow">
    Mark nodes high priority to start Focus Mode.
  </div>
)}
```

In `handleNodeUpdated`, merge `priority` and dimensions naturally through `Partial<HeapNodeData>`.

- [ ] **Step 4: Run tests**

Run:

```bash
cmd /c npx vitest run tests/components/HeapCanvas.test.tsx tests/lib/heap/focus.test.ts tests/components/HeapNode.test.tsx
cmd /c npx tsc --noEmit
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add components/heap/HeapCanvas.tsx tests/components/HeapCanvas.test.tsx
git commit -m "feat: add mind focus mode"
```

---

### Task 6: Add or Run Browser Smoke Coverage

**Files:**
- Create or modify: `playwright.config.ts`
- Create: `tests/e2e/mind-focus.spec.ts`
- Modify: `package.json` if Playwright is installed.

- [ ] **Step 1: Check whether Playwright is installed**

Run:

```bash
cmd /c npm ls @playwright/test
```

Expected if missing: npm reports `(empty)` or exits non-zero.

- [ ] **Step 2: If missing, request approval and install Playwright**

Run only with approval if missing:

```bash
cmd /c npm install -D @playwright/test
cmd /c npx playwright install chromium
```

Expected: package installs and Chromium browser installs.

- [ ] **Step 3: Add Playwright config if absent**

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  use: {
    baseURL: 'http://127.0.0.1:3020',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'cmd /c npm run dev -- --hostname 127.0.0.1 --port 3020',
    url: 'http://127.0.0.1:3020',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})
```

If `package.json` has no script, add:

```json
"test:e2e": "playwright test"
```

- [ ] **Step 4: Add a smoke test**

Create `tests/e2e/mind-focus.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test('Mind Focus Mode can be enabled and shows controls', async ({ page }) => {
  await page.goto('/heap')
  await expect(page.getByTestId('heap-canvas-container')).toBeVisible()
  await page.getByRole('button', { name: /focus mode/i }).click()
  await expect(page.getByText(/focused:/i).or(page.getByText(/mark nodes high priority/i))).toBeVisible()
})
```

This smoke test is intentionally minimal because seeding authenticated state and drag-resize interactions may require project-specific fixtures. The detailed behavior is covered by Vitest helper and component tests.

- [ ] **Step 5: Run browser smoke test**

Run:

```bash
cmd /c npx playwright test tests/e2e/mind-focus.spec.ts
```

Expected: pass. If auth/local seed blocks `/heap`, document the blocker in the final implementation notes and rely on the full Vitest coverage until an e2e auth fixture exists.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json playwright.config.ts tests/e2e/mind-focus.spec.ts
git commit -m "test: add mind focus browser smoke"
```

---

### Task 7: Final Verification and Graph Update

**Files:**
- Modify only if verification reveals a bug.

- [ ] **Step 1: Run focused tests**

```bash
cmd /c npx vitest run tests/api/heap-nodes.test.ts tests/lib/heap/focus.test.ts tests/components/HeapNode.test.tsx tests/components/HeapCanvas.test.tsx tests/components/NodeDetailSheet.test.tsx
```

Expected: all pass.

- [ ] **Step 2: Run full unit suite**

```bash
cmd /c npm test
```

Expected: all tests pass.

- [ ] **Step 3: Run typecheck**

```bash
cmd /c npx tsc --noEmit
```

Expected: no TypeScript errors.

- [ ] **Step 4: Run production build**

```bash
cmd /c npm run build
```

Expected: Next.js production build passes.

- [ ] **Step 5: Run graph update**

```bash
graphify update .
```

Expected: graph updates successfully.

- [ ] **Step 6: Update memory**

Update `context/lessons_learned.md`, `context/project_state.md`, `context/project_tree.md`, `context/MEMORY.md`, and create dated decision/interview files for Mind Focus Mode. Record:

- Priority is manual visual metadata.
- Real links are unlimited; visual child slots are derived from size.
- Focus Mode dims unrelated context instead of hiding it.
- Browser smoke status and any auth fixture gaps.

- [ ] **Step 7: Commit verification/memory updates**

```bash
git add context/lessons_learned.md context/project_state.md context/project_tree.md context/MEMORY.md context/docs/superpowers/decision_logs context/interview_questions graphify-out
git commit -m "docs: record mind focus mode implementation"
```

---

## Self-Review Notes

- Spec coverage: priority, all-shape resizing, visual child slots, child preview rendering, dimmed Focus Mode, reset focus, API/schema changes, helper tests, component tests, and Playwright smoke coverage are all mapped to tasks.
- Scope: automatic priority, force layout, and hard child caps remain excluded as non-goals.
- Type consistency: `HeapNodePriority`, `HeapNodeData.priority`, `focusMode`, `dimmed`, `visibleChildren`, and `overflowChildCount` are introduced before later tasks consume them.
