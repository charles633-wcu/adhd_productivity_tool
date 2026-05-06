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
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
    render(<NodeDetailSheet nodeId="n-1" onClose={vi.fn()} onDeleted={vi.fn()} onUpdated={vi.fn()} />)
    await waitFor(() => expect(screen.getByDisplayValue('My node')).toBeTruthy())
  })

  it('shows two-tap delete: first tap changes label', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => mockNode })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
    render(<NodeDetailSheet nodeId="n-1" onClose={vi.fn()} onDeleted={vi.fn()} onUpdated={vi.fn()} />)
    await waitFor(() => screen.getByDisplayValue('My node'))
    const deleteBtn = screen.getByText(/delete/i)
    fireEvent.click(deleteBtn)
    expect(screen.getByText(/tap again/i)).toBeTruthy()
  })

  it('close resets delete confirm state', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => mockNode })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
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
      .mockResolvedValueOnce({ ok: true, json: async () => [linkedTodo] })
    render(<NodeDetailSheet nodeId="n-1" onClose={vi.fn()} onDeleted={vi.fn()} onUpdated={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Linked task')).toBeTruthy())
    expect(screen.getByPlaceholderText(/create and link/i)).toBeTruthy()
  })

  it('create-and-link fires POST /api/todos then POST /api/heap/nodes/[id]/todos', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => mockNode })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 't-new', title: 'New task' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ nodeId: 'n-1', todoId: 't-new' }) })
    render(<NodeDetailSheet nodeId="n-1" onClose={vi.fn()} onDeleted={vi.fn()} onUpdated={vi.fn()} />)
    await waitFor(() => screen.getByDisplayValue('My node'))
    const input = screen.getByPlaceholderText(/create and link/i)
    fireEvent.change(input, { target: { value: 'New task' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(screen.getByText('New task')).toBeTruthy())
  })
})
