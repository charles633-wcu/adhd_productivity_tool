import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { PriorityEdge } from '@/components/heap/PriorityEdge'
import { Position } from '@xyflow/react'

vi.mock('@xyflow/react', async () => {
  const React = await vi.importActual<typeof import('react')>('react')
  return {
    getBezierPath: () => ['M 0 0', 50, 50],
    BaseEdge: ({ path, style }: { path: string; style?: React.CSSProperties }) => (
      <svg><path data-testid="edge-path" d={path} style={style} /></svg>
    ),
    EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Position: { Top: 'top', Right: 'right', Bottom: 'bottom', Left: 'left' },
  }
})

function makeProps(overrides = {}) {
  return {
    id: 'e-1',
    source: 'n-1',
    target: 'n-2',
    sourceX: 0,
    sourceY: 0,
    targetX: 100,
    targetY: 100,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    selected: false,
    data: {},
    ...overrides,
  }
}

describe('PriorityEdge', () => {
  it('renders the edge path', () => {
    render(<PriorityEdge {...makeProps()} />)
    expect(screen.getByTestId('edge-path')).toBeTruthy()
  })

  it('does not show toolbar when not selected', () => {
    render(<PriorityEdge {...makeProps({ selected: false })} />)
    expect(screen.queryByTestId('edge-toolbar')).toBeNull()
  })

  it('shows toolbar when selected', () => {
    render(<PriorityEdge {...makeProps({ selected: true, data: { priority: 'normal' } })} />)
    expect(screen.getByTestId('edge-toolbar')).toBeTruthy()
    expect(screen.getByRole('button', { name: /mark high priority/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /delete connection/i })).toBeTruthy()
  })

  it('calls onPriorityChange with high when toggled from normal', () => {
    const onPriorityChange = vi.fn()
    render(<PriorityEdge {...makeProps({ selected: true, data: { priority: 'normal', onPriorityChange } })} />)
    fireEvent.click(screen.getByRole('button', { name: /mark high priority/i }))
    expect(onPriorityChange).toHaveBeenCalledWith('e-1', 'high')
  })

  it('calls onPriorityChange with normal when toggled from high', () => {
    const onPriorityChange = vi.fn()
    render(<PriorityEdge {...makeProps({ selected: true, data: { priority: 'high', onPriorityChange } })} />)
    fireEvent.click(screen.getByRole('button', { name: /remove high priority/i }))
    expect(onPriorityChange).toHaveBeenCalledWith('e-1', 'normal')
  })

  it('calls onDelete when delete button is clicked', () => {
    const onDelete = vi.fn()
    render(<PriorityEdge {...makeProps({ selected: true, data: { priority: 'normal', onDelete } })} />)
    fireEvent.click(screen.getByRole('button', { name: /delete connection/i }))
    expect(onDelete).toHaveBeenCalledWith('e-1')
  })

  it('applies gold style when priority is high', () => {
    render(<PriorityEdge {...makeProps({ data: { priority: 'high' } })} />)
    const path = screen.getByTestId('edge-path')
    expect(path.style.stroke).toBe('rgb(255, 215, 0)')
  })

  it('does not apply gold style when priority is normal', () => {
    render(<PriorityEdge {...makeProps({ data: { priority: 'normal' } })} />)
    const path = screen.getByTestId('edge-path')
    expect(path.style.stroke ?? '').not.toBe('rgb(255, 215, 0)')
  })
})
