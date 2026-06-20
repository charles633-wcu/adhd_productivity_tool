import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ScratchNoteRow } from '@/components/scratch/ScratchNoteRow'

const note = { id: 'n1', userId: 'u1', content: 'buy milk', checked: 0, sortOrder: 0, promotedTodoId: null, createdAt: new Date(), updatedAt: new Date() }

function setup(overrides = {}, handlers = {}) {
  const props = { onToggle: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), onPromote: vi.fn(), ...handlers }
  render(<ScratchNoteRow note={{ ...note, ...overrides } as never} {...props} />)
  return props
}

it('toggles checked', () => {
  const { onToggle } = setup()
  fireEvent.click(screen.getByRole('checkbox'))
  expect(onToggle).toHaveBeenCalledWith('n1', true)
})

it('enters edit mode on text click and commits on Enter', () => {
  const { onEdit } = setup()
  fireEvent.click(screen.getByText('buy milk'))
  const input = screen.getByDisplayValue('buy milk')
  fireEvent.change(input, { target: { value: 'buy oat milk' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(onEdit).toHaveBeenCalledWith('n1', 'buy oat milk')
})

it('does not call onEdit when content is unchanged', () => {
  const { onEdit } = setup()
  fireEvent.click(screen.getByText('buy milk'))
  fireEvent.keyDown(screen.getByDisplayValue('buy milk'), { key: 'Enter' })
  expect(onEdit).not.toHaveBeenCalled()
})

it('calls onDelete', () => {
  const { onDelete } = setup()
  fireEvent.click(screen.getByRole('button', { name: /delete/i }))
  expect(onDelete).toHaveBeenCalledWith('n1')
})

it('calls onPromote', () => {
  const { onPromote } = setup()
  fireEvent.click(screen.getByRole('button', { name: /promote/i }))
  expect(onPromote).toHaveBeenCalledWith('n1')
})

it('hides promote when already promoted', () => {
  setup({ promotedTodoId: 't1' })
  expect(screen.queryByRole('button', { name: /promote/i })).toBeNull()
})
