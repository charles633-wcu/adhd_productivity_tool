import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HeapTodoOverlay } from '@/components/heap/HeapTodoOverlay'

global.fetch = vi.fn()

const mockTodos = [
  { id: 't-1', title: 'Fix bug', priority: 'high', dueDate: null, completed: 0, subtasks: [] },
]

describe('HeapTodoOverlay', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders minimized pill by default', () => {
    render(<HeapTodoOverlay selectedNodeId={null} selectedNodeTitle={null} onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: /tasks/i })).toBeTruthy()
  })

  it('expands to half-open on pill click', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => mockTodos })
    render(<HeapTodoOverlay selectedNodeId={null} selectedNodeTitle={null} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /tasks/i }))
    await waitFor(() => expect(screen.getByText('Fix bug')).toBeTruthy())
  })

  it('shows node-filtered tasks and node title when selectedNodeId is set', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => mockTodos })
    render(<HeapTodoOverlay selectedNodeId="n-1" selectedNodeTitle="Side project" onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Fix bug')).toBeTruthy())
    expect(screen.getByText('Side project')).toBeTruthy()
  })

  it('does not show a quick-added node task when node linking fails', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => [] })  // node todos
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 't-new', title: 'New task', completed: 0, subtasks: [] }) })  // POST /api/todos
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'failed' }) })  // node link
    render(<HeapTodoOverlay selectedNodeId="n-1" selectedNodeTitle="Side project" onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Side project')).toBeTruthy())
    const input = screen.getByPlaceholderText(/add task/i)
    fireEvent.change(input, { target: { value: 'New task' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
      expect(calls.filter((c: unknown[]) => (c[1] as RequestInit)?.method === 'POST')).toHaveLength(2)
    })
    expect(screen.queryByText('New task')).toBeNull()
    expect((input as HTMLInputElement).value).toBe('New task')
  })

  it('keeps a todo visible when completing it fails', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => mockTodos })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'failed' }) })  // PATCH
    render(<HeapTodoOverlay selectedNodeId={null} selectedNodeTitle={null} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /tasks/i }))
    await waitFor(() => screen.getByText('Fix bug'))
    fireEvent.click(screen.getByRole('checkbox'))
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
      expect(calls.some((c: unknown[]) => (c[1] as RequestInit)?.method === 'PATCH')).toBe(true)
    })
    expect(screen.getByText('Fix bug')).toBeTruthy()
  })
})
