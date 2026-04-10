import { describe, it, expect } from 'vitest'
import { dispatchReviewNotification } from '@/lib/services/notificationDispatch'
import type { NotificationTrigger } from '@/lib/services/notificationDispatch'

const mockTrigger: NotificationTrigger = {
  id: 'abc123',
  title: 'Review project notes',
  summary: 'Check NFL dashboard auth',
  summaryStatus: 'generated',
  nextReviewAt: new Date(),
  notifyChannel: null,
}

describe('dispatchReviewNotification', () => {
  it('resolves without throwing for a valid trigger', async () => {
    await expect(dispatchReviewNotification(mockTrigger)).resolves.toBeUndefined()
  })

  it('is a no-op in MVP — does not throw even with email channel', async () => {
    const emailTrigger = { ...mockTrigger, notifyChannel: 'email' as const }
    await expect(dispatchReviewNotification(emailTrigger)).resolves.toBeUndefined()
  })
})
