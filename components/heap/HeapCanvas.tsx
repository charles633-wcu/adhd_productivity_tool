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
  type Viewport,
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
import { assignEdgeHandles, buildNodeHandles, type HandleNode } from '@/lib/heap/handles'

const nodeTypes = { heapNode: HeapNode }

function exportGraph(nodes: Node[], edges: Edge[]) {
  const snapshot = {
    version: 1,
    exportedAt: new Date().toISOString(),
    nodes: nodes.map((n) => ({ id: n.id, position: n.position, data: n.data, style: n.style })),
    edges: edges.map((e) => ({ id: e.id, source: String(e.source), target: String(e.target) })),
  }
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `mind-graph-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

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
      fontFamily: node.fontFamily ?? null,
      fontSize: node.fontSize ?? null,
      fontBold: node.fontBold ?? null,
    } satisfies HeapNodeData,
    style: isCircle
      ? { width: node.width ?? 80, height: node.height ?? 80 }
      : node.width != null
        ? { width: node.width, height: node.height ?? node.width }
        : undefined,
  }
}

function numericDimension(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

export function HeapCanvas({ projectId }: { projectId?: string } = {}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [sheetNodeId, setSheetNodeId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showTutorial, setShowTutorial] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const [focusPathIds, setFocusPathIds] = useState<Set<string>>(new Set())
  const [showInspector, setShowInspector] = useState(false)
  // Abort controller map for in-flight drag PATCH requests — prevents stale writes on rapid drag
  const dragAbortRefs = useRef<Map<string, AbortController>>(new Map())
  // Abort controller map for in-flight resize PATCH requests — prevents stale writes on rapid resize
  const resizeAbortRefs = useRef<Map<string, AbortController>>(new Map())
  const { fitView, setViewport } = useReactFlow()

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        // Scope the node fetch to a specific project when projectId is provided
        const nodesUrl = projectId
          ? `/api/heap/nodes?projectId=${encodeURIComponent(projectId)}`
          : '/api/heap/nodes'
        const [nodesRes, edgesRes] = await Promise.all([
          fetch(nodesUrl),
          fetch('/api/heap/edges'),
        ])
        if (!nodesRes.ok || !edgesRes.ok) throw new Error('fetch failed')
        const [rawNodes, rawEdges]: [HeapNodeType[], Edge[]] = await Promise.all([
          nodesRes.json(),
          edgesRes.json(),
        ])
        if (cancelled) return
        // Filter edges to only those whose both endpoints exist in the loaded nodes
        const nodeIdSet = new Set(rawNodes.map((n: HeapNodeType) => n.id))
        const scopedEdges = (rawEdges as Edge[]).filter(
          (e) => nodeIdSet.has(String(e.source)) && nodeIdSet.has(String(e.target))
        )
        setNodes(rawNodes.map(toFlowNode))
        setEdges(scopedEdges)
      } catch {
        toast.error('Failed to load heap - please refresh')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [setNodes, setEdges, projectId])  // projectId triggers refetch when changed

  // Restore saved viewport from localStorage, or fit all nodes if none saved.
  // The key is namespaced by projectId so each project canvas restores its own viewport.
  useEffect(() => {
    if (!isLoading) {
      const viewportKey = projectId ? `mind-graph-viewport-${projectId}` : 'mind-graph-viewport'
      requestAnimationFrame(() => {
        const saved = localStorage.getItem(viewportKey)
        if (saved) {
          try {
            const vp = JSON.parse(saved) as Viewport
            setViewport(vp, { duration: 200 })
          } catch {
            fitView({ padding: 0.15, duration: 300 })
          }
        } else {
          fitView({ padding: 0.15, duration: 300 })
        }
      })
    }
  }, [isLoading, fitView, setViewport, projectId])

  const handleMoveEnd = useCallback((_event: unknown, viewport: Viewport) => {
    const viewportKey = projectId ? `mind-graph-viewport-${projectId}` : 'mind-graph-viewport'
    localStorage.setItem(viewportKey, JSON.stringify(viewport))
  }, [projectId])

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
  // Falls back to node.style (updated by onNodesChange) when the change omits explicit dimensions,
  // which happens when ReactFlow's NodeResizer fires updateStyle:true without a dimensions field.
  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    onNodesChange(changes)
    const resizes = changes.filter((c): c is NodeDimensionChange => c.type === 'dimensions')
    if (resizes.length > 0) {
      setNodes((currentNodes) => currentNodes.map((node) => {
        const resize = resizes.find((change) => change.id === node.id)
        if (!resize) return node
        const nextWidth = resize.dimensions?.width ?? numericDimension(node.style?.width)
        const nextHeight = resize.dimensions?.height ?? numericDimension(node.style?.height)
        if (nextWidth == null || nextHeight == null) return node
        return {
          ...node,
          data: { ...node.data, width: nextWidth, height: nextHeight },
          style: { ...(node.style ?? {}), width: nextWidth, height: nextHeight },
        }
      }))
    }
    for (const c of resizes) {
      if (c.resizing !== true && c.dimensions != null) {
        patchNodeSize(c.id, c.dimensions.width, c.dimensions.height)
      }
    }
  }, [onNodesChange, patchNodeSize, setNodes])

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
    if (focusMode && focusVisibility) {
      const data = node.data as HeapNodeData
      const isBright = focusVisibility.brightNodeIds.has(node.id)
      // Root nodes (high/critical) are seeds; drilled nodes are already in path.
      // Only drill a bright node that is neither.
      const isRootNode = data.priority === 'critical' || data.priority === 'high'
      const isAlreadyInPath = focusPathIds.has(node.id)
      if (isBright && !isRootNode && !isAlreadyInPath) {
        setFocusPathIds((current) => new Set([...current, node.id]))
        return
      }
    }
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
        updatedStyle = updatedData.width != null
          ? { width: updatedData.width, height: updatedData.height ?? updatedData.width }
          : undefined
      }
      return { ...node, data: updatedData, style: updatedStyle }
    }))
  }

  const handleTextStyleChange = useCallback((nodeId: string, style: Partial<Pick<HeapNodeData, 'fontFamily' | 'fontSize' | 'fontBold' | 'color'>>) => {
    // Capture previous data for rollback
    let prevData: HeapNodeData | null = null
    setNodes((current) => current.map((node) => {
      if (node.id !== nodeId) return node
      prevData = node.data as HeapNodeData
      return { ...node, data: { ...node.data, ...style } }
    }))
    fetch(`/api/heap/nodes/${nodeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(style),
    }).catch(() => {
      toast.error('Failed to save text style')
      if (prevData) {
        setNodes((current) => current.map((node) =>
          node.id === nodeId ? { ...node, data: prevData as HeapNodeData } : node,
        ))
      }
    })
  }, [setNodes])

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

  const handleNodes: HandleNode[] = nodes.map((node) => {
    const data = node.data as HeapNodeData
    return {
      id: node.id,
      x: node.position.x,
      y: node.position.y,
      width: numericDimension(data.width) ?? numericDimension(node.measured?.width) ?? numericDimension(node.style?.width),
      height: numericDimension(data.height) ?? numericDimension(node.measured?.height) ?? numericDimension(node.style?.height),
      shape: data.shape,
    }
  })
  const handlesByNodeId = new Map(handleNodes.map((node) => [node.id, buildNodeHandles(node)]))
  const nodesWithHandles = nodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      handles: handlesByNodeId.get(node.id) ?? [],
    },
  }))
  const renderedNodes = nodesWithHandles.map((node) => ({
    ...node,
    data: {
      ...node.data,
      ...(focusVisibility && {
        focusMode: true,
        dimmed: focusVisibility.dimmedNodeIds.has(node.id),
      }),
      onTextStyleChange: (style: Partial<Pick<HeapNodeData, 'fontFamily' | 'fontSize' | 'fontBold' | 'color'>>) =>
        handleTextStyleChange(node.id, style),
    },
  }))

  const assignedEdges = assignEdgeHandles(handleNodes, edges)
  const renderedEdges = focusVisibility
    ? assignedEdges.map((edge) => ({
        ...edge,
        animated: focusVisibility.brightEdgeIds.has(edge.id),
        style: { ...(edge.style ?? {}), opacity: focusVisibility.dimmedEdgeIds.has(edge.id) ? 0.18 : 1 },
      }))
    : assignedEdges

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
        <span className="w-px h-4 bg-border" />
        <button
          type="button"
          aria-label="Graph Inspector"
          aria-pressed={showInspector}
          onClick={() => setShowInspector((v) => !v)}
          className={showInspector ? 'text-primary text-sm font-semibold' : 'text-muted-foreground text-sm font-semibold'}
        >
          Graph Inspector
        </button>
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
        onMoveEnd={handleMoveEnd}
        nodeTypes={nodeTypes}
        connectionMode={ConnectionMode.Loose}
        colorMode="dark"
      >
        <Background />
        {/* Move controls to top-left so they don't collide with the bottom FABs */}
        <Controls position="top-left" />
      </ReactFlow>

      <AddNodeFab onNodeCreated={handleNodeCreated} projectId={projectId} />
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
      {showInspector && (
        <div
          data-testid="graph-debug-panel"
          className="absolute bottom-20 left-4 z-40 max-h-72 w-80 overflow-y-auto rounded-xl border border-border bg-card/95 p-3 shadow-xl backdrop-blur text-xs font-mono"
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="font-semibold text-foreground">Graph Inspector — {nodes.length} nodes · {edges.length} edges</p>
            <button
              type="button"
              aria-label="Export JSON"
              onClick={() => exportGraph(nodes, edges)}
              className="rounded px-2 py-0.5 text-[10px] border border-border text-muted-foreground hover:text-foreground hover:border-primary transition-colors"
            >
              Export JSON
            </button>
          </div>
          {nodes.map((node) => {
            const d = node.data as HeapNodeData
            const handleCount = (d.handles ?? []).length
            return (
              <div key={node.id} className="mb-1 text-muted-foreground">
                <span className="text-foreground">{node.id.slice(0, 8)}</span>
                {' · '}
                <span>{d.shape ?? 'rect'}</span>
                {' · '}
                {d.width != null ? `${Math.round(d.width)}×${Math.round(d.height ?? d.width)}` : 'auto'}
                {' @ '}({Math.round(node.position.x)},{Math.round(node.position.y)})
                {' · '}
                {handleCount}h
              </div>
            )
          })}
          {edges.length > 0 && (
            <>
              <p className="mt-2 mb-1 font-semibold text-foreground">Edges</p>
              {edges.map((edge) => (
                <div key={edge.id} className="text-muted-foreground">
                  {String(edge.source).slice(0, 8)} → {String(edge.target).slice(0, 8)}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
