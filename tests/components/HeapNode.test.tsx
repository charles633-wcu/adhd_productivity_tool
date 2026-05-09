import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NodeProps } from '@xyflow/react'

// vi.mock is hoisted before variable declarations, so use vi.hoisted() to lift the mock ref.
// Without vi.hoisted(), NodeResizerMock would be undefined inside the factory at runtime.
const NodeResizerMock = vi.hoisted(() => vi.fn(() => null))
vi.mock('@xyflow/react', () => ({
  Handle: () => null,
  Position: { Left: 'left', Right: 'right' },
  NodeResizer: NodeResizerMock,
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
    expect((container.firstChild as HTMLElement).className).toContain('rounded-full')
  })

  it('renders diamond outer div with rotate-45', () => {
    const props = makeProps({ data: { title: 'Test', type: 'brain_dump', color: null, todoCount: 0, shape: 'diamond' } })
    const { container } = render(<HeapNode {...props} />)
    const rotatedDiv = container.querySelector('.rotate-45')
    expect(rotatedDiv).toBeTruthy()
  })

  it('NodeResizer absent when shape is rectangle', () => {
    render(<HeapNode {...makeProps()} />)
    expect(NodeResizerMock).not.toHaveBeenCalled()
  })

  it('NodeResizer absent when shape is pill', () => {
    const props = makeProps({ data: { title: 'Test', type: 'brain_dump', color: null, todoCount: 0, shape: 'pill' } })
    render(<HeapNode {...props} />)
    expect(NodeResizerMock).not.toHaveBeenCalled()
  })

  it('NodeResizer absent when shape is diamond', () => {
    const props = makeProps({ data: { title: 'Test', type: 'brain_dump', color: null, todoCount: 0, shape: 'diamond' } })
    render(<HeapNode {...props} />)
    expect(NodeResizerMock).not.toHaveBeenCalled()
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
})
