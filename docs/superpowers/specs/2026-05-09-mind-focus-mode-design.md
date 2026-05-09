# Mind Focus Mode and Visual Child Slots - Design Spec

**Date:** 2026-05-09
**Status:** Draft for review

## Goal

Improve the Mind canvas without changing its freeform nature. Normal mode remains a flexible brain dump where every node and edge can be visible. Focus Mode adds a visual reading layer: high-priority nodes and their progressively explored children stay prominent, while unrelated nodes remain dimmed for context.

The feature must not limit linking. A node can still have unlimited real children. Visual child slots only control how many child previews are emphasized on the canvas.

## Current Context

Mind currently stores heap nodes with title, body, type, color, position, shape, width, and height. Nodes can link to other nodes through edges, tasks through `heap_node_todos`, and triggers through `heap_node_triggers`. Circles are already resizable, but other shapes are mostly content-sized. The detail sheet already supports type, color, shape, notes, linked tasks, and linked triggers.

## User Model

### Normal Mode

Normal Mode is the default canvas behavior.

- All nodes and edges render normally.
- The user can drag nodes, connect nodes, open details, link tasks/triggers, change shape/color/type, and resize nodes.
- The canvas can be messy because it is for capture and free association.

### Focus Mode

Focus Mode is a toggle in the Mind canvas toolbar.

- High and critical priority nodes are the initial focus roots.
- Each focused node can reveal a limited number of child previews based on its visual slot capacity.
- Clicking a visible child adds that child to the active focus path and reveals its children.
- Non-focused nodes and unrelated edges remain visible but dimmed.
- A Reset Focus action clears clicked focus path nodes and returns to priority roots.

## Priority

Add a node priority field:

- `low`
- `normal`
- `high`
- `critical`

Default is `normal`.

Priority is manually editable in the node detail sheet. It is visual metadata, not task priority and not trigger priority. Later, computed priority can be added from overdue tasks or trigger urgency, but this version stays manual.

Visual treatment:

- `low`: subdued border and no glow.
- `normal`: current default treatment.
- `high`: stronger border and subtle glow.
- `critical`: largest visual weight, stronger glow, and highest Focus Mode root priority.

## Resizing

All shapes should be user-resizable, not only circles.

- Rectangle: free width/height resize with min size.
- Pill: width resize, height resize allowed but constrained to preserve readable capsule styling.
- Circle: existing aspect-ratio resize stays.
- Diamond: resize by changing the underlying square dimensions, with text counter-rotated as today.

The existing `width` and `height` heap node columns should continue to store dimensions. Null means use the shape default.

## Visual Child Slots

Visual child slots are computed from the node's rendered size and shape. They do not limit how many child edges exist.

Slot capacity rules:

- Rectangle: starts at 2 slots; gains 1 slot per additional 70px of width or 45px of height, capped at 8.
- Pill: starts at 1 slot; gains 1 slot per additional 90px of width, capped at 4.
- Circle: starts at 3 orbit slots; gains 1 slot per additional 40px diameter, capped at 10.
- Diamond: starts at 2 slots; gains 1 slot per additional 50px square size, capped at 6.

If a node has more children than visible slots, show an overflow indicator such as `+5`.

Visible child previews should be selected deterministically:

1. Critical children.
2. High-priority children.
3. Children already in the current focus path.
4. Most recently updated children.
5. Remaining children by stable title/id order.

## Child Preview Rendering

Child previews should render around the parent shape, not inside it.

- Circle: orbit dots/chips around the perimeter.
- Rectangle: small chips along the bottom/right edge.
- Pill: compact chips beneath the pill.
- Diamond: small chips around corners or lower edge.

Each preview shows a short title or initials when space is tight. Preview chips are clickable and keyboard focusable. Clicking a preview in Focus Mode expands that child in the focus path. Clicking a preview in Normal Mode selects/opens the child node without changing mode.

## Focus Mode Rendering Rules

When Focus Mode is off:

- All nodes have full opacity.
- Child preview slots are hidden by default to preserve the brain-dump feel. The node itself may still show compact counts such as linked task count or child count.

When Focus Mode is on:

- Focus roots: nodes with `priority` equal to `high` or `critical`.
- Focus path: nodes clicked through child previews.
- Revealed children: direct children of focus roots and focus path nodes, capped by each parent node's slot capacity.
- Bright nodes: focus roots, focus path nodes, and revealed child nodes.
- Dimmed nodes: every other node, kept at low opacity but still spatially present.
- Bright edges: edges between bright nodes.
- Dimmed edges: all unrelated edges.

If no high or critical nodes exist, Focus Mode should show a lightweight empty state near the toolbar: "Mark nodes high priority to start Focus Mode."

## Controls

Canvas-level controls:

- Focus Mode toggle.
- Reset Focus button, shown only when Focus Mode is on and the focus path is non-empty.
- Count text while Focus Mode is on: `Focused: 4 / 32`.

Node detail controls:

- Priority segmented control or icon buttons.
- Resizable shape hint only when needed, not persistent instructional text.
- Existing color and shape controls remain.

## Data and API Changes

Schema:

- Add `priority` to `heap_nodes`, typed as `low | normal | high | critical`, default `normal`.
- Reuse existing `width` and `height`.

API:

- `POST /api/heap/nodes` accepts optional priority.
- `PATCH /api/heap/nodes/[id]` accepts priority and width/height for all shapes.
- `GET /api/heap/nodes` returns priority and existing dimensions.
- `GET /api/heap/edges` remains the source for node-child relationships.

Client data flow:

- `HeapCanvas` loads nodes and edges.
- A helper derives child lists per node from edges.
- A helper computes slot capacity from node shape and dimensions.
- A helper derives focus visibility state from priority roots, focus path, child slots, and graph edges.

## Testing Requirements

Unit and component tests:

- Heap node schema exposes priority.
- POST and PATCH validation accept valid priority and reject invalid priority.
- `HeapNode` renders priority classes for low/normal/high/critical.
- All four shapes expose resizer behavior or shape-appropriate dimension persistence.
- Slot capacity helper returns expected caps for each shape and size.
- Focus visibility helper returns bright vs dimmed node ids for priority roots, clicked focus path, and overflow children.
- `NodeDetailSheet` patches priority only after successful API response.
- Existing shape/color/title/task/trigger behaviors continue to pass.

Browser or Playwright smoke tests:

- Load `/heap`.
- Create several nodes.
- Set at least two nodes to high/critical.
- Link parent-child relationships.
- Resize a parent and verify more child previews become visible.
- Enable Focus Mode and verify unrelated nodes are dimmed.
- Click a visible child preview and verify its children become bright.
- Reset focus and verify view returns to priority roots.
- Refresh and verify priority and dimensions persist.

## Non-Goals

- No automatic priority computation from todos/triggers in this version.
- No hard cap on real linked children.
- No force-directed layout in this version.
- No deleting or hiding nodes permanently through Focus Mode.
- No global redesign of React Flow canvas controls beyond the Focus Mode controls.

## Open Implementation Notes

- Prefer pure helpers for slot capacity and focus visibility so the behavior is testable without React Flow.
- Keep visual previews lightweight. They should help scanning, not become a second full node renderer.
- Preserve manual canvas layout. Focus Mode should change emphasis, not move nodes automatically in this first version.
