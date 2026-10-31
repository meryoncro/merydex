export const SITE_HOST = "mcro.fun"
export const APP_HOST = "app.mcro.fun"

export const SITE_URL = `https://${SITE_HOST}`
export const APP_URL = `https://${APP_HOST}`

export function normalizeHost(host: string | null | undefined): string {
  return (host ?? "").split(":")[0].trim().toLowerCase()
}

export function isSiteHost(host: string | null | undefined): boolean {
  const h = normalizeHost(host)
  return h === SITE_HOST || h === `www.${SITE_HOST}`
}

export function isAppHost(host: string | null | undefined): boolean {
  return normalizeHost(host) === APP_HOST
}
