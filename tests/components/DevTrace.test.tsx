import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { DevTrace } from '@/components/DevTrace'
import type { TraceStep } from '@/app/api/chat/route'
import type { ChatToolDef } from '@/lib/services/chatToolDefs'

const mockDefs: ChatToolDef[] = [
  { name: 'search_triggers', description: 'Search triggers' },
  { name: 'get_due_triggers', description: 'Get due triggers' },
]

const mockTrace: TraceStep[] = [
  { step: 0, type: 'assistant_reasoning', text: 'I will search triggers.' },
  { step: 1, type: 'tool_call', toolName: 'search_triggers', args: { query: 'work' } },
  { step: 2, type: 'tool_result', toolName: 'search_triggers', result: [{ id: '1', title: 'Work item' }], durationMs: 42 },
]

describe('DevTrace', () => {
  it('renders collapsed by default with a toggle button', () => {
    render(<DevTrace trace={mockTrace} toolDefs={mockDefs} showToolsStrip={false} />)
    expect(screen.getByRole('button', { name: /trace/i })).toBeInTheDocument()
    expect(screen.queryByText('search_triggers')).not.toBeInTheDocument()
  })

  it('expands to show tool call steps on click', () => {
    render(<DevTrace trace={mockTrace} toolDefs={mockDefs} showToolsStrip={false} />)
    fireEvent.click(screen.getByRole('button', { name: /trace/i }))
    expect(screen.getByText('search_triggers')).toBeInTheDocument()
    expect(screen.getByText(/work/i)).toBeInTheDocument()
    expect(screen.getByText(/42ms/)).toBeInTheDocument()
  })

  it('shows reasoning text when present', () => {
    render(<DevTrace trace={mockTrace} toolDefs={mockDefs} showToolsStrip={false} />)
    fireEvent.click(screen.getByRole('button', { name: /trace/i }))
    expect(screen.getByText('I will search triggers.')).toBeInTheDocument()
  })

  it('shows fallback text when reasoning is null', () => {
    const traceWithNull: TraceStep[] = [
      { step: 0, type: 'assistant_reasoning', text: null },
    ]
    render(<DevTrace trace={traceWithNull} toolDefs={mockDefs} showToolsStrip={false} />)
    fireEvent.click(screen.getByRole('button', { name: /trace/i }))
    expect(screen.getByText(/no reasoning text/i)).toBeInTheDocument()
  })

  it('renders tools strip when showToolsStrip is true', () => {
    render(<DevTrace trace={[]} toolDefs={mockDefs} showToolsStrip={true} />)
    expect(screen.getByText('search_triggers')).toBeInTheDocument()
    expect(screen.getByText('get_due_triggers')).toBeInTheDocument()
  })
})
