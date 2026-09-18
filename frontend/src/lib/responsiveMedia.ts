import manifest from './responsiveMediaManifest.json'

const responsiveMedia: Readonly<Record<string, string>> = manifest

export const mediaSizes = '(max-width: 760px) calc(100vw - 40px), (max-width: 1180px) 45vw, 420px'

export function mediaSrcset(src: string): string | undefined {
  const name = Object.hasOwn(responsiveMedia, src) ? responsiveMedia[src] : undefined
  return name ? [320, 640, 960].map((width) => `/media/responsive/${name}-${width}w.webp ${width}w`).join(', ') : undefined
}
