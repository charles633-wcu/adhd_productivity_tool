'use client'

import { useRouter } from 'next/navigation'
import { AlertTriangle, ChevronRight } from 'lucide-react'

// ReviewBanner — shown at the top of Home when triggers are due for review.
// Exact copy: "You have {N} item{s} that need review soon"
// Returns null when count = 0 (hides itself completely).
interface ReviewBannerProps {
  count: number
}

export function ReviewBanner({ count }: ReviewBannerProps) {
  const router = useRouter()

  // Hide banner when nothing is due
  if (count === 0) return null

  const plural = count === 1 ? 'item' : 'items'

  return (
    <button
      onClick={() => router.push('/review')}
      className="w-full flex items-center justify-between px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 hover:bg-amber-100 transition-colors"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        <span className="text-sm font-medium">
          You have {count} {plural} that need review soon
        </span>
      </div>
      <ChevronRight className="h-4 w-4 text-amber-500" />
    </button>
  )
}
