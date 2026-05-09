'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  useReactFlow,
  addEdge,
  ConnectionMode,
  type Node,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type NodeDimensionChange,
  type Connection,
  type OnNodeDrag,
  type OnConnect,
} from '@xyflow/react'
import { HelpCircle } from 'lucide-react'
import { toast } from 'sonner'
import { HeapNode, type HeapNodeData } from './HeapNode'
import { AddNodeFab } from './AddNodeFab'
import { HeapTodoOverlay } from './HeapTodoOverlay'
import { HeapTutorial } from './HeapTutorial'
import { NodeDetailSheet } from './NodeDetailSheet'
import type { HeapNode as HeapNodeType } from '@/lib/db/schema'

const nodeTypes = { heapNode: HeapNode }

function toFlowNode(node: HeapNodeType & { todoCount?: number }): Node {
  // Circle nodes need an explicit size so they render at the correct dimensions on load.
  // Other shapes are content-sized by ReactFlow.
  const isCircle = node.shape === 'circle'
  return {
    id: node.id,
    type: 'heapNode',
    position: { x: node.posX, y: node.posY },
    data: {
      title: node.title,
      type: node.type,
      color: node.color,
      todoCount: node.todoCount ?? 0,
      shape: node.shape,
      width: node.width,
      height: node.height,
    } satisfies HeapNodeData,
    style: isCircle
      ? { width: node.width ?? 80, height: node.height ?? 80 }
      : node.width != null
        ? { width: node.width, height: node.height ?? node.width }
        : undefined,
  }
}

export function HeapCanvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [sheetNodeId, setSheetNodeId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showTutorial, setShowTutorial] = useState(false)
  // Abort controller map for in-flight drag PATCH requests — prevents stale writes on rapid drag
  const dragAbortRefs = useRef<Map<string, AbortController>>(new Map())
  // Abort controller map for in-flight resize PATCH requests — prevents stale writes on rapid resize
  const resizeAbortRefs = useRef<Map<string, AbortController>>(new Map())
  const { fitView } = useReactFlow()

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

  // Fit view after async load so nodes are always visible regardless of stored coordinates
  useEffect(() => {
    if (!isLoading) {
      requestAnimationFrame(() => fitView({ padding: 0.15, duration: 300 }))
    }
  }, [isLoading, fitView])

  // Persist circle resize to the server; aborts in-flight requests for the same node
  const patchNodeSize = useCallback((nodeId: string, width: number, height: number) => {
    const prev = resizeAbortRefs.current.get(nodeId)
    prev?.abort()
    const controller = new AbortController()
    resizeAbortRefs.current.set(nodeId, controller)
    fetch(`/api/heap/nodes/${nodeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ width, height }),
      signal: controller.signal,
    }).catch((error) => {
      if (error.name !== 'AbortError') toast.error('Failed to save node size')
    })
  }, []) // resizeAbortRefs is a stable ref — no deps needed

  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    onEdgesChange(changes)
    changes.forEach((change) => {
      if (change.type === 'remove') {
        fetch(`/api/heap/edges/${change.id}`, { method: 'DELETE' }).catch(() => {
          toast.error('Failed to delete connection')
        })
      }
    })
  }, [onEdgesChange])

  // Wraps useNodesState's onNodesChange to also persist circle resize when drag ends.
  // c.resizing is boolean | undefined: true while dragging, undefined when drag ends (not false).
  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    onNodesChange(changes)
    const resizes = changes.filter((c): c is NodeDimensionChange => c.type === 'dimensions')
    for (const c of resizes) {
      if (c.resizing !== true && c.dimensions != null) {
        patchNodeSize(c.id, c.dimensions.width, c.dimensions.height)
      }
    }
  }, [onNodesChange, patchNodeSize])

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
    setSheetNodeId(node.id)
  }

  function handleNodeCreated(node: HeapNodeType) {
    setNodes((currentNodes) => [...currentNodes, toFlowNode(node)])
    setSelectedNodeId(node.id)
    setSheetNodeId(node.id)
  }

  function handleNodeDeleted(nodeId: string) {
    setNodes((currentNodes) => currentNodes.filter((node) => node.id !== nodeId))
    setEdges((currentEdges) => currentEdges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId))
    if (selectedNodeId === nodeId) setSelectedNodeId(null)
    setSheetNodeId(null)
  }

  function handleNodeUpdated(nodeId: string, data: Partial<HeapNodeData>) {
    setNodes((currentNodes) => currentNodes.map((node) => {
      if (node.id !== nodeId) return node
      const updatedData = { ...node.data, ...data } as HeapNodeData
      // Keep style in sync when shape changes: circle needs an explicit pixel size;
      // non-circle shapes are content-sized (no style constraint).
      let updatedStyle = node.style
      if (data.shape === 'circle') {
        updatedStyle = { width: updatedData.width ?? 80, height: updatedData.height ?? 80 }
      } else if (data.shape != null) {
        updatedStyle = undefined
      }
      return { ...node, data: updatedData, style: updatedStyle }
    }))
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
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onNodeDragStop={handleNodeDragStop}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        connectionMode={ConnectionMode.Loose}
        colorMode="dark"
      >
        <Background />
        {/* Move controls to top-left so they don't collide with the bottom FABs */}
        <Controls position="top-left" />
      </ReactFlow>

      <AddNodeFab onNodeCreated={handleNodeCreated} />
      <button
        type="button"
        onClick={() => setShowTutorial(true)}
        aria-label="How to use Mind"
        className="absolute bottom-6 left-20 z-30 bg-card border border-border text-muted-foreground rounded-full w-12 h-12 flex items-center justify-center shadow-lg hover:text-foreground hover:border-primary transition-colors"
      >
        <HelpCircle className="w-5 h-5" />
      </button>
      {showTutorial && <HeapTutorial onClose={() => setShowTutorial(false)} />}
      <HeapTodoOverlay
        selectedNodeId={selectedNodeId}
        selectedNodeTitle={selectedNodeId ? ((nodes.find(n => n.id === selectedNodeId)?.data as HeapNodeData | undefined)?.title ?? null) : null}
        onClose={() => setSelectedNodeId(null)}
      />
      <NodeDetailSheet
        nodeId={sheetNodeId}
        onClose={() => setSheetNodeId(null)}
        onDeleted={handleNodeDeleted}
        onUpdated={handleNodeUpdated}
      />
    </div>
  )
}
