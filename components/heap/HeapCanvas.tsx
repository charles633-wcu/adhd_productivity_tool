'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  type OnNodeDrag,
  type OnConnect,
} from '@xyflow/react'
import { toast } from 'sonner'
import { HeapNode, type HeapNodeData } from './HeapNode'
import { AddNodeFab } from './AddNodeFab'
import type { HeapNode as HeapNodeType } from '@/lib/db/schema'

const nodeTypes = { heapNode: HeapNode }

function toFlowNode(node: HeapNodeType & { todoCount?: number }): Node {
  return {
    id: node.id,
    type: 'heapNode',
    position: { x: node.posX, y: node.posY },
    data: {
      title: node.title,
      type: node.type,
      color: node.color,
      todoCount: node.todoCount ?? 0,
    } satisfies HeapNodeData,
  }
}

export function HeapCanvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const dragAbortRefs = useRef<Map<string, AbortController>>(new Map())

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [nodesRes, edgesRes] = await Promise.all([
          fetch('/api/heap/nodes'),
          fetch('/api/heap/edges'),
        ])
        if (!nodesRes.ok || !edgesRes.ok) throw new Error('fetch failed')
        const [rawNodes, rawEdges]: [HeapNodeType[], Edge[]] = await Promise.all([
          nodesRes.json(),
          edgesRes.json(),
        ])
        if (cancelled) return
        setNodes(rawNodes.map(toFlowNode))
        setEdges(rawEdges)
      } catch {
        toast.error('Failed to load heap - please refresh')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [setNodes, setEdges])

  const handleNodeDragStop: OnNodeDrag<Node> = useCallback((_event, node) => {
    const prev = dragAbortRefs.current.get(node.id)
    prev?.abort()
    const controller = new AbortController()
    dragAbortRefs.current.set(node.id, controller)
    fetch(`/api/heap/nodes/${node.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ posX: node.position.x, posY: node.position.y }),
      signal: controller.signal,
    }).catch((error) => {
      if (error.name !== 'AbortError') toast.error('Failed to save position')
    })
  }, [])

  const handleConnect: OnConnect = useCallback(async (params: Connection) => {
    const tempId = `temp-${Date.now()}`
    const optimisticEdge: Edge = { ...params, id: tempId } as Edge
    setEdges((currentEdges) => addEdge(optimisticEdge, currentEdges))
    try {
      const res = await fetch('/api/heap/edges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId: params.source, targetId: params.target }),
      })
      if (!res.ok) {
        setEdges((currentEdges) => currentEdges.filter((edge) => edge.id !== tempId))
        if (res.status !== 409) toast.error('Failed to create connection')
        return
      }
      const realEdge: Edge = await res.json()
      setEdges((currentEdges) => currentEdges.map((edge) => edge.id === tempId ? realEdge : edge))
    } catch {
      setEdges((currentEdges) => currentEdges.filter((edge) => edge.id !== tempId))
      toast.error('Failed to create connection')
    }
  }, [setEdges])

  function handleNodeClick(_event: React.MouseEvent, node: Node) {
    setSelectedNodeId(node.id)
  }

  function handleNodeCreated(node: HeapNodeType) {
    setNodes((currentNodes) => [...currentNodes, toFlowNode(node)])
    setSelectedNodeId(node.id)
  }

  return (
    <div className="h-full w-full relative" data-testid="heap-canvas-container" data-selected-node-id={selectedNodeId ?? undefined}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-50 bg-background/60">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        onNodeDragStop={handleNodeDragStop}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>

      <AddNodeFab onNodeCreated={handleNodeCreated} />
    </div>
  )
}
