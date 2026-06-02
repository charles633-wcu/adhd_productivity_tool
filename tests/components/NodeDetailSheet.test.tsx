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

  it('shows linked todos without task mutation controls', async () => {
    const linkedTodo = { id: 't-1', userId: 'u1', title: 'Linked task', completed: 0 }
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => mockNode })
      .mockResolvedValueOnce({ ok: true, json: async () => [linkedTodo] })  // todos
      .mockResolvedValueOnce({ ok: true, json: async () => [] })  // triggers
    render(<NodeDetailSheet nodeId="n-1" onClose={vi.fn()} onDeleted={vi.fn()} onUpdated={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Linked task')).toBeTruthy())
    expect(screen.queryByPlaceholderText(/create and link/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /unlink task/i })).toBeNull()
  })

  it('does not update node type locally when PATCH fails', async () => {
    const onUpdated = vi.fn()
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => mockNode })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })  // todos
      .mockResolvedValueOnce({ ok: true, json: async () => [] })  // triggers
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'failed' }) })  // PATCH response
    render(<NodeDetailSheet nodeId="n-1" onClose={vi.fn()} onDeleted={vi.fn()} onUpdated={onUpdated} />)
    await waitFor(() => screen.getByDisplayValue('My node'))
    fireEvent.click(screen.getByRole('button', { name: 'Note' }))
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
      expect(calls.some((c: unknown[]) => (c[1] as RequestInit)?.method === 'PATCH')).toBe(true)
    })
    expect(onUpdated).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Dump' }).className).toContain('border-primary')
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

  it('keeps trigger picker input when linking a trigger fails', async () => {
    const newTrigger = { id: 'tr-2', title: 'Read daily', status: 'active', nextReviewAt: new Date().toISOString(), categoryId: 'c-1' }
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => mockNode })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => [newTrigger] })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'failed' }) })  // POST response
    render(<NodeDetailSheet nodeId="n-1" onClose={vi.fn()} onDeleted={vi.fn()} onUpdated={vi.fn()} />)
    await waitFor(() => screen.getByDisplayValue('My node'))
    const input = screen.getByRole('textbox', { name: /link a trigger/i })
    fireEvent.focus(input)
    await waitFor(() => screen.getByText('Read daily'))
    fireEvent.change(input, { target: { value: 'Read' } })
    fireEvent.mouseDown(screen.getByText('Read daily'))
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
      expect(calls.some((c: unknown[]) => (c[1] as RequestInit)?.method === 'POST')).toBe(true)
    })
    expect((input as HTMLInputElement).value).toBe('Read')
    expect(screen.getByText('Read daily')).toBeTruthy()
  })
})

describe('NodeDetailSheet — shape picker', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shape picker renders 4 buttons (rectangle, circle, diamond, pill)', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...mockNode, shape: 'rectangle' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })   // todos
      .mockResolvedValueOnce({ ok: true, json: async () => [] })   // triggers
    render(<NodeDetailSheet nodeId="n-1" onClose={vi.fn()} onDeleted={vi.fn()} onUpdated={vi.fn()} />)
    await waitFor(() => screen.getByDisplayValue('My node'))
    const shapeButtons = screen.getAllByRole('button', { name: /rectangle|circle|diamond|pill/i })
    expect(shapeButtons).toHaveLength(4)
  })

  it('active shape button has ring-2 class', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...mockNode, shape: 'circle' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
    render(<NodeDetailSheet nodeId="n-1" onClose={vi.fn()} onDeleted={vi.fn()} onUpdated={vi.fn()} />)
    await waitFor(() => screen.getByDisplayValue('My node'))
    const circleBtn = screen.getByRole('button', { name: /circle/i })
    expect(circleBtn.className).toContain('ring-2')
  })

  it('clicking a shape fires PATCH with the new shape and calls onUpdated', async () => {
    const onUpdated = vi.fn()
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...mockNode, shape: 'rectangle' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...mockNode, shape: 'diamond' }) })   // PATCH response
    render(<NodeDetailSheet nodeId="n-1" onClose={vi.fn()} onDeleted={vi.fn()} onUpdated={onUpdated} />)
    await waitFor(() => screen.getByDisplayValue('My node'))
    fireEvent.click(screen.getByRole('button', { name: /diamond/i }))
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
      const patchCall = calls.find((c: unknown[]) => (c[1] as RequestInit)?.method === 'PATCH')
      expect(patchCall).toBeTruthy()
      expect(JSON.parse((patchCall![1] as RequestInit).body as string)).toEqual({ shape: 'diamond' })
    })
    expect(onUpdated).toHaveBeenCalledWith('n-1', expect.objectContaining({ shape: 'diamond' }))
  })
})

describe('NodeDetailSheet — priority picker', () => {
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
