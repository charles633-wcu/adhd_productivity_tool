/**
 * seed-sentinel-heap.ts
 *
 * One-off script that builds a "Sentinel" project inside the Mind / Heap
 * knowledge graph, populated from the ADHD product research brief
 * (context/docs/research/2026-04-17-adhd-product-research.md) plus the
 * product framing the user and Claude worked out together.
 *
 * Structure — a logical spine, not three parallel lists:
 *   Struggle → Principle → Feature → What's already built
 * with a core-loop backbone (Capture → Shrink → Triage → Start → Recover)
 * running across the top and guardrail nodes hanging off the features.
 *
 * Nodes are color-coded by build status so "what to do next" is obvious.
 *
 * Idempotent: aborts if a Sentinel project node already exists for the user.
 * Fully reversible: every child shares the Sentinel projectId, so deleting
 * the project node + its children + their edges removes everything.
 *
 * Run with: npx tsx scripts/seed-sentinel-heap.ts
 */
import { eq } from 'drizzle-orm'
import { getDb } from '../lib/db/client'
import { heapNodes, heapEdges, users } from '../lib/db/schema'
import type { HeapNodeType, HeapNodePriority } from '../lib/db/schema'

// ── Palette: one hue per conceptual band, status colors for features ──────────
const COLOR = {
  thesis: '#eab308', // gold — the anchoring goal
  loop: '#14b8a6', // teal — execution backbone
  struggle: '#ef4444', // red — the problems ADHD creates
  principle: '#3b82f6', // blue — design responses
  built: '#22c55e', // green — already shipped
  partial: '#f59e0b', // amber — partially built feature
  planned: '#64748b', // slate — not built yet
  guardrail: '#e11d48', // rose — things to avoid
  positioning: '#6b7280', // gray — framing / guardrail
} as const

// Local node spec — `key` is a stable handle used only to wire edges below.
type NodeSpec = {
  key: string
  type: HeapNodeType
  title: string
  body: string
  color: string
  priority?: HeapNodePriority
  x: number
  y: number
}

// Column x-positions (left → right = problem → solution → shipped)
const X = { thesis: -520, struggle: 0, principle: 440, feature: 880, built: 1320 }
// Vertical step for the 7-deep columns
const ROW = (i: number) => 40 + i * 175

const NODES: NodeSpec[] = [
  // ── Anchoring thesis ────────────────────────────────────────────────────
  {
    key: 'thesis',
    type: 'goal',
    title: 'Product thesis: intention → survivable action',
    body: 'People with ADHD do not just need help remembering. They need help converting intention into immediate, survivable action under real-world distraction, overwhelm, delay aversion, and inconsistent energy.\n\nDesign test: cut features that add setup burden, downgrade features that help memory but not action, prioritize anything that helps users recover after disruption, distrust anything that depends on perfect habits.',
    color: COLOR.thesis,
    priority: 'critical',
    x: X.thesis,
    y: 320,
  },
  {
    key: 'positioning',
    type: 'reference',
    title: 'Positioning: external brain, not a medical device',
    body: 'An AI-supported external brain for people who struggle to remember, start, prioritize, and recover from daily life tasks.\n\nNOT a medical device, NOT a replacement for therapy/medication/coaching, NOT generic productivity with ADHD branding. Never claim to "treat" ADHD — the digital-intervention evidence base is still weak; position as executive-function support.',
    color: COLOR.positioning,
    x: X.thesis,
    y: 600,
  },

  // ── Core loop backbone (top strip) ──────────────────────────────────────
  { key: 'l_capture', type: 'note', title: 'Capture', body: 'Get it out of your head before it disappears. Fragile intention holding: an un-externalized task vanishes under new stimuli.', color: COLOR.loop, x: X.struggle, y: -380 },
  { key: 'l_shrink', type: 'note', title: 'Shrink', body: 'Reduce a vague or oversized intention to one concrete first step. "Deal with insurance" → "find member ID card".', color: COLOR.loop, x: X.principle, y: -380 },
  { key: 'l_triage', type: 'note', title: 'Triage', body: 'Decide what actually matters right now. Surface a tiny number of plausible next actions instead of a wall of backlog.', color: COLOR.loop, x: X.feature, y: -380 },
  { key: 'l_start', type: 'note', title: 'Start', body: 'Lower activation energy enough to begin. Provide an immediate-entry ramp, not just a future schedule.', color: COLOR.loop, x: X.built, y: -380 },
  { key: 'l_recover', type: 'note', title: 'Recover', body: 'Re-enter without shame after falling behind. Missed items route into recovery, not failure states.', color: COLOR.loop, x: X.built + 440, y: -380 },

  // ── ADHD struggles (red column) ─────────────────────────────────────────
  { key: 's_init', type: 'note', title: 'Task initiation & follow-through', body: 'Often know what to do but struggle to begin, sequence, and finish. Reminders alone are not enough — every item should reduce to a concrete first step.', color: COLOR.struggle, x: X.struggle, y: ROW(0) },
  { key: 's_wm', type: 'note', title: 'Working-memory / organizational overload', body: 'Fragile intention holding: ideas, commitments, and multi-step plans drop out if not externalized fast. Fast capture beats rich input.', color: COLOR.struggle, x: X.struggle, y: ROW(1) },
  { key: 's_time', type: 'note', title: 'Time perception ("time blindness")', body: 'Impaired time estimation, especially in adults. "Later" is too weak — vague time must become visible urgency, countdowns, and review windows.', color: COLOR.struggle, x: X.struggle, y: ROW(2) },
  { key: 's_delay', type: 'note', title: 'Impulsivity & delay aversion', body: 'Difficulty tolerating delay; preference for immediate relief over future payoff. Long setup flows fail; reduce waiting and friction.', color: COLOR.struggle, x: X.struggle, y: ROW(3) },
  { key: 's_emo', type: 'note', title: 'Emotional dysregulation & overwhelm', body: 'A core feature of adult ADHD. Missed tasks trigger shame, avoidance, or panic — not neutral failure. Avoid punitive framing.', color: COLOR.struggle, x: X.struggle, y: ROW(4) },
  { key: 's_sleep', type: 'note', title: 'Sleep & energy instability', body: 'Sleep problems affect up to ~70% of adults with ADHD. Cognitive capacity varies day to day — do not assume stable energy.', color: COLOR.struggle, x: X.struggle, y: ROW(5) },
  { key: 's_setting', type: 'note', title: 'Impairment across settings & roles', body: 'ADHD affects home, school, work, and relationships. Support multiple life domains; do not assume a standard knowledge-worker workday.', color: COLOR.struggle, x: X.struggle, y: ROW(6) },

  // ── Design principles (blue column) ─────────────────────────────────────
  { key: 'p_ext', type: 'note', title: 'Externalize memory immediately', body: 'Make it trivial to capture tasks, commitments, ideas, worries, errands, follow-ups. If capture takes too long, the system loses.', color: COLOR.principle, x: X.principle, y: ROW(0) },
  { key: 'p_donext', type: 'note', title: 'Turn "remember this" into "do this next"', body: 'The AI layer specializes in action decomposition — converting intentions into a startable first step.', color: COLOR.principle, x: X.principle, y: ROW(1) },
  { key: 'p_mindec', type: 'note', title: 'Minimize decisions at the moment of action', body: 'Choice overload is expensive. Surface a very small number of next actions based on urgency, context, effort, energy, and blocked state.', color: COLOR.principle, x: X.principle, y: ROW(2) },
  { key: 'p_recovery', type: 'note', title: 'Support recovery better than planning', body: 'Users will not follow yesterday’s plan — that is normal. Be strongest at "what now?", "I missed everything, help me recover", "triage this".', color: COLOR.principle, x: X.principle, y: ROW(3) },
  { key: 'p_adaptive', type: 'note', title: 'Adaptive prompting, not static nagging', body: 'Identical reminders become wallpaper. Vary by urgency, prior dismissals, time of day, energy state, and recent progress.', color: COLOR.principle, x: X.principle, y: ROW(4) },
  { key: 'p_separate', type: 'note', title: 'Separate storage from activation', body: 'Store everything safely, but keep only a tiny subset active: broad capture/inbox → focused now/next → review → archive/reference.', color: COLOR.principle, x: X.principle, y: ROW(5) },
  { key: 'p_shame', type: 'note', title: 'Design for shame resilience', body: 'Tone is direct and supportive, never scolding. A user can fall off for a week and return without facing a wall of failure.', color: COLOR.principle, x: X.principle, y: ROW(6) },

  // ── Feature opportunities (status-colored, task_cluster) ────────────────
  { key: 'f_inbox', type: 'task_cluster', title: 'Frictionless brain-dump inbox', body: 'PARTIAL — extends QuickAddForm. One-field capture of messy text; AI later classifies into task / reminder / note / follow-up / idea / worry and suggests category, urgency, and first action.', color: COLOR.partial, priority: 'high', x: X.feature, y: ROW(0) },
  { key: 'f_breakdown', type: 'task_cluster', title: '"Make this startable" action breakdown', body: 'PLANNED — each item generates: first step, 5-minute version, "if stuck, do this", and blockers. User picks start / snooze / break down / delegate / park. Stronger than a plain summary because it drives action.', color: COLOR.planned, priority: 'high', x: X.feature, y: ROW(1) },
  { key: 'f_queue', type: 'task_cluster', title: 'Triage-based review queue', body: 'PARTIAL — evolves /review. Sorts by urgency, effort, and decay risk; asks what is truly due, what can move, what needs a tiny starter. Offers recovery mode when the queue is blown up.', color: COLOR.partial, x: X.feature, y: ROW(2) },
  { key: 'f_reminders', type: 'task_cluster', title: 'Adaptive reminders (escalating specificity)', body: 'PLANNED — notificationDispatch is currently a no-op hook. Early "this is coming up" → "open the form now" → "do the 2-minute starter" → missed: "reschedule or break down?". Stateful prompt strategy, not static timing.', color: COLOR.planned, x: X.feature, y: ROW(3) },
  { key: 'f_recovery', type: 'task_cluster', title: 'Recovery mode', body: 'PLANNED — likely highest-ROI addition. "I dropped the ball" button re-triages the backlog into must-do / should-reschedule / safe-to-defer / probably-no-longer-relevant. Explicitly non-punitive language.', color: COLOR.planned, priority: 'critical', x: X.feature, y: ROW(4) },
  { key: 'f_energy', type: 'task_cluster', title: 'Energy- & sleep-aware planning', body: 'PLANNED — user marks state (low focus / wired / tired / overwhelmed); suggestions adapt. Supports low-energy actions and evening shutdown routines. Starts as simple self-report, no wearables.', color: COLOR.planned, x: X.feature, y: ROW(5) },
  { key: 'f_nnl', type: 'task_cluster', title: 'Now / Next / Later views', body: 'PLANNED — Now: 1–3 active tasks. Next: short queue. Later: everything else. Complements categories instead of replacing them; distinguishes active from stored work.', color: COLOR.planned, x: X.feature, y: ROW(6) },

  // ── Already built (green reference) ─────────────────────────────────────
  { key: 'b_primitives', type: 'reference', title: 'Built: capture & review primitives', body: 'Already shipped and reusable: quick capture (QuickAddForm), categories, trigger priority, spaced review (/review), notes, AI summarization, and the due/review queue. These are the foundation the ADHD features extend.', color: COLOR.built, x: X.built, y: 280 },
  { key: 'b_systems', type: 'reference', title: 'Built: bigger systems', body: 'Already shipped: Calendar (RRULE recurrence), To-do lists, the Mind / Heap knowledge graph + Projects (this canvas), Notion one-way sync + CSV backup, and the Jarvis chat agent. Action-decomposition can build on summarization + Jarvis.', color: COLOR.built, x: X.built, y: 620 },

  // ── Guardrails (rose) ───────────────────────────────────────────────────
  { key: 'g_avoid', type: 'note', title: 'Things to avoid', body: 'Too much setup before first value · overly granular category/tag systems · punitive streaks or "you failed again" framing · endless push notifications with no action support · gamification that becomes another distraction loop · claims the app "treats" ADHD · generic AI advice not grounded in the real task list · systems that require perfect consistency.', color: COLOR.guardrail, priority: 'high', x: X.built, y: 960 },
]

// ── Edges: [sourceKey, targetKey, label, priority?] ─────────────────────────
type EdgeSpec = [string, string, string, ('normal' | 'high')?]
const EDGES: EdgeSpec[] = [
  // Framing
  ['positioning', 'thesis', 'frames'],
  // Core loop backbone
  ['thesis', 'l_capture', 'drives', 'high'],
  ['l_capture', 'l_shrink', 'then'],
  ['l_shrink', 'l_triage', 'then'],
  ['l_triage', 'l_start', 'then'],
  ['l_start', 'l_recover', 'then'],
  // Loop stage → the feature that delivers it
  ['l_capture', 'f_inbox', 'needs'],
  ['l_shrink', 'f_breakdown', 'needs'],
  ['l_triage', 'f_queue', 'needs'],
  ['l_start', 'f_reminders', 'needs'],
  ['l_start', 'f_nnl', 'needs'],
  ['l_recover', 'f_recovery', 'needs'],
  // Struggle → principle that answers it
  ['s_init', 'p_donext', 'calls for'],
  ['s_init', 'p_mindec', 'calls for'],
  ['s_wm', 'p_ext', 'calls for'],
  ['s_wm', 'p_separate', 'calls for'],
  ['s_time', 'p_adaptive', 'calls for'],
  ['s_delay', 'p_mindec', 'calls for'],
  ['s_emo', 'p_recovery', 'calls for'],
  ['s_emo', 'p_shame', 'calls for'],
  ['s_sleep', 'p_adaptive', 'calls for'],
  ['s_setting', 'p_separate', 'calls for'],
  // Principle → feature that implements it
  ['p_ext', 'f_inbox', 'implemented by'],
  ['p_donext', 'f_breakdown', 'implemented by'],
  ['p_mindec', 'f_nnl', 'implemented by'],
  ['p_recovery', 'f_recovery', 'implemented by'],
  ['p_adaptive', 'f_reminders', 'implemented by'],
  ['p_adaptive', 'f_energy', 'implemented by'],
  ['p_separate', 'f_nnl', 'implemented by'],
  ['p_shame', 'f_recovery', 'implemented by'],
  // Feature → built primitive it extends
  ['f_inbox', 'b_primitives', 'extends'],
  ['f_queue', 'b_primitives', 'extends'],
  ['f_reminders', 'b_primitives', 'extends'],
  ['f_recovery', 'b_primitives', 'extends'],
  ['f_breakdown', 'b_systems', 'extends'],
  ['f_nnl', 'b_systems', 'extends'],
  ['f_energy', 'b_systems', 'extends'],
  // Guardrails → the features they constrain
  ['g_avoid', 'f_reminders', 'guard: not nagging'],
  ['g_avoid', 'f_inbox', 'guard: no granular tags'],
  ['g_avoid', 'f_recovery', 'guard: no shame/streaks'],
]

async function main() {
  const db = getDb()

  // Resolve the single MVP user.
  const [user] = await db.select().from(users).limit(1)
  if (!user) {
    console.error('No user found. Run `npm run db:seed` first.')
    process.exit(1)
  }

  // Guard against double-runs: bail if a Sentinel project already exists.
  const existingProjects = db
    .select()
    .from(heapNodes)
    .where(eq(heapNodes.userId, user.id))
    .all()
    .filter((n) => n.type === 'project' && n.title === 'Sentinel')
  if (existingProjects.length > 0) {
    console.error(
      `A "Sentinel" project node already exists (id=${existingProjects[0].id}). ` +
        'Delete it (and its children) before re-seeding.',
    )
    process.exit(1)
  }

  // 1. Create the project container node.
  const [project] = await db
    .insert(heapNodes)
    .values({
      userId: user.id,
      type: 'project',
      title: 'Sentinel',
      body: 'ADHD execution-support system — an external brain that helps capture, shrink, triage, start, and recover. Map of the product vision, the struggles it answers, the design principles, the feature roadmap, and what is already built.',
      color: COLOR.thesis,
      priority: 'high',
      posX: 0,
      posY: 0,
    })
    .returning()
  console.log(`Created project node: ${project.title} (${project.id})`)

  // 2. Insert all child nodes, recording key → generated id for edge wiring.
  const idByKey = new Map<string, string>()
  for (const n of NODES) {
    const [row] = await db
      .insert(heapNodes)
      .values({
        userId: user.id,
        type: n.type,
        title: n.title,
        body: n.body,
        color: n.color,
        priority: n.priority ?? 'normal',
        posX: n.x,
        posY: n.y,
        projectId: project.id,
      })
      .returning()
    idByKey.set(n.key, row.id)
  }
  console.log(`Inserted ${NODES.length} child nodes.`)

  // 3. Insert edges by resolving keys to ids.
  let edgeCount = 0
  for (const [srcKey, tgtKey, label, priority] of EDGES) {
    const sourceId = idByKey.get(srcKey)
    const targetId = idByKey.get(tgtKey)
    if (!sourceId || !targetId) {
      console.warn(`Skipping edge ${srcKey} → ${tgtKey}: unknown key.`)
      continue
    }
    await db.insert(heapEdges).values({
      userId: user.id,
      sourceId,
      targetId,
      label,
      priority: priority ?? 'normal',
    })
    edgeCount++
  }
  console.log(`Inserted ${edgeCount} edges.`)
  console.log(`\nDone. Open /heap and click the "Sentinel" project to view it.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
