import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ReviewBanner } from '@/components/ReviewBanner'

// Mock next/navigation so router.push can be asserted
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

describe('ReviewBanner', () => {
  it('renders the correct pluralized copy when count is 3', () => {
    render(<ReviewBanner count={3} />)
    expect(screen.getByText('You have 3 items that need review soon')).toBeTruthy()
  })

  it('renders singular copy when count is 1', () => {
    render(<ReviewBanner count={1} />)
    // Singular: "item" (no s), verb stays "need" to match spec copy template
    expect(screen.getByText('You have 1 item that need review soon')).toBeTruthy()
  })

  it('renders null when count is 0', () => {
    const { container } = render(<ReviewBanner count={0} />)
    expect(container.firstChild).toBeNull()
  })

  it('calls router.push("/review") when clicked', () => {
    render(<ReviewBanner count={2} />)
    fireEvent.click(screen.getByRole('button'))
    expect(mockPush).toHaveBeenCalledWith('/review')
  })
})
