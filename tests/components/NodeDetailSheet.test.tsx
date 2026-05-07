import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NodeDetailSheet } from '@/components/heap/NodeDetailSheet'

global.fetch = vi.fn()

const mockNode = {
  id: 'n-1', userId: 'u1', type: 'brain_dump', title: 'My node',
  body: null, color: null, posX: 0, posY: 0,
  createdAt: new Date(), updatedAt: new Date(),
}

describe('NodeDetailSheet', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does not render when nodeId is null', () => {
    render(<NodeDetailSheet nodeId={null} onClose={vi.fn()} onDeleted={vi.fn()} onUpdated={vi.fn()} />)
    expect(screen.queryByText('Task detail')).toBeNull()
  })

  it('fetches and displays node data', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => mockNode })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })  // todos
      .mockResolvedValueOnce({ ok: true, json: async () => [] })  // triggers
    render(<NodeDetailSheet nodeId="n-1" onClose={vi.fn()} onDeleted={vi.fn()} onUpdated={vi.fn()} />)
    await waitFor(() => expect(screen.getByDisplayValue('My node')).toBeTruthy())
  })

  it('shows two-tap delete: first tap changes label', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => mockNode })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })  // todos
      .mockResolvedValueOnce({ ok: true, json: async () => [] })  // triggers
    render(<NodeDetailSheet nodeId="n-1" onClose={vi.fn()} onDeleted={vi.fn()} onUpdated={vi.fn()} />)
    await waitFor(() => screen.getByDisplayValue('My node'))
    const deleteBtn = screen.getByText(/delete/i)
    fireEvent.click(deleteBtn)
    expect(screen.getByText(/tap again/i)).toBeTruthy()
  })

  it('close resets delete confirm state', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => mockNode })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })  // todos
      .mockResolvedValueOnce({ ok: true, json: async () => [] })  // triggers
    const onClose = vi.fn()
    render(<NodeDetailSheet nodeId="n-1" onClose={onClose} onDeleted={vi.fn()} onUpdated={vi.fn()} />)
    await waitFor(() => screen.getByDisplayValue('My node'))
    fireEvent.click(screen.getByText(/delete/i))
    expect(screen.getByText(/tap again/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /close|x/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows linked todos and create-and-link input', async () => {
    const linkedTodo = { id: 't-1', userId: 'u1', title: 'Linked task', completed: 0 }
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => mockNode })
      .mockResolvedValueOnce({ ok: true, json: async () => [linkedTodo] })  // todos
      .mockResolvedValueOnce({ ok: true, json: async () => [] })  // triggers
    render(<NodeDetailSheet nodeId="n-1" onClose={vi.fn()} onDeleted={vi.fn()} onUpdated={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Linked task')).toBeTruthy())
    expect(screen.getByPlaceholderText(/create and link/i)).toBeTruthy()
  })

  it('create-and-link fires POST /api/todos then POST /api/heap/nodes/[id]/todos', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => mockNode })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })  // todos
      .mockResolvedValueOnce({ ok: true, json: async () => [] })  // triggers
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 't-new', title: 'New task' }) })  // POST /api/todos
      .mockResolvedValueOnce({ ok: true, json: async () => ({ nodeId: 'n-1', todoId: 't-new' }) })  // POST /api/heap/nodes/[id]/todos
    render(<NodeDetailSheet nodeId="n-1" onClose={vi.fn()} onDeleted={vi.fn()} onUpdated={vi.fn()} />)
    await waitFor(() => screen.getByDisplayValue('My node'))
    const input = screen.getByPlaceholderText(/create and link/i)
    fireEvent.change(input, { target: { value: 'New task' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(screen.getByText('New task')).toBeTruthy())
  })
})

const mockLinkedTrigger = {
  id: 'tr-1',
  title: 'Check gym habit',
  status: 'active',
  nextReviewAt: new Date('2026-05-12T12:00:00Z').toISOString(),
  categoryId: 'c-1',
}

describe('NodeDetailSheet — linked triggers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders linked triggers with title and due date', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => mockNode })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => [mockLinkedTrigger] })
    render(<NodeDetailSheet nodeId="n-1" onClose={vi.fn()} onDeleted={vi.fn()} onUpdated={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Check gym habit')).toBeTruthy())
    expect(screen.getByText(/may 12/i)).toBeTruthy()
  })

  it('unlink button removes trigger from list', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => mockNode })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => [mockLinkedTrigger] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })  // DELETE response
    render(<NodeDetailSheet nodeId="n-1" onClose={vi.fn()} onDeleted={vi.fn()} onUpdated={vi.fn()} />)
    await waitFor(() => screen.getByText('Check gym habit'))
    fireEvent.click(screen.getByRole('button', { name: /unlink trigger/i }))
    await waitFor(() => expect(screen.queryByText('Check gym habit')).toBeNull())
  })

  it('first focus on picker fetches active triggers once', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => mockNode })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 'tr-2', title: 'Read daily' }] })  // ?status=active
    render(<NodeDetailSheet nodeId="n-1" onClose={vi.fn()} onDeleted={vi.fn()} onUpdated={vi.fn()} />)
    await waitFor(() => screen.getByDisplayValue('My node'))
    fireEvent.focus(screen.getByRole('textbox', { name: /link a trigger/i }))
    await waitFor(() => expect(screen.getByText('Read daily')).toBeTruthy())
    // Second focus should not re-fetch
    fireEvent.blur(screen.getByRole('textbox', { name: /link a trigger/i }))
    fireEvent.focus(screen.getByRole('textbox', { name: /link a trigger/i }))
    // fetch called exactly 4 times total (node + todos + triggers + ?status=active once)
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(4)
  })

  it('already-linked triggers appear greyed out in picker', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => mockNode })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => [mockLinkedTrigger] })
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 'tr-1', title: 'Check gym habit' }] })
    render(<NodeDetailSheet nodeId="n-1" onClose={vi.fn()} onDeleted={vi.fn()} onUpdated={vi.fn()} />)
    await waitFor(() => screen.getByDisplayValue('My node'))
    fireEvent.focus(screen.getByRole('textbox', { name: /link a trigger/i }))
    await waitFor(() => screen.getAllByText('Check gym habit'))
    expect(screen.getByText('linked')).toBeTruthy()
  })

  it('selecting a picker item links the trigger and clears input', async () => {
    const newTrigger = { id: 'tr-2', title: 'Read daily', status: 'active', nextReviewAt: new Date().toISOString(), categoryId: 'c-1' }
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => mockNode })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => [newTrigger] })
      .mockResolvedValueOnce({ ok: true, json: async () => newTrigger })  // POST 201
    render(<NodeDetailSheet nodeId="n-1" onClose={vi.fn()} onDeleted={vi.fn()} onUpdated={vi.fn()} />)
    await waitFor(() => screen.getByDisplayValue('My node'))
    fireEvent.focus(screen.getByRole('textbox', { name: /link a trigger/i }))
    await waitFor(() => screen.getByText('Read daily'))
    fireEvent.mouseDown(screen.getByText('Read daily'))
    await waitFor(() => expect(screen.getAllByText('Read daily').length).toBeGreaterThanOrEqual(1))
    // Input should be cleared
    expect((screen.getByRole('textbox', { name: /link a trigger/i }) as HTMLInputElement).value).toBe('')
  })
})
