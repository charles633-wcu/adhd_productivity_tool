// Notification dispatch service — sends review reminders when triggers are due.
// Lives in its own file (separate from reviewClock.ts timing logic).
// AGENT HOOK 2: Replace this no-op with an agent that sends external notifications.
// Contract: receives a full NotificationTrigger object, returns void, throws on failure.
// Dispatch is fire-and-forget from the caller's perspective (not awaited in UI path).
// notify_channel field on the trigger determines the delivery method.
// Future agent: replace function body only — signature must not change.

// Subset of Trigger fields required for notification dispatch.
// summaryStatus allows the agent to gate on whether a summary exists before including it.
export type NotificationTrigger = {
  id: string
  title: string
  summary: string | null
  summaryStatus: 'pending' | 'generated' | 'manual'
  nextReviewAt: Date
  notifyChannel: 'email' | 'sms' | 'push' | null
}

/**
 * Dispatches a review notification for a trigger.
 * MVP: in-app only — logs to console, does nothing else.
 * Replace this body when wiring real notification channels.
 * @param trigger - Trigger identification, summary state, review time, and delivery channel.
 * @returns A promise resolving after dispatch handling completes.
 */
export async function dispatchReviewNotification(trigger: NotificationTrigger): Promise<void> {
  // MVP no-op: log only — external channels not yet wired
  console.log(
    `[AGENT HOOK] Review notification for trigger ${trigger.id} — channel: ${trigger.notifyChannel ?? 'in-app'}`
  )
}
