import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CategoryPicker } from '@/components/CategoryPicker'

const cats = [
  { id: 'c1', name: 'Work', color: '#6366f1' },
  { id: 'c2', name: 'Health', color: '#22c55e' },
]

describe('CategoryPicker', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })

  it('renders a scrollable list with each category name and a No category option', () => {
    render(<CategoryPicker categories={cats} value="" onChange={() => {}} onCategoryCreated={() => {}} />)
    const picker = screen.getByTestId('category-picker')
    expect(within(picker).getByText('No category')).toBeTruthy()
    expect(within(picker).getByText('Work')).toBeTruthy()
    expect(within(picker).getByText('Health')).toBeTruthy()
  })

  it('calls onChange with the category id when a row is clicked', () => {
    const onChange = vi.fn()
    render(<CategoryPicker categories={cats} value="" onChange={onChange} onCategoryCreated={() => {}} />)
    fireEvent.click(screen.getByText('Health'))
    expect(onChange).toHaveBeenCalledWith('c2')
  })

  it('creates a new category, then selects it and reports it upward', async () => {
    const created = { id: 'c3', name: 'Errands', color: '#f59e0b' }
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => created })
    const onChange = vi.fn()
    const onCategoryCreated = vi.fn()
    render(<CategoryPicker categories={cats} value="" onChange={onChange} onCategoryCreated={onCategoryCreated} />)

    fireEvent.click(screen.getByTestId('category-add-toggle'))
    fireEvent.change(screen.getByLabelText('New category name'), { target: { value: 'Errands' } })
    fireEvent.click(screen.getByRole('button', { name: /create/i }))

    await waitFor(() => expect(onCategoryCreated).toHaveBeenCalledWith(created))
    expect(onChange).toHaveBeenCalledWith('c3')
    expect(fetch).toHaveBeenCalledWith('/api/calendar/event-categories', expect.objectContaining({ method: 'POST' }))
  })
})
