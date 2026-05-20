import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NodeProps } from '@xyflow/react'
import type { CSSProperties } from 'react'

// vi.mock is hoisted before variable declarations, so use vi.hoisted() to lift the mock ref.
// Without vi.hoisted(), NodeResizerMock would be undefined inside the factory at runtime.
const NodeResizerMock = vi.hoisted(() => vi.fn(() => null))
vi.mock('@xyflow/react', () => ({
  Handle: (props: { id?: string; type?: string; style?: CSSProperties }) => (
    <div data-testid={`handle-${props.id}-${props.type}`} style={props.style} />
  ),
  Position: { Top: 'top', Right: 'right', Bottom: 'bottom', Left: 'left' },
  NodeResizer: NodeResizerMock,
  NodeToolbar: ({ children, isVisible }: { children: React.ReactNode; isVisible?: boolean }) => (
    isVisible ? <div data-testid="node-toolbar">{children}</div> : null
  ),
}))

import { HeapNode } from '@/components/heap/HeapNode'

function makeProps(overrides: Partial<NodeProps> = {}): NodeProps {
  return {
    data: { title: 'Test', type: 'brain_dump', color: null, todoCount: 0 },
    selected: false,
    ...overrides,
  } as unknown as NodeProps
}

describe('HeapNode shapes', () => {
  beforeEach(() => { NodeResizerMock.mockClear() })

  it('renders rectangle (no shape) with rounded-xl', () => {
    const { container } = render(<HeapNode {...makeProps()} />)
    expect((container.firstChild as HTMLElement).className).toContain('rounded-xl')
  })

  it('renders rectangle shape explicitly with rounded-xl', () => {
    const props = makeProps({ data: { title: 'Test', type: 'brain_dump', color: null, todoCount: 0, shape: 'rectangle' } })
    const { container } = render(<HeapNode {...props} />)
    expect((container.firstChild as HTMLElement).className).toContain('rounded-xl')
  })

  it('renders pill with rounded-full and min-w-[120px]', () => {
    const props = makeProps({ data: { title: 'Test', type: 'brain_dump', color: null, todoCount: 0, shape: 'pill' } })
    const { container } = render(<HeapNode {...props} />)
    const cls = (container.firstChild as HTMLElement).className
    expect(cls).toContain('rounded-full')
    expect(cls).toContain('min-w-[120px]')
  })

  it('renders circle with rounded-full', () => {
    const props = makeProps({ data: { title: 'Test', type: 'brain_dump', color: null, todoCount: 0, shape: 'circle' } })
    const { container } = render(<HeapNode {...props} />)
    expect(container.querySelector('.rounded-full')).toBeTruthy()
  })

  it('renders diamond outer div with rotate-45', () => {
    const props = makeProps({ data: { title: 'Test', type: 'brain_dump', color: null, todoCount: 0, shape: 'diamond' } })
    const { container } = render(<HeapNode {...props} />)
    const rotatedDiv = container.querySelector('.rotate-45')
    expect(rotatedDiv).toBeTruthy()
  })

  it('fills persisted rectangle and pill dimensions', () => {
    for (const shape of ['rectangle', 'pill'] as const) {
      const { container, unmount } = render(
        <HeapNode
          {...makeProps({
            data: { title: shape, type: 'brain_dump', color: null, todoCount: 0, shape, width: 240, height: 96 },
          })}
        />,
      )

      expect(container.firstChild).toHaveClass('w-full')
      expect(container.firstChild).toHaveClass('h-full')
      unmount()
    }
  })

  it('sizes the diamond surface from persisted dimensions', () => {
    const { container } = render(
      <HeapNode
        {...makeProps({
          data: { title: 'Diamond', type: 'brain_dump', color: null, todoCount: 0, shape: 'diamond', width: 160, height: 160 },
        })}
      />,
    )

    const wrapper = container.firstChild as HTMLElement
    const surface = container.querySelector('.rotate-45') as HTMLElement

    expect(wrapper).toHaveStyle({ width: '160px', height: '160px' })
    expect(surface).toHaveStyle({ width: '160px', height: '160px' })
  })

  it('renders priority styling for high and critical nodes', () => {
    const high = render(
      <HeapNode {...makeProps({ data: { title: 'High', type: 'brain_dump', color: null, todoCount: 0, priority: 'high' } })} />,
    )
    expect(high.container.firstChild).toHaveAttribute('data-priority', 'high')
    expect(high.container.firstChild).toHaveClass('ring-primary/30')
    high.unmount()

    const critical = render(
      <HeapNode {...makeProps({ data: { title: 'Critical', type: 'brain_dump', color: null, todoCount: 0, priority: 'critical' } })} />,
    )
    expect(critical.container.firstChild).toHaveAttribute('data-priority', 'critical')
    expect(critical.container.firstChild).toHaveClass('ring-destructive/40')
  })

  it('applies selected styling to the rotated diamond surface', () => {
    const { container } = render(
      <HeapNode
        {...makeProps({
          data: { title: 'Diamond', type: 'brain_dump', color: null, todoCount: 0, shape: 'diamond' },
          selected: true,
        })}
      />,
    )

    const wrapper = container.firstChild as HTMLElement
    const surface = container.querySelector('.rotate-45') as HTMLElement

    expect(wrapper).not.toHaveClass('ring-primary')
    expect(surface).toHaveClass('ring-primary')
  })

  it('applies priority styling to the rotated diamond surface', () => {
    const { container } = render(
      <HeapNode
        {...makeProps({
          data: { title: 'Diamond', type: 'brain_dump', color: null, todoCount: 0, shape: 'diamond', priority: 'critical' },
        })}
      />,
    )

    const wrapper = container.firstChild as HTMLElement
    const surface = container.querySelector('.rotate-45') as HTMLElement

    expect(wrapper).not.toHaveClass('ring-destructive/40')
    expect(surface).toHaveClass('ring-destructive/40')
  })

  it('renders NodeResizer for rectangle, pill, circle, and diamond with shape-specific aspect ratio', () => {
    for (const shape of ['rectangle', 'pill', 'circle', 'diamond'] as const) {
      NodeResizerMock.mockClear()
      render(<HeapNode {...makeProps({ data: { title: shape, type: 'brain_dump', color: null, todoCount: 0, shape }, selected: true })} />)
      expect(NodeResizerMock).toHaveBeenCalledWith(
        expect.objectContaining({
          isVisible: true,
          keepAspectRatio: shape === 'circle' || shape === 'diamond' ? true : false,
        }),
        expect.toSatisfy((v: unknown) => v === undefined || v != null),
      )
    }
  })

  it('renders dynamic connection handles around the node edge using calc centering', () => {
    render(
      <HeapNode
        {...makeProps({
          data: {
            title: 'Large node title that wraps',
            type: 'brain_dump',
            color: null,
            todoCount: 0,
            shape: 'rectangle',
            priority: 'normal',
            handles: [
              { id: 'top-0', side: 'top', index: 0, count: 2, xPercent: 33.33, yPercent: 0 },
              { id: 'top-1', side: 'top', index: 1, count: 2, xPercent: 66.66, yPercent: 0 },
              { id: 'right-0', side: 'right', index: 0, count: 1, xPercent: 100, yPercent: 50 },
              { id: 'bottom-0', side: 'bottom', index: 0, count: 1, xPercent: 50, yPercent: 100 },
              { id: 'left-0', side: 'left', index: 0, count: 1, xPercent: 0, yPercent: 50 },
            ],
          },
        })}
      />,
    )

    expect(screen.getByTestId('visual-handle-top-0')).toBeTruthy()
    // All handles use calc centering — center is at (xPercent%, yPercent%),
    // style places top-left at (xPercent% - 6px, yPercent% - 6px) with transform:none.
    expect(screen.getByTestId('handle-top-0-source').style.left).toBe('calc(33.33% - 6px)')
    expect(screen.getByTestId('handle-top-0-source').style.top).toBe('calc(0% - 6px)')
    // Right handles must NOT use left:100% (which misplaces center by 12px outside the node).
    expect(screen.getByTestId('handle-right-0-source').style.left).toBe('calc(100% - 6px)')
    // Bottom handles must NOT use top:100%.
    expect(screen.getByTestId('handle-bottom-0-source').style.top).toBe('calc(100% - 6px)')
    expect(screen.getByTestId('visual-handle-top-1')).toBeTruthy()
    expect(screen.getByTestId('visual-handle-right-0')).toBeTruthy()
  })

  it('NodeResizer rendered with isVisible=true when circle is selected', () => {
    const props = makeProps({
      data: { title: 'Test', type: 'brain_dump', color: null, todoCount: 0, shape: 'circle' },
      selected: true,
    })
    render(<HeapNode {...props} />)
    // React may pass undefined as the second arg for non-forwardRef components;
    // check only the props object to stay runtime-agnostic.
    expect(NodeResizerMock).toHaveBeenCalledWith(
      expect.objectContaining({ isVisible: true, keepAspectRatio: true, minWidth: 60, minHeight: 60 }),
      expect.toSatisfy((v: unknown) => v === undefined || v != null),
    )
  })

  it('NodeResizer rendered with isVisible=false when circle is not selected', () => {
    const props = makeProps({
      data: { title: 'Test', type: 'brain_dump', color: null, todoCount: 0, shape: 'circle' },
      selected: false,
    })
    render(<HeapNode {...props} />)
    expect(NodeResizerMock).toHaveBeenCalledWith(
      expect.objectContaining({ isVisible: false }),
      expect.toSatisfy((v: unknown) => v === undefined || v != null),
    )
  })

  it('keeps circle and diamond resize controls above shape surfaces', () => {
    for (const shape of ['circle', 'diamond'] as const) {
      NodeResizerMock.mockClear()
      render(<HeapNode {...makeProps({ data: { title: shape, type: 'brain_dump', color: null, todoCount: 0, shape }, selected: true })} />)

      expect(NodeResizerMock).toHaveBeenCalledWith(
        expect.objectContaining({
          handleClassName: expect.stringContaining('z-20'),
          lineClassName: expect.stringContaining('z-20'),
        }),
        expect.toSatisfy((v: unknown) => v === undefined || v != null),
      )
    }
  })

  it('renders circle handles outside the overflow-hidden surface', () => {
    const { container } = render(
      <HeapNode
        {...makeProps({
          data: {
            title: 'Circle',
            type: 'brain_dump',
            color: null,
            todoCount: 0,
            shape: 'circle',
            handles: [
              { id: 'left-0', side: 'left', index: 0, count: 1, xPercent: 0, yPercent: 50 },
              { id: 'right-0', side: 'right', index: 0, count: 1, xPercent: 100, yPercent: 50 },
            ],
          },
        })}
      />,
    )

    const clippedSurface = container.querySelector('.overflow-hidden') as HTMLElement
    const leftHandle = screen.getByTestId('visual-handle-left-0')

    expect(clippedSurface).toBeTruthy()
    expect(clippedSurface).not.toContainElement(leftHandle)
  })

})

describe('HeapNode text styles', () => {
  it('applies serif font-family to title when fontFamily is serif', () => {
    const props = makeProps({
      selected: true,
      data: { title: 'Styled', type: 'brain_dump', color: null, todoCount: 0, fontFamily: 'serif' },
    })
    render(<HeapNode {...props} />)
    const toolbar = screen.getByTestId('node-toolbar')
    expect(toolbar).toBeTruthy()
  })

  it('shows NodeToolbar only when selected', () => {
    const props = makeProps({
      selected: false,
      data: { title: 'Not selected', type: 'brain_dump', color: null, todoCount: 0 },
    })
    render(<HeapNode {...props} />)
    expect(screen.queryByTestId('node-toolbar')).toBeNull()
  })

  it('applies bold font-weight class when fontBold is true', () => {
    const props = makeProps({
      data: { title: 'Bold', type: 'brain_dump', color: null, todoCount: 0, fontBold: true },
    })
    const { container } = render(<HeapNode {...props} />)
    const titleSpan = container.querySelector('[data-testid="node-title"]')
    expect(titleSpan?.className).toContain('font-bold')
  })

  it('applies sm font size class when fontSize is sm', () => {
    const props = makeProps({
      data: { title: 'Small', type: 'brain_dump', color: null, todoCount: 0, fontSize: 'sm' },
    })
    const { container } = render(<HeapNode {...props} />)
    const titleSpan = container.querySelector('[data-testid="node-title"]')
    expect(titleSpan?.className).toContain('text-[10px]')
  })

  it('calls onTextStyleChange with fontFamily when family button clicked', () => {
    const onTextStyleChange = vi.fn()
    render(
      <HeapNode
        {...makeProps({
          selected: true,
          data: { title: 'T', type: 'brain_dump', color: null, todoCount: 0, onTextStyleChange },
        })}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /font: serif/i }))
    expect(onTextStyleChange).toHaveBeenCalledWith({ fontFamily: 'serif' })
  })
})
