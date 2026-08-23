'use client'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase'

export type Vertical = 'barbershop' | 'salon' | 'tattoo'

export type VerticalLabels = {
  vertical: Vertical
  staffLabel: string
  staffLabelPlural: string
  clientLabel: string
  loading: boolean
}

const DEFAULT_LABELS: VerticalLabels = {
  vertical: 'barbershop',
  staffLabel: 'Barber',
  staffLabelPlural: 'Barbers',
  clientLabel: 'Client',
  loading: false,
}

const VerticalContext = createContext<VerticalLabels>(DEFAULT_LABELS)

// Resolves the current user's shop once, then fetches that shop's
// vertical_config row a single time and exposes it to the whole
// dashboard subtree — individual pages/components should consume
// useVerticalLabels() instead of re-fetching vertical_config themselves.
export function VerticalProvider({ children }: { children: ReactNode }) {
  const [labels, setLabels] = useState<VerticalLabels>({ ...DEFAULT_LABELS, loading: true })
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { if (!cancelled) setLabels({ ...DEFAULT_LABELS, loading: false }); return }

      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()

      let vertical: Vertical | null = null
      if (profile?.role === 'owner') {
        const { data: shop } = await supabase
          .from('shops').select('vertical').eq('owner_id', user.id)
          .order('created_at', { ascending: true }).limit(1).maybeSingle()
        vertical = (shop?.vertical as Vertical) || null
      } else {
        const { data: shopBarber } = await supabase
          .from('shop_barbers').select('shops(vertical)').eq('barber_id', user.id).maybeSingle()
        const shopRow = (shopBarber as any)?.shops
        vertical = (Array.isArray(shopRow) ? shopRow[0]?.vertical : shopRow?.vertical) || null
      }

      if (!vertical) { if (!cancelled) setLabels({ ...DEFAULT_LABELS, loading: false }); return }

      const { data: config } = await supabase
        .from('vertical_config').select('*').eq('vertical', vertical).maybeSingle()

      if (cancelled) return
      setLabels({
        vertical,
        staffLabel: config?.staff_label || DEFAULT_LABELS.staffLabel,
        staffLabelPlural: config?.staff_label_plural || DEFAULT_LABELS.staffLabelPlural,
        clientLabel: config?.client_label || DEFAULT_LABELS.clientLabel,
        loading: false,
      })
    }

    load()
    return () => { cancelled = true }
  }, [supabase])

  return <VerticalContext.Provider value={labels}>{children}</VerticalContext.Provider>
}

export function useVerticalLabels() {
  return useContext(VerticalContext)
}
