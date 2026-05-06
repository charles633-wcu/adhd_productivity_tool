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
    render(<HeapTodoOverlay selectedNodeId={null} onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: /tasks/i })).toBeTruthy()
  })

  it('expands to half-open on pill click', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => mockTodos })
    render(<HeapTodoOverlay selectedNodeId={null} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /tasks/i }))
    await waitFor(() => expect(screen.getByText('Fix bug')).toBeTruthy())
  })

  it('shows node-filtered tasks when selectedNodeId is set', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => mockTodos })
    render(<HeapTodoOverlay selectedNodeId="n-1" onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Fix bug')).toBeTruthy())
  })
})
