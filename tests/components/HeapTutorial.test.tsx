import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { HeapTutorial } from '@/components/heap/HeapTutorial'

describe('HeapTutorial', () => {
  it('renders all step titles', () => {
    render(<HeapTutorial onClose={vi.fn()} />)
    expect(screen.getByText('How to use Mind')).toBeTruthy()
    expect(screen.getByText('Create a node')).toBeTruthy()
    expect(screen.getByText('Edit a node')).toBeTruthy()
    expect(screen.getByText('Connect nodes')).toBeTruthy()
    expect(screen.getByText('Delete a connection')).toBeTruthy()
    expect(screen.getByText('Linked tasks')).toBeTruthy()
    expect(screen.getByText('Navigate')).toBeTruthy()
  })

  it('calls onClose when Got it is clicked', () => {
    const onClose = vi.fn()
    render(<HeapTutorial onClose={onClose} />)
    fireEvent.click(screen.getByText('Got it'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when the X button is clicked', () => {
    const onClose = vi.fn()
    render(<HeapTutorial onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /close tutorial/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn()
    render(<HeapTutorial onClose={onClose} />)
    fireEvent.click(screen.getByTestId('heap-tutorial-backdrop'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not call onClose when the card itself is clicked', () => {
    const onClose = vi.fn()
    render(<HeapTutorial onClose={onClose} />)
    fireEvent.click(screen.getByText('How to use Mind'))
    expect(onClose).not.toHaveBeenCalled()
  })
})
