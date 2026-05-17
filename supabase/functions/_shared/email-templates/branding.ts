// OOP tenant branding resolver for auth emails.
// Given a confirmation/redirect URL, determines which tenant (club) the auth
// action originated from and returns the appropriate logo + display name.
// Falls back to the platform (SquashHub) brand when the URL points to the
// root/parent domain or the subdomain cannot be resolved to a known club.

import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2'

export interface TenantBrand {
  logoUrl: string
  displayName: string
  // Marketing-safe site URL (homepage) for the tenant or platform.
  siteUrl: string
  // True when we are falling back to the SquashHub platform brand.
  isPlatform: boolean
  // The resolved subdomain (e.g. "csi") or null for platform-level.
  subdomain: string | null
}

export const PLATFORM_BRAND: TenantBrand = {
  logoUrl:
    'https://bzbuppwzljadulwntjys.supabase.co/storage/v1/object/public/club-logos/_platform/squashhub-logo.png',
  displayName: 'SquashHub',
  siteUrl: 'https://squashhub.co.za',
  isPlatform: true,
  subdomain: null,
}

// Subdomains that should never be treated as a tenant (platform-level hosts).
const RESERVED_SUBDOMAINS = new Set([
  '',
  'www',
  'app',
  'admin',
  'api',
  'auth',
  'reg',
  'mail',
  'noreply',
  'no-reply',
])

export class TenantBrandingResolver {
  private readonly rootDomain: string
  private readonly supabase: SupabaseClient
  private readonly cache = new Map<string, TenantBrand>()

  constructor(rootDomain: string, supabase?: SupabaseClient) {
    this.rootDomain = rootDomain.toLowerCase().replace(/^\./, '')
    this.supabase =
      supabase ??
      createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      )
  }

  /** Extract the tenant subdomain from a full URL, or null if platform-level. */
  extractSubdomain(rawUrl: string | null | undefined): string | null {
    if (!rawUrl) return null
    let host: string
    try {
      host = new URL(rawUrl).hostname.toLowerCase()
    } catch {
      return null
    }

    // Strip the root domain suffix.
    if (host === this.rootDomain) return null
    const suffix = `.${this.rootDomain}`
    if (!host.endsWith(suffix)) return null

    const sub = host.slice(0, -suffix.length)
    // Only consider single-label subdomains (e.g. "csi"), ignore nested ones
    // like "preview.csi" by taking the left-most label.
    const firstLabel = sub.split('.').pop() ?? ''
    if (RESERVED_SUBDOMAINS.has(firstLabel)) return null
    return firstLabel || null
  }

  /** Resolve branding for a given URL. Always returns a TenantBrand. */
  async resolveFromUrl(rawUrl: string | null | undefined): Promise<TenantBrand> {
    const subdomain = this.extractSubdomain(rawUrl)
    if (!subdomain) return PLATFORM_BRAND
    return this.resolveBySubdomain(subdomain)
  }

  /** Resolve branding by subdomain with in-memory caching. */
  async resolveBySubdomain(subdomain: string): Promise<TenantBrand> {
    const key = subdomain.toLowerCase()
    const cached = this.cache.get(key)
    if (cached) return cached

    try {
      const { data, error } = await this.supabase
        .from('clubs')
        .select('subdomain, name, logo_url')
        .eq('subdomain', key)
        .maybeSingle()

      if (error || !data) {
        this.cache.set(key, PLATFORM_BRAND)
        return PLATFORM_BRAND
      }

      const brand: TenantBrand = {
        logoUrl: data.logo_url || PLATFORM_BRAND.logoUrl,
        displayName: data.name || PLATFORM_BRAND.displayName,
        siteUrl: `https://${data.subdomain}.${this.rootDomain}`,
        isPlatform: false,
        subdomain: data.subdomain,
      }
      this.cache.set(key, brand)
      return brand
    } catch (err) {
      console.warn('[TenantBrandingResolver] lookup failed, falling back', {
        subdomain: key,
        error: err instanceof Error ? err.message : String(err),
      })
      this.cache.set(key, PLATFORM_BRAND)
      return PLATFORM_BRAND
    }
  }
}
