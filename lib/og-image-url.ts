export const PATCHWRK_OG_SLUG = 'patchwrk-260815'
export const PATCHWRK_OG_CACHE_VERSION = '6'

export function buildOgImageUrl(baseUrl: string, slug: string, existingVersion?: string): string {
  const version = slug === PATCHWRK_OG_SLUG ? PATCHWRK_OG_CACHE_VERSION : existingVersion
  const cacheBust = version ? `?v=${version}` : ''

  return `${baseUrl}/api/og-image/${slug}${cacheBust}`
}
