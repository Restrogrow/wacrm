// Which build is live. Values are baked in at build time by next.config.mjs.

export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev'
export const BUILD_COMMIT = process.env.NEXT_PUBLIC_BUILD_COMMIT ?? ''
export const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME ?? ''

/** "23 Oct, 8:10 pm" in IST, or '' when the build time is unknown. */
export function formatBuildTime(iso: string = BUILD_TIME): string {
  const d = new Date(iso)
  if (!iso || Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** "v0.5.0 · a1b2c3d · built 23 Oct, 8:10 pm" */
export function buildLabel(): string {
  const parts = [`v${APP_VERSION}`]
  if (BUILD_COMMIT) parts.push(BUILD_COMMIT)
  const time = formatBuildTime()
  if (time) parts.push(`built ${time}`)
  return parts.join(' · ')
}
