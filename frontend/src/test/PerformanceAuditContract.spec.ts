/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const audit = readFileSync(resolve(process.cwd(), 'scripts/performance-audit.mjs'), 'utf8')
const viewer = readFileSync(resolve(process.cwd(), 'src/components/ThreeExhibitViewer.vue'), 'utf8')

describe('mobile performance audit contract', () => {
  it('accepts the pnpm argument separator used by the documented command', () => {
    expect(audit).toContain("if (argument === '--') continue")
    // Readiness follows the current Explore title, independently of decorative scene selectors.
    expect(audit).toContain("path: '/explore', selector: '.collection-page #collection-title'")
    expect(audit).toContain(".three-fallback[role=\"status\"] button")
    expect(audit).toContain(".three-fallback[role=\"alert\"]")
  })

  it('records first frame only through the post-compile render mark', () => {
    expect(audit).toContain("performance.getEntriesByName('heluo-three-first-frame-ready', 'mark')")
    expect(audit).not.toMatch(/data-render-state=[^\n]+firstFrameAt\s*=/)

    const modelLoaded = viewer.indexOf('artifact = gltf.scene')
    const compile = viewer.indexOf('await renderer.compileAsync(scene, camera)', modelLoaded)
    const render = viewer.indexOf('submitRender()', compile)
    const mark = viewer.indexOf('performance.mark(THREE_FIRST_FRAME_MARK)', render)
    expect(modelLoaded).toBeGreaterThan(-1)
    expect(compile).toBeGreaterThan(modelLoaded)
    expect(render).toBeGreaterThan(compile)
    expect(mark).toBeGreaterThan(render)

    const submission = viewer.indexOf('const submitRender = () =>')
    const actualRender = viewer.indexOf('renderer.render(scene, camera)', submission)
    const countSubmission = viewer.indexOf('renderSubmissions += 1', actualRender)
    expect(submission).toBeGreaterThan(-1)
    expect(actualRender).toBeGreaterThan(submission)
    expect(countSubmission).toBeGreaterThan(actualRender)
  })

  it('actively rotates the solid model for the five-second FPS gate', () => {
    expect(audit).toContain('measureRotatingMobileThree')
    expect(audit).toContain("getAttribute('data-auto-rotate') === 'true'")
    expect(audit).toContain('measureMobileFps(client, 5_000)')
    expect(audit).toContain('threeMedianFps: 45')
    expect(audit).toContain('threeMinimumOneSecondFps: 30')
    expect(audit).toContain('threeMedianFpsBudget')
    expect(audit).toContain('threeFiveSecondFpsFloor')
    expect(audit).toContain('threeRenderLoopRunning')
  })

  it('encodes every final mobile resource budget', () => {
    expect(audit).toContain('homeColdTransferBytes: 1024 * 1024')
    expect(audit).toContain('homeWarmTransferBytes: 150 * 1024')
    expect(audit).toContain('homeRequestCount: 20')
    expect(audit).toContain('homeFontRequestCount: 6')
    expect(audit).toContain('homeFontTransferBytes: 300 * 1024')
    expect(audit).toContain('homeCssTransferBytes: 80 * 1024')
    expect(audit).toContain('homeJsTransferBytes: 180 * 1024')
    expect(audit).toContain('homeImageTransferBytes: 350 * 1024')
    expect(audit).toContain('visibleBlurElements: 2')
    expect(audit).toContain('threePreStartBytes: Math.round(1.2 * 1024 * 1024)')
    expect(audit).toContain('threeAddedBytes: 3 * 1024 * 1024')
    expect(audit).toContain('threeFirstFrameMs: 4_000')
  })

  it('fails route mismatches and verifies cache plus Range policy', () => {
    expect(audit).toContain("path: '/profile', selector: '.auth-page', requiresAuth: true")
    expect(audit).toContain("'not-measured-auth-required'")
    expect(audit).toContain('HELUO_PERF_AUTH_TOKEN')
    expect(audit).toContain("localStorage.setItem('heluo.access-token'")
    expect(audit).toContain('protectedRouteIdentityProvided: Boolean(MOBILE_AUTH_TOKEN)')
    expect(audit).toContain('requestedRoutesReached: fastVisits.every((result) => result.routeReached)')
    expect(audit).toContain('htmlRevalidationHeaders')
    expect(audit).toContain('immutableAssetHeaders')
    expect(audit).toContain('mediaCacheHeaders')
    expect(audit).toContain('apiNoStoreHeaders')
    expect(audit).toContain('range?.status === 206')
    expect(audit).toContain("/^bytes 0-1023\\/\\d+$/i.test(range.contentRange ?? '')")
  })

  it('applies the long-task budget to ordinary routes and writes stable trace names', () => {
    expect(audit).toContain("ordinary.length === fastPairs.filter((pair) => !pair.cold.three).length")
    expect(audit).toContain('ordinary.every((result) => result.metrics.longTasks.maxMs < thresholds.longTaskMaxMsExclusive)')
    expect(audit).toContain("route.path.replace(/^\\/+/, '').replace(/[^a-z0-9]+/gi, '-')")
  })

  it('accepts an intentionally hidden Explore dot field only when its fallback remains opaque', () => {
    expect(audit).toContain("reducedTransparencyDotField.palette === 'opaque'")
    expect(audit).toContain("reducedTransparencyDotField.display === 'none' || reducedTransparencyDotField.state !== 'disabled'")
    expect(audit).toContain("reducedTransparencyDotField.pointerEvents === 'none'")
  })

  it('classifies generated JavaScript filenames without treating an embedded otf substring as a font', () => {
    expect(audit).toContain("resource.type === 'Script'")
    expect(audit).toContain('/\\.(?:woff2?|ttf|otf)$/')
    expect(audit).not.toContain('/font|woff2?|ttf|otf/')
  })
})
