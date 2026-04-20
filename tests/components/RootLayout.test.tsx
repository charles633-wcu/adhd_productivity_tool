import { describe, expect, it, vi } from 'vitest'

vi.mock('next/font/google', () => {
  const font = () => ({ variable: 'font-variable' })
  return {
    Syne: font,
    Outfit: font,
    Geist_Mono: font,
  }
})

import RootLayout from '@/app/layout'

describe('RootLayout', () => {
  it('marks the html element to suppress hydration warnings for client-side theme variables', () => {
    const element = RootLayout({ children: null }) as unknown as {
      type: string
      props: Record<string, unknown>
    }

    expect(element.type).toBe('html')
    expect(element.props.suppressHydrationWarning).toBe(true)
  })
})
