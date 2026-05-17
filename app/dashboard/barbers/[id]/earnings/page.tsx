'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import MobileNav from '@/components/MobileNav'

export default function BarberEarnings() {
  const [shop, setShop] = useState<any>(null)
  const [barber, setBarber] = useState<any>(null)
  const [appointments, setAppointments] = useState<any[]>([])
  const [tips, setTips] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(new Date().getFullYear())
  const router = useRouter()
  const params = useParams()
  const barberId = params.id as string
  const supabase = createClient()

  useEffect(() => { loadData() }, [year])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: shops } = await supabase
      .from('shops').select('*').eq('owner_id', user.id)
      .order('created_at', { ascending: true }).limit(1)
    const shop = shops?.[0] || null
    if (!shop) { router.push('/onboarding'); return }
    setShop(shop)

    const { data: barber } = await supabase
      .from('shop_barbers').select('*').eq('id', barberId).maybeSingle()
    setBarber(barber)

    const startDate = `${year}-01-01`
    const endDate = `${year}-12-31`

    const { data: appts } = await supabase
      .from('appointments')
      .select('*, services(*)')
      .eq('shop_id', shop.id)
      .eq('barber_id', barber?.barber_id)
      .eq('status', 'done')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true })
    setAppointments(appts || [])

    const { data: tips } = await supabase
      .from('tips')
      .select('*')
      .eq('shop_id', shop.id)
      .eq('barber_id', barber?.barber_id)
      .gte('created_at', `${year}-01-01`)
      .lte('created_at', `${year}-12-31`)
    setTips(tips || [])

    setLoading(false)
  }

  if (loading) return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
      <div className="text-amber-500 text-sm">Loading...</div>
    </div>
  )

  const totalRevenue = appointments.reduce((sum, a) => sum + (parseFloat(a.price) || 0), 0)
  const barberCut = barber?.compensation_type === 'commission'
    ? totalRevenue * (barber?.commission_rate || 0.7)
    : totalRevenue
  const totalTips = tips.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0)
  const totalEarnings = barberCut + totalTips

  const byMonth = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1
    const monthAppts = appointments.filter(a => new Date(a.date).getMonth() + 1 === month)
    const monthTips = tips.filter(t => new Date(t.created_at).getMonth() + 1 === month)
    const revenue = monthAppts.reduce((sum, a) => sum + (parseFloat(a.price) || 0), 0)
    const cut = barber?.compensation_type === 'commission' ? revenue * (barber?.commission_rate || 0.7) : revenue
    const tipTotal = monthTips.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0)
    return {
      month: new Date(year, i).toLocaleDateString('en-US', { month: 'long' }),
      appointments: monthAppts.length,
      revenue,
      cut,
      tips: tipTotal,
      total: cut + tipTotal
    }
  }).filter(m => m.appointments > 0)

  return (
    <div className="min-h-screen bg-neutral-950">
      <header className="bg-neutral-900 border-b border-neutral-800 px-6 h-14 flex items-center justify-between sticky top-0 z-50 no-print">
        <span className="font-serif text-amber-500 text-lg">ChairOS</span>
        <div className="flex items-center gap-3">
          <button onClick={() => window.print()}
            className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg text-xs transition-colors">
            Print / Save PDF
          </button>
          <button onClick={() => router.push('/dashboard/barbers')} className="text-xs text-neutral-500 hover:text-white transition-colors">← Barbers</button>
        </div>
      </header>

      <div className="p-6 max-w-3xl mx-auto pb-20 md:pb-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-serif text-2xl text-white mb-1">Earnings Statement</h1>
            <p className="text-neutral-500 text-sm">{barber?.barber_name || barber?.alias} · {shop?.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setYear(y => y - 1)}
              className="w-8 h-8 bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-400 hover:text-white transition-colors text-sm">←</button>
            <span className="font-mono text-white font-semibold px-2">{year}</span>
            <button onClick={() => setYear(y => y + 1)}
              disabled={year >= new Date().getFullYear()}
              className="w-8 h-8 bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-400 hover:text-white transition-colors text-sm disabled:opacity-30">→</button>
          </div>
        </div>

        {/* SUMMARY */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 mb-6">
          <div className="text-xs font-semibold tracking-widest uppercase text-neutral-500 mb-4">
            {year} Annual Summary
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Appointments', value: appointments.length.toString(), color: 'text-white' },
              { label: 'Service Revenue', value: `$${barberCut.toFixed(2)}`, color: 'text-white' },
              { label: 'Tips Earned', value: `$${totalTips.toFixed(2)}`, color: 'text-green-400' },
              { label: 'Total Earnings', value: `$${totalEarnings.toFixed(2)}`, color: 'text-amber-500' },
            ].map((stat, i) => (
              <div key={i} className="text-center">
                <div className={`font-serif text-2xl mb-1 ${stat.color}`}>{stat.value}</div>
                <div className="text-xs font-semibold tracking-widest uppercase text-neutral-500">{stat.label}</div>
              </div>
            ))}
          </div>
          {barber?.compensation_type === 'commission' && (
            <div className="mt-4 pt-4 border-t border-neutral-800 text-xs text-neutral-500 text-center">
              Commission rate: {Math.round((barber.commission_rate || 0.7) * 100)}% · Total shop revenue: ${totalRevenue.toFixed(2)}
            </div>
          )}
        </div>

        {/* MONTHLY BREAKDOWN */}
        {byMonth.length > 0 && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden mb-6">
            <div className="px-5 py-4 border-b border-neutral-800">
              <div className="font-serif text-white">Monthly Breakdown</div>
            </div>
            <div className="divide-y divide-neutral-800">
              <div className="grid grid-cols-5 gap-2 px-5 py-2 bg-neutral-800/50">
                {['Month', 'Apts', 'Service Cut', 'Tips', 'Total'].map(h => (
                  <div key={h} className="text-xs font-semibold tracking-widest uppercase text-neutral-500">{h}</div>
                ))}
              </div>
              {byMonth.map((m, i) => (
                <div key={i} className="grid grid-cols-5 gap-2 px-5 py-3 items-center">
                  <div className="text-sm text-white">{m.month}</div>
                  <div className="text-sm text-neutral-400">{m.appointments}</div>
                  <div className="text-sm text-white font-mono">${m.cut.toFixed(2)}</div>
                  <div className="text-sm text-green-400 font-mono">${m.tips.toFixed(2)}</div>
                  <div className="text-sm text-amber-500 font-mono font-semibold">${m.total.toFixed(2)}</div>
                </div>
              ))}
              <div className="grid grid-cols-5 gap-2 px-5 py-3 bg-neutral-800/30">
                <div className="text-xs font-semibold text-neutral-400">TOTAL</div>
                <div className="text-xs font-semibold text-neutral-400">{appointments.length}</div>
                <div className="text-xs font-semibold font-mono text-white">${barberCut.toFixed(2)}</div>
                <div className="text-xs font-semibold font-mono text-green-400">${totalTips.toFixed(2)}</div>
                <div className="text-xs font-semibold font-mono text-amber-500">${totalEarnings.toFixed(2)}</div>
              </div>
            </div>
          </div>
        )}

        {appointments.length === 0 && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-8 text-center text-neutral-500 text-sm">
            No completed appointments found for {year}.
          </div>
        )}
      </div>
      <MobileNav />

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; color: black !important; }
          .bg-neutral-950, .bg-neutral-900, .bg-neutral-800 { background: white !important; }
          .text-white, .text-neutral-400, .text-neutral-500 { color: #333 !important; }
          .border-neutral-800, .border-neutral-700 { border-color: #ddd !important; }
          .text-amber-500 { color: #b8861f !important; }
          .text-green-400 { color: #16a34a !important; }
        }
      `}</style>
    </div>
  )
}
