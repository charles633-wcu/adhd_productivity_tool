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
import { deriveFocusVisibility, type FocusEdge, type FocusNode } from '@/lib/heap/focus'

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
      priority: node.priority ?? 'normal',
      updatedAt: node.updatedAt,
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
  const [focusMode, setFocusMode] = useState(false)
  const [focusPathIds, setFocusPathIds] = useState<Set<string>>(new Set())
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

  const focusVisibility = focusMode
    ? deriveFocusVisibility({
        nodes: nodes.map((node) => ({
          id: node.id,
          title: String((node.data as HeapNodeData).title),
          priority: (node.data as HeapNodeData).priority,
          shape: (node.data as HeapNodeData).shape,
          width: (node.data as HeapNodeData).width,
          height: (node.data as HeapNodeData).height,
          updatedAt: (node.data as HeapNodeData).updatedAt,
        })) satisfies FocusNode[],
        edges: edges.map((edge) => ({ id: edge.id, source: String(edge.source), target: String(edge.target) })) satisfies FocusEdge[],
        focusPathIds,
      })
    : null

  const childTitles = new Map(nodes.map((node) => [node.id, String((node.data as HeapNodeData).title)]))
  const renderedNodes = focusVisibility
    ? nodes.map((node) => {
        const picked = focusVisibility.visibleChildrenByNodeId.get(node.id)
        return {
          ...node,
          data: {
            ...node.data,
            focusMode,
            dimmed: focusVisibility.dimmedNodeIds.has(node.id),
            visibleChildren: picked?.visibleChildIds.map((id) => ({ id, title: childTitles.get(id) ?? 'Untitled' })) ?? [],
            overflowChildCount: picked?.overflowCount ?? 0,
            onPreviewClick: (nodeId: string) => setFocusPathIds((current) => new Set([...current, nodeId])),
          },
        }
      })
    : nodes

  const renderedEdges = focusVisibility
    ? edges.map((edge) => ({
        ...edge,
        animated: focusVisibility.brightEdgeIds.has(edge.id),
        style: { ...(edge.style ?? {}), opacity: focusVisibility.dimmedEdgeIds.has(edge.id) ? 0.18 : 1 },
      }))
    : edges

  return (
    <div className="h-full w-full relative" data-testid="heap-canvas-container" data-selected-node-id={selectedNodeId ?? undefined}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-50 bg-background/60">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      )}
      <div className="absolute right-6 top-6 z-30 flex items-center gap-2 rounded-full border border-border bg-card/90 px-3 py-2 shadow-lg backdrop-blur">
        <button
          type="button"
          aria-pressed={focusMode}
          aria-label="Focus Mode"
          onClick={() => setFocusMode((current) => !current)}
          className={focusMode ? 'text-primary text-sm font-semibold' : 'text-muted-foreground text-sm font-semibold'}
        >
          Focus Mode
        </button>
        {focusMode && focusVisibility && (
          <span className="text-xs text-muted-foreground">Focused: {focusVisibility.brightNodeIds.size} / {nodes.length}</span>
        )}
        {focusMode && focusPathIds.size > 0 && (
          <button type="button" onClick={() => setFocusPathIds(new Set())} className="text-xs text-muted-foreground hover:text-foreground">
            Reset Focus
          </button>
        )}
      </div>
      {focusMode && focusVisibility?.brightNodeIds.size === 0 && (
        <div className="absolute right-6 top-20 z-30 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground shadow">
          Mark nodes high priority to start Focus Mode.
        </div>
      )}
      <ReactFlow
        nodes={renderedNodes}
        edges={renderedEdges}
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
