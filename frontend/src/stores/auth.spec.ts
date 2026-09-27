import { describe, expect, it } from 'vitest'
import { safeReturnTo } from './auth'

describe('safeReturnTo', () => {
  it('keeps only internal application paths', () => {
    expect(safeReturnTo('/appointment?slot=3')).toBe('/appointment?slot=3')
    expect(safeReturnTo('//evil.example')).toBe('/profile')
    expect(safeReturnTo('https://evil.example')).toBe('/profile')
    expect(safeReturnTo('/\\\\evil')).toBe('/profile')
  })
})
