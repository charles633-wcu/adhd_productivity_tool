import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import { TodoItem } from '@/components/todos/TodoItem'

const mockTodo = {
  id: 't1', userId: 'u1', listId: 'l1', parentId: null,
  title: 'Buy groceries', description: null, priority: 'high' as const,
  dueDate: null, dueTime: null, completed: 0, completedAt: null,
  sortOrder: 0, createdAt: new Date(), updatedAt: new Date(),
}

describe('TodoItem', () => {
  it('renders task title', () => {
    render(<TodoItem todo={mockTodo} onToggle={vi.fn()} onSelect={vi.fn()} />)
    expect(screen.getByText('Buy groceries')).toBeTruthy()
  })

  it('calls onToggle when checkbox is clicked', () => {
    const onToggle = vi.fn()
    render(<TodoItem todo={mockTodo} onToggle={onToggle} onSelect={vi.fn()} />)
    fireEvent.click(screen.getByRole('checkbox'))
    expect(onToggle).toHaveBeenCalledWith('t1', true)
  })

  it('shows priority badge', () => {
    render(<TodoItem todo={mockTodo} onToggle={vi.fn()} onSelect={vi.fn()} />)
    expect(screen.getByText('High')).toBeTruthy()
  })

  it('shows strikethrough when completed', () => {
    const completed = { ...mockTodo, completed: 1 }
    render(<TodoItem todo={completed} onToggle={vi.fn()} onSelect={vi.fn()} />)
    const title = screen.getByText('Buy groceries')
    expect(title.className).toContain('line-through')
  })
})
