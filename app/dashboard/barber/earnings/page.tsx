'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import BarberMobileNav from '@/components/BarberMobileNav'

export default function BarberEarningsHistory() {
  const [shopBarber, setShopBarber] = useState<any>(null)
  const [appointments, setAppointments] = useState<any[]>([])
  const [tips, setTips] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState<any>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { loadData() }, [year])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: shopBarber } = await supabase
      .from('shop_barbers').select('*, shops(*)')
      .eq('barber_id', user.id).eq('active', true).single()
    if (!shopBarber) { router.push('/join'); return }
    setShopBarber(shopBarber)

    const { data: appts } = await supabase
      .from('appointments')
      .select('*, services(*)')
      .eq('barber_id', user.id)
      .eq('status', 'done')
      .gte('date', `${year}-01-01`)
      .lte('date', `${year}-12-31`)
      .order('date', { ascending: false })
    setAppointments(appts || [])

    const { data: tips } = await supabase
      .from('tips')
      .select('*')
      .eq('barber_id', user.id)
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
  const barberCut = shopBarber?.compensation_type === 'commission'
    ? totalRevenue * (shopBarber?.commission_rate || 0.7)
    : totalRevenue
  const totalTips = tips.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0)

  const byMonth = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1
    const monthAppts = appointments.filter(a => new Date(a.date).getMonth() + 1 === month)
    const monthTips = tips.filter(t => new Date(t.created_at).getMonth() + 1 === month)
    const revenue = monthAppts.reduce((sum, a) => sum + (parseFloat(a.price) || 0), 0)
    const cut = shopBarber?.compensation_type === 'commission' ? revenue * (shopBarber?.commission_rate || 0.7) : revenue
    const tipTotal = monthTips.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0)
    return {
      month: new Date(year, i).toLocaleDateString('en-US', { month: 'short' }),
      appointments: monthAppts.length,
      cut,
      tips: tipTotal,
      total: cut + tipTotal
    }
  }).filter(m => m.appointments > 0)

  const color = shopBarber?.color || '#b8861f'

  return (
    <div className="min-h-screen bg-neutral-950">
      <header className="bg-neutral-900 border-b border-neutral-800 px-6 h-14 flex items-center justify-between sticky top-0 z-50">
        <span className="font-serif text-amber-500 text-lg">ChairOS</span>
        <button onClick={() => router.push('/dashboard/barber')} className="text-xs text-neutral-500 hover:text-white transition-colors">← Dashboard</button>
      </header>

      <div className="p-6 max-w-2xl mx-auto pb-24">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-serif text-2xl text-white mb-1">My Earnings</h1>
            <p className="text-neutral-500 text-sm">{shopBarber?.shops?.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setYear(y => y - 1)}
              className="w-8 h-8 bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-400 hover:text-white text-sm">←</button>
            <span className="font-mono text-white font-semibold">{year}</span>
            <button onClick={() => setYear(y => y + 1)}
              disabled={year >= new Date().getFullYear()}
              className="w-8 h-8 bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-400 hover:text-white text-sm disabled:opacity-30">→</button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Appointments', value: appointments.length.toString(), color: 'text-white' },
            { label: 'My Cut', value: `$${barberCut.toFixed(2)}`, color: 'text-white' },
            { label: 'Tips', value: `$${totalTips.toFixed(2)}`, color: 'text-green-400' },
          ].map((s, i) => (
            <div key={i} className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 text-center">
              <div className={`font-serif text-2xl mb-1 ${s.color}`}>{s.value}</div>
              <div className="text-xs font-semibold tracking-widest uppercase text-neutral-500">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 mb-6 text-center">
          <div className="text-xs font-semibold tracking-widest uppercase text-neutral-500 mb-1">Total {year} Earnings</div>
          <div className="font-serif text-4xl mb-1" style={{ color }}>${(barberCut + totalTips).toFixed(2)}</div>
        </div>

        {byMonth.length > 0 && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-800 font-serif text-white">By Month</div>
            <div className="divide-y divide-neutral-800">
              {byMonth.map((m, i) => (
                <div key={i} className="px-5 py-3 flex items-center justify-between cursor-pointer hover:bg-neutral-800/50 transition-colors" onClick={() => setSelectedMonth(m)}>
                  <div>
                    <div className="text-sm text-white font-medium">{m.month}</div>
                    <div className="text-xs text-neutral-500">{m.appointments} appointments</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-mono font-semibold" style={{ color }}>${m.total.toFixed(2)}</div>
                    <div className="text-xs text-neutral-500">+ ${m.tips.toFixed(2)} tips</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {appointments.length === 0 && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-8 text-center text-neutral-500 text-sm">
            No completed appointments in {year}.
          </div>
        )}
      </div>
      {selectedMonth && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-4"
          onClick={() => setSelectedMonth(null)}>
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-md p-6"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div className="font-serif text-lg text-white">{selectedMonth.month} {year}</div>
              <button onClick={() => setSelectedMonth(null)} className="text-neutral-500 hover:text-white text-xl">×</button>
            </div>
            <div className="space-y-3">
              {[
                { label: 'Appointments', value: selectedMonth.appointments },
                { label: 'Service Cut', value: `$${selectedMonth.cut.toFixed(2)}` },
                { label: 'Tips', value: `$${selectedMonth.tips.toFixed(2)}` },
                { label: 'Total', value: `$${selectedMonth.total.toFixed(2)}` },
              ].map((row, i) => (
                <div key={i} className="flex justify-between items-center py-2 border-b border-neutral-800 last:border-0">
                  <span className="text-xs font-semibold tracking-widest uppercase text-neutral-500">{row.label}</span>
                  <span className={`text-sm font-mono font-semibold ${i === 3 ? 'text-amber-500' : 'text-white'}`}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <BarberMobileNav />
    </div>
  )
}
