import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ProjectHeader } from '@/components/heap/ProjectHeader'

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))

describe('ProjectHeader', () => {
  it('renders the project title', () => {
    render(<ProjectHeader projectId="p1" title="Internship Hunt" color="#3b82f6" />)
    expect(screen.getByText('Internship Hunt')).toBeTruthy()
  })

  it('navigates to /heap on back button click', () => {
    render(<ProjectHeader projectId="p1" title="Internship Hunt" color="#3b82f6" />)
    fireEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(mockPush).toHaveBeenCalledWith('/heap')
  })

  it('applies the viewTransitionName matching the projectId', () => {
    const { container } = render(<ProjectHeader projectId="p1" title="Test" color="#000" />)
    const header = container.querySelector('[style*="project-p1"]')
    expect(header).toBeTruthy()
  })
})
