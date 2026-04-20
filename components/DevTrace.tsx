'use client'

// DevTrace — collapsible per-turn trace panel for chat dev mode.
// Props:
//   trace: TraceStep[] — the steps from one assistant turn
//   toolDefs: ChatToolDef[] — all available tools (for the strip)
//   showToolsStrip: boolean — whether to render the available-tools header

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { TraceStep } from '@/app/api/chat/route'
import type { ChatToolDef } from '@/lib/services/chatToolDefs'

interface DevTraceProps {
  trace: TraceStep[]
  toolDefs: ChatToolDef[]
  showToolsStrip: boolean
}

export function DevTrace({ trace, toolDefs, showToolsStrip }: DevTraceProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="mt-1 mb-2 font-mono text-[11px]">
      {/* Available tools strip — rendered once above first turn only */}
      {showToolsStrip && (
        <div className="mb-2 flex flex-wrap gap-1">
          {toolDefs.map(t => (
            <span
              key={t.name}
              title={t.description}
              className="rounded border border-border bg-muted/60 px-1.5 py-0.5 text-muted-foreground"
            >
              {t.name}
            </span>
          ))}
        </div>
      )}

      {/* Collapsible trace */}
      {trace.length > 0 && (
        <>
          <button
            type="button"
            aria-label="trace"
            onClick={() => setOpen(v => !v)}
            className="flex items-center gap-1 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            <span>trace ({trace.length} steps)</span>
          </button>

          {open && (
            <div className="mt-1 space-y-1 border-l-2 border-border pl-3">
              {trace.map(step => (
                <div key={step.step}>
                  {/* Reasoning step — model's internal thought text */}
                  {step.type === 'assistant_reasoning' && (
                    <div>
                      <span className="text-muted-foreground/70">reasoning › </span>
                      {step.text
                        ? <span className="text-foreground/80">{step.text}</span>
                        : <span className="italic text-muted-foreground/50">(no reasoning text)</span>
                      }
                    </div>
                  )}
                  {/* Tool call step — shows tool name and args */}
                  {step.type === 'tool_call' && (
                    <div>
                      <span className="text-blue-400">call › </span>
                      <span className="text-foreground/90">{step.toolName}</span>
                      <span className="text-muted-foreground/60"> {JSON.stringify(step.args)}</span>
                    </div>
                  )}
                  {/* Tool result step — shows item count (or raw truncated value) and duration */}
                  {step.type === 'tool_result' && (
                    <div>
                      <span className="text-green-500">result › </span>
                      <span className="text-foreground/80">
                        {Array.isArray(step.result)
                          ? `(${step.result.length} item${step.result.length !== 1 ? 's' : ''})`
                          : String(JSON.stringify(step.result)).slice(0, 300)
                        }
                      </span>
                      {step.durationMs !== undefined && (
                        <span className="text-muted-foreground/50"> ({step.durationMs}ms)</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
