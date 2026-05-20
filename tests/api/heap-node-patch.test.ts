import { describe, it, expect } from 'vitest'
import { PatchNodeSchema } from '@/app/api/heap/nodes/[id]/route'

describe('PatchNodeSchema text fields', () => {
  it('accepts valid fontFamily', () => {
    expect(PatchNodeSchema.safeParse({ fontFamily: 'serif' }).success).toBe(true)
  })
  it('rejects invalid fontFamily', () => {
    expect(PatchNodeSchema.safeParse({ fontFamily: 'comic-sans' }).success).toBe(false)
  })
  it('accepts valid fontSize', () => {
    expect(PatchNodeSchema.safeParse({ fontSize: 'lg' }).success).toBe(true)
  })
  it('accepts fontBold boolean', () => {
    expect(PatchNodeSchema.safeParse({ fontBold: true }).success).toBe(true)
  })
})
