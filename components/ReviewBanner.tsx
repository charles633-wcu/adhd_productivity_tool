'use client'

import { useRouter } from 'next/navigation'
import { ChevronRight } from 'lucide-react'

// ReviewBanner — shown at the top of Home when triggers are due for review.
// Copy: "You have {N} item{s} that need{s} review soon"
// Returns null when count = 0 (hides itself completely).
interface ReviewBannerProps {
  count: number
}

export function ReviewBanner({ count }: ReviewBannerProps) {
  const router = useRouter()

  if (count === 0) return null

  const noun = count === 1 ? 'item' : 'items'
  const verb = count === 1 ? 'needs' : 'need'

  return (
    <button
      type="button"
      onClick={() => router.push('/review')}
      className="group w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10 transition-all duration-200 text-left"
    >
      {/* Pulsing signal dot */}
      <span className="relative flex-shrink-0 flex h-2.5 w-2.5">
        <span className="sentinel-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-60" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
      </span>

      <span className="flex-1 text-sm font-medium text-amber-400">
        You have {count} {noun} that {verb} review soon
      </span>

      <ChevronRight
        className="h-4 w-4 text-amber-500/50 group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all"
        aria-hidden="true"
      />
    </button>
  )
}
