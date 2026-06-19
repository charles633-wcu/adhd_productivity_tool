import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ScratchPadSheet } from '@/components/scratch/ScratchPadSheet'

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] }) as never
})

it('loads notes on open', async () => {
  ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok: true,
    json: async () => [{ id: 'n1', content: 'buy milk', checked: 0, sortOrder: 0, promotedTodoId: null }],
  })
  render(<ScratchPadSheet open onOpenChange={vi.fn()} />)
  await waitFor(() => expect(screen.getByText('buy milk')).toBeInTheDocument())
})

it('renders nothing when closed', () => {
  const { container } = render(<ScratchPadSheet open={false} onOpenChange={vi.fn()} />)
  expect(container).toBeEmptyDOMElement()
})

it('optimistically appends a note on add', async () => {
  ;(global.fetch as ReturnType<typeof vi.fn>)
    .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 'n1', content: 'milk', checked: 0, sortOrder: 0, promotedTodoId: null }] }) // initial load
    .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'n2', content: 'eggs', checked: 0, sortOrder: 1, promotedTodoId: null }) }) // POST
  render(<ScratchPadSheet open onOpenChange={vi.fn()} />)
  // Wait for the initial load to settle before adding (avoids a load-vs-append race).
  await waitFor(() => expect(screen.getByText('milk')).toBeInTheDocument())
  const input = screen.getByPlaceholderText(/add an item/i)
  fireEvent.change(input, { target: { value: 'eggs' } })
  fireEvent.submit(input.closest('form')!)
  await waitFor(() => expect(screen.getByText('eggs')).toBeInTheDocument())
})

it('closes via the close button', () => {
  const onOpenChange = vi.fn()
  render(<ScratchPadSheet open onOpenChange={onOpenChange} />)
  fireEvent.click(screen.getByRole('button', { name: /close/i }))
  expect(onOpenChange).toHaveBeenCalledWith(false)
})
