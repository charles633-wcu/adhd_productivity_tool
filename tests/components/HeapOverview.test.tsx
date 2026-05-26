import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HeapOverview } from '@/components/heap/HeapOverview'

vi.mock('@/components/heap/ProjectCircle', () => ({
  ProjectCircle: ({ title, childCount }: { id: string; title: string; childCount: number; color: string | null }) => (
    <div data-testid="project-circle">{title} ({childCount})</div>
  ),
}))

vi.mock('@/components/heap/AgentSuggestButton', () => ({
  AgentSuggestButton: ({ label }: { label: string }) => <button>{label}</button>,
}))

global.fetch = vi.fn()

describe('HeapOverview', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders project circles from API', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: 'p1', title: 'Internship Hunt', color: '#3b82f6', type: 'project', todoCount: 0 },
          { id: 'p2', title: 'Medical', color: '#ef4444', type: 'project', todoCount: 0 },
        ],
      })
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 'n1' }] })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })

    render(<HeapOverview orphanCount={0} />)
    await waitFor(() => {
      expect(screen.getAllByTestId('project-circle')).toHaveLength(2)
    })
    expect(screen.getByText(/Internship Hunt/)).toBeTruthy()
  })

  it('shows orphan banner when orphanCount > 0', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true, json: async () => [],
    })
    render(<HeapOverview orphanCount={5} />)
    await waitFor(() => {
      expect(screen.getByText(/5 uncategorized/i)).toBeTruthy()
    })
  })

  it('does not show orphan banner when orphanCount is 0', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true, json: async () => [],
    })
    render(<HeapOverview orphanCount={0} />)
    await waitFor(() => {
      expect(screen.queryByText(/uncategorized/i)).toBeNull()
    })
  })
})
