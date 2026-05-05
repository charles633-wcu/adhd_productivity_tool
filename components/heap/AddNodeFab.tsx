'use client'

import { Plus } from 'lucide-react'
import { useReactFlow } from '@xyflow/react'
import type { HeapNode } from '@/lib/db/schema'

interface AddNodeFabProps {
  onNodeCreated: (node: HeapNode) => void
}

export function AddNodeFab({ onNodeCreated }: AddNodeFabProps) {
  const { screenToFlowPosition } = useReactFlow()

  async function handleAdd() {
    const jitter = () => (Math.random() - 0.5) * 80
    const pos = screenToFlowPosition({
      x: window.innerWidth / 2 + jitter(),
      y: window.innerHeight / 2 + jitter(),
    })
    const res = await fetch('/api/heap/nodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New thought', type: 'brain_dump', posX: pos.x, posY: pos.y }),
    })
    if (!res.ok) return
    const node: HeapNode = await res.json()
    onNodeCreated(node)
  }

  return (
    <button
      type="button"
      onClick={handleAdd}
      className="absolute bottom-6 left-6 z-30 bg-primary text-primary-foreground rounded-full w-12 h-12 flex items-center justify-center shadow-lg hover:bg-primary/90 transition-colors"
      aria-label="Add node"
    >
      <Plus className="w-5 h-5" />
    </button>
  )
}
