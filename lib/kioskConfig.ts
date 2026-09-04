// Shared shape + fallback palette for kiosk_config, the owner-facing kiosk
// theming table. Defaults are the existing ChairOS brand colors (see
// app/globals.css --color-od-green and the shop default brand_color) so an
// unconfigured kiosk still renders on-brand instead of unstyled.
export const KIOSK_DEFAULT_PRIMARY = '#4B5320' // od-green
export const KIOSK_DEFAULT_ACCENT = '#B8861F' // ChairOS gold, shops' default brand_color

export type KioskDisplayMode = 'off' | 'queue' | 'slots' | 'both'

export interface KioskConfig {
  shop_id: string
  display_mode: KioskDisplayMode
  primary_color: string | null
  accent_color: string | null
  logo_url: string | null
}

export function resolveKioskTheme(config: Pick<KioskConfig, 'primary_color' | 'accent_color'> | null | undefined) {
  return {
    primary: config?.primary_color || KIOSK_DEFAULT_PRIMARY,
    accent: config?.accent_color || KIOSK_DEFAULT_ACCENT,
  }
}
