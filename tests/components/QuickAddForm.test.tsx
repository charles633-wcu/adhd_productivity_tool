import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { QuickAddForm } from '@/components/QuickAddForm'

describe('QuickAddForm', () => {
  const onOpenChange = vi.fn()
  const onSuccess = vi.fn()

  beforeEach(() => {
    onOpenChange.mockReset()
    onSuccess.mockReset()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('asks to create a new category when the typed category is unknown', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'trigger-1' }),
    } as Response)

    render(
      <QuickAddForm
        categories={[{ id: 'cat-1', name: 'Work' }]}
        open
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />
    )

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Follow up' } })
    fireEvent.change(screen.getByLabelText(/category/i), { target: { value: 'Errands' } })
    fireEvent.click(screen.getByRole('button', { name: /save trigger/i }))

    expect(await screen.findByRole('button', { name: /create category and save/i })).toBeTruthy()
    expect(screen.getByText(/create new category "Errands"\?/i)).toBeTruthy()
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it('creates the missing category and then saves the trigger after confirmation', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'cat-2', name: 'Errands' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'trigger-1' }),
      } as Response)

    render(
      <QuickAddForm
        categories={[{ id: 'cat-1', name: 'Work' }]}
        open
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />
    )

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Follow up' } })
    fireEvent.change(screen.getByLabelText(/category/i), { target: { value: 'Errands' } })
    fireEvent.click(screen.getByRole('button', { name: /save trigger/i }))

    const confirmButton = await screen.findByRole('button', { name: /create category and save/i })
    fireEvent.click(confirmButton)

    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenNthCalledWith(
        1,
        '/api/categories',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"name":"Errands"'),
        })
      )
    })

    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenNthCalledWith(
        2,
        '/api/triggers',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"categoryId":"cat-2"'),
        })
      )
    })

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onSuccess).toHaveBeenCalled()
  })

  it('blocks submit and explains when the title is over the character limit', async () => {
    render(
      <QuickAddForm
        categories={[{ id: 'cat-1', name: 'Work' }]}
        open
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />
    )

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'x'.repeat(501) } })
    // Live counter shows the overflow before the user even submits
    expect(screen.getByText('501/500')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /save trigger/i }))

    expect((await screen.findByRole('alert')).textContent).toBe('Too many characters in Title: 501/500')
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it('shows the server error message instead of a generic failure', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: 'SqliteError: database is locked', code: 'DB_ERROR' }), { status: 500 })
    )

    render(
      <QuickAddForm
        categories={[{ id: 'cat-1', name: 'Work' }]}
        open
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />
    )

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Follow up' } })
    fireEvent.click(screen.getByRole('button', { name: /save trigger/i }))

    expect((await screen.findByRole('alert')).textContent).toBe('SqliteError: database is locked')
    expect(onSuccess).not.toHaveBeenCalled()
  })
})
