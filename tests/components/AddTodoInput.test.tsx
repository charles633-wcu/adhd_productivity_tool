import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import { AddTodoInput } from '@/components/todos/AddTodoInput'

describe('AddTodoInput', () => {
  it('calls onAdd with title when Enter is pressed', () => {
    const onAdd = vi.fn()
    render(<AddTodoInput onAdd={onAdd} />)
    const input = screen.getByPlaceholderText(/add a task/i)
    fireEvent.change(input, { target: { value: 'New task' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onAdd).toHaveBeenCalledWith('New task')
  })

  it('clears input after submit', () => {
    const onAdd = vi.fn()
    render(<AddTodoInput onAdd={onAdd} />)
    const input = screen.getByPlaceholderText(/add a task/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'New task' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(input.value).toBe('')
  })

  it('does not call onAdd on empty input', () => {
    const onAdd = vi.fn()
    render(<AddTodoInput onAdd={onAdd} />)
    fireEvent.keyDown(screen.getByPlaceholderText(/add a task/i), { key: 'Enter' })
    expect(onAdd).not.toHaveBeenCalled()
  })
})
