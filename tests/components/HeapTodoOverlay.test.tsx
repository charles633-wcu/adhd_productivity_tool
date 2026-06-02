import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HeapTodoOverlay } from '@/components/heap/HeapTodoOverlay'

global.fetch = vi.fn()

const linkedTodos = [
  { id: 't-1', title: 'Fix bug', priority: 'high', dueDate: null, completed: 0 },
]

const allTodos = [
  { id: 't-1', title: 'Fix bug', priority: 'high', dueDate: null, completed: 0 },
  { id: 't-2', title: 'Write tests', priority: 'normal', dueDate: null, completed: 0 },
]

describe('HeapTodoOverlay', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders minimized Tasks button by default', () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
    render(<HeapTodoOverlay projectNodeId="node-1" projectTitle="My Project" />)
    expect(screen.getByRole('button', { name: /open project tasks/i })).toBeTruthy()
  })

  it('shows badge count for incomplete todos', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => linkedTodos })
    render(<HeapTodoOverlay projectNodeId="node-1" projectTitle="My Project" />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /open project tasks/i }).textContent).toContain('(1)'),
    )
  })

  it('opens the panel when Tasks button is clicked', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
    render(<HeapTodoOverlay projectNodeId="node-1" projectTitle="My Project" />)
    fireEvent.click(screen.getByRole('button', { name: /open project tasks/i }))
    await waitFor(() => expect(screen.getByText('My Project — Tasks')).toBeTruthy())
  })

  it('shows linked todos when panel is open', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => linkedTodos })
    render(<HeapTodoOverlay projectNodeId="node-1" projectTitle="My Project" />)
    // Open the panel
    fireEvent.click(screen.getByRole('button', { name: /open project tasks/i }))
    await waitFor(() => expect(screen.getByText('Fix bug')).toBeTruthy())
  })

  it('closes when X button is clicked', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
    render(<HeapTodoOverlay projectNodeId="node-1" projectTitle="My Project" />)
    fireEvent.click(screen.getByRole('button', { name: /open project tasks/i }))
    await waitFor(() => screen.getByRole('button', { name: /close tasks/i }))
    fireEvent.click(screen.getByRole('button', { name: /close tasks/i }))
    expect(screen.queryByText('My Project — Tasks')).toBeNull()
  })

  it('shows import candidates excluding already-linked todos', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>
    // mount fetch: linked todos
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => linkedTodos })
    render(<HeapTodoOverlay projectNodeId="node-1" projectTitle="My Project" />)
    // Open panel
    fireEvent.click(screen.getByRole('button', { name: /open project tasks/i }))
    await waitFor(() => screen.getByRole('button', { name: /import from to-dos/i }))

    // Open import: all todos + linked todos
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => allTodos })
      .mockResolvedValueOnce({ ok: true, json: async () => linkedTodos })
    fireEvent.click(screen.getByRole('button', { name: /import from to-dos/i }))
    await waitFor(() => expect(screen.getByText('Write tests')).toBeTruthy())
    // Already linked todo should not appear in import list
    const addButtons = screen.getAllByRole('button')
    const writeBugBtn = addButtons.find((b) => b.textContent?.includes('Fix bug'))
    expect(writeBugBtn).toBeUndefined()
  })
})
