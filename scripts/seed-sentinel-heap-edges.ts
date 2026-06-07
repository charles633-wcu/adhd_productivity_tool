/**
 * seed-sentinel-heap-edges.ts
 *
 * Follow-up to seed-sentinel-heap.ts: that script inserted the Sentinel project
 * and its 31 child nodes, but the edge inserts failed because the live DB was
 * missing heap_edges.priority (migration 0014). After adding that column, this
 * script wires up the edges against the nodes that already exist — matched by
 * (projectId, title) so no nodes are duplicated.
 *
 * Run with: npx tsx scripts/seed-sentinel-heap-edges.ts
 */
import { eq } from 'drizzle-orm'
import { getDb } from '../lib/db/client'
import { heapNodes, heapEdges, users } from '../lib/db/schema'

// key → node title (must match the titles inserted by seed-sentinel-heap.ts)
const TITLE_BY_KEY: Record<string, string> = {
  thesis: 'Product thesis: intention → survivable action',
  positioning: 'Positioning: external brain, not a medical device',
  l_capture: 'Capture',
  l_shrink: 'Shrink',
  l_triage: 'Triage',
  l_start: 'Start',
  l_recover: 'Recover',
  s_init: 'Task initiation & follow-through',
  s_wm: 'Working-memory / organizational overload',
  s_time: 'Time perception ("time blindness")',
  s_delay: 'Impulsivity & delay aversion',
  s_emo: 'Emotional dysregulation & overwhelm',
  s_sleep: 'Sleep & energy instability',
  s_setting: 'Impairment across settings & roles',
  p_ext: 'Externalize memory immediately',
  p_donext: 'Turn "remember this" into "do this next"',
  p_mindec: 'Minimize decisions at the moment of action',
  p_recovery: 'Support recovery better than planning',
  p_adaptive: 'Adaptive prompting, not static nagging',
  p_separate: 'Separate storage from activation',
  p_shame: 'Design for shame resilience',
  f_inbox: 'Frictionless brain-dump inbox',
  f_breakdown: '"Make this startable" action breakdown',
  f_queue: 'Triage-based review queue',
  f_reminders: 'Adaptive reminders (escalating specificity)',
  f_recovery: 'Recovery mode',
  f_energy: 'Energy- & sleep-aware planning',
  f_nnl: 'Now / Next / Later views',
  b_primitives: 'Built: capture & review primitives',
  b_systems: 'Built: bigger systems',
  g_avoid: 'Things to avoid',
}

type EdgeSpec = [string, string, string, ('normal' | 'high')?]
const EDGES: EdgeSpec[] = [
  ['positioning', 'thesis', 'frames'],
  ['thesis', 'l_capture', 'drives', 'high'],
  ['l_capture', 'l_shrink', 'then'],
  ['l_shrink', 'l_triage', 'then'],
  ['l_triage', 'l_start', 'then'],
  ['l_start', 'l_recover', 'then'],
  ['l_capture', 'f_inbox', 'needs'],
  ['l_shrink', 'f_breakdown', 'needs'],
  ['l_triage', 'f_queue', 'needs'],
  ['l_start', 'f_reminders', 'needs'],
  ['l_start', 'f_nnl', 'needs'],
  ['l_recover', 'f_recovery', 'needs'],
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
  ['p_ext', 'f_inbox', 'implemented by'],
  ['p_donext', 'f_breakdown', 'implemented by'],
  ['p_mindec', 'f_nnl', 'implemented by'],
  ['p_recovery', 'f_recovery', 'implemented by'],
  ['p_adaptive', 'f_reminders', 'implemented by'],
  ['p_adaptive', 'f_energy', 'implemented by'],
  ['p_separate', 'f_nnl', 'implemented by'],
  ['p_shame', 'f_recovery', 'implemented by'],
  ['f_inbox', 'b_primitives', 'extends'],
  ['f_queue', 'b_primitives', 'extends'],
  ['f_reminders', 'b_primitives', 'extends'],
  ['f_recovery', 'b_primitives', 'extends'],
  ['f_breakdown', 'b_systems', 'extends'],
  ['f_nnl', 'b_systems', 'extends'],
  ['f_energy', 'b_systems', 'extends'],
  ['g_avoid', 'f_reminders', 'guard: not nagging'],
  ['g_avoid', 'f_inbox', 'guard: no granular tags'],
  ['g_avoid', 'f_recovery', 'guard: no shame/streaks'],
]

async function main() {
  const db = getDb()
  const [user] = await db.select().from(users).limit(1)
  if (!user) throw new Error('No user found.')

  // Find the Sentinel project node.
  const allNodes = db.select().from(heapNodes).where(eq(heapNodes.userId, user.id)).all()
  const project = allNodes.find((n) => n.type === 'project' && n.title === 'Sentinel')
  if (!project) throw new Error('Sentinel project node not found — run seed-sentinel-heap.ts first.')

  // Build title → id for this project's children.
  const idByTitle = new Map<string, string>()
  for (const n of allNodes) {
    if (n.projectId === project.id) idByTitle.set(n.title, n.id)
  }

  // Resolve key → id via the title map.
  const idByKey = new Map<string, string>()
  for (const [key, title] of Object.entries(TITLE_BY_KEY)) {
    const id = idByTitle.get(title)
    if (!id) throw new Error(`Missing node for key "${key}" (title: ${title})`)
    idByKey.set(key, id)
  }

  // Skip any edges that already exist (idempotent re-run).
  const existing = new Set(
    db
      .select()
      .from(heapEdges)
      .where(eq(heapEdges.userId, user.id))
      .all()
      .map((e) => `${e.sourceId}->${e.targetId}`),
  )

  let inserted = 0
  let skipped = 0
  for (const [srcKey, tgtKey, label, priority] of EDGES) {
    const sourceId = idByKey.get(srcKey)!
    const targetId = idByKey.get(tgtKey)!
    if (existing.has(`${sourceId}->${targetId}`)) {
      skipped++
      continue
    }
    await db.insert(heapEdges).values({
      userId: user.id,
      sourceId,
      targetId,
      label,
      priority: priority ?? 'normal',
    })
    inserted++
  }

  console.log(`Edges inserted: ${inserted}, skipped (already present): ${skipped}`)
  console.log(`Done. Open /heap → "Sentinel" to view the graph.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
