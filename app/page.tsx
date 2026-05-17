
'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function LandingPage() {
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [joined, setJoined] = useState(false)
  const [emailError, setEmailError] = useState(false)
  const revenueRef = useRef<HTMLDivElement>(null)
  const tipsRef = useRef<HTMLDivElement>(null)
  const lockedRef = useRef<HTMLDivElement>(null)
  const atRiskRef = useRef<HTMLDivElement>(null)
  const floatingRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function checkAuth() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) router.push('/dashboard')
    }
    checkAuth()
  }, [])

  useEffect(() => {
    function animateCounter(el: HTMLElement, target: number, prefix: string, duration: number) {
      let start = 0
      const step = target / (duration / 16)
      const timer = setInterval(() => {
        start += step
        if (start >= target) { start = target; clearInterval(timer) }
        el.textContent = prefix + Math.round(start).toLocaleString()
      }, 16)
    }

    function animateNum(el: HTMLElement, target: number, duration: number) {
      let start = 0
      const step = target / (duration / 16)
      const timer = setInterval(() => {
        start += step
        if (start >= target) { start = target; clearInterval(timer) }
        el.textContent = String(Math.round(start))
      }, 16)
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const el = entry.target as HTMLElement
          el.style.opacity = '1'
          el.style.transform = 'translateY(0)'
          if (el.dataset.animate === 'revenue' && revenueRef.current) {
            setTimeout(() => animateCounter(revenueRef.current!, 485, '$', 1200), 200)
            setTimeout(() => animateCounter(tipsRef.current!, 64, '$', 1000), 400)
          }
          if (el.dataset.animate === 'lock') {
            setTimeout(() => animateNum(lockedRef.current!, 24, 800), 200)
            setTimeout(() => animateNum(atRiskRef.current!, 4, 600), 400)
            setTimeout(() => animateNum(floatingRef.current!, 3, 400), 600)
          }
          observer.unobserve(el)
        }
      })
    }, { threshold: 0.15 })

    document.querySelectorAll('[data-anim]').forEach(el => {
      const e = el as HTMLElement
      e.style.opacity = '0'
      e.style.transform = 'translateY(16px)'
      e.style.transition = 'opacity 0.5s ease, transform 0.5s ease'
      observer.observe(e)
    })

    return () => observer.disconnect()
  }, [])

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  function handleJoin() {
    if (!email || !email.includes('@')) { setEmailError(true); return }
    setEmailError(false)
    setJoined(true)
  }

  return (
    <div style={{ background: '#0f0e0d', minHeight: '100vh', fontFamily: "-apple-system, 'Helvetica Neue', sans-serif", color: '#f5f0e8', overflowX: 'hidden' }}>

      {/* NAV */}
      <nav style={{ background: '#0f0e0d', borderBottom: '0.5px solid #2a2825', padding: '0 24px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ fontSize: '22px', letterSpacing: '-0.5px', fontWeight: 400 }}>
          Chair<span style={{ color: '#f59e0b' }}>OS</span>
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <button onClick={() => router.push('/login')} style={{ fontSize: '13px', color: '#4a4845', background: 'none', border: 'none', cursor: 'pointer' }}>Sign in</button>
          <button onClick={() => scrollTo('waitlist')} style={{ background: '#f59e0b', color: '#000', fontSize: '13px', fontWeight: 700, padding: '8px 18px', borderRadius: '8px', border: 'none', cursor: 'pointer' }}>
            Join waitlist
          </button>
        </div>
      </nav>

      {/* HERO */}
      <div style={{ padding: '80px 24px 60px', textAlign: 'center', maxWidth: '680px', margin: '0 auto' }}>
        <div data-anim style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#1e1a0a', border: '0.5px solid #3d3010', color: '#f59e0b', fontSize: '11px', fontWeight: 600, padding: '5px 12px', borderRadius: '20px', marginBottom: '24px', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#f59e0b', display: 'inline-block', animation: 'pulse 2s infinite' }} />
          Founding member spots open — 30-day free trial
        </div>
        <div data-anim style={{ fontSize: 'clamp(36px, 8vw, 52px)', lineHeight: 1.1, fontWeight: 400, letterSpacing: '-1.5px', marginBottom: '16px' }}>
          The OS for<br /><span style={{ color: '#f59e0b' }}>barbershop owners.</span>
        </div>
        <div data-anim style={{ fontSize: '18px', color: '#6b6760', lineHeight: 1.6, marginBottom: '32px', maxWidth: '480px', margin: '0 auto 32px' }}>
          Manage bookings, retain your barbers, and track every dollar — all in one place. Built by someone who's been behind the chair.
        </div>
        <div data-anim style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' as const, marginBottom: '32px' }}>
          <button onClick={() => scrollTo('waitlist')} style={{ background: '#f59e0b', color: '#000', fontSize: '15px', fontWeight: 700, padding: '14px 28px', borderRadius: '10px', border: 'none', cursor: 'pointer' }}>
            Start free trial — 30 days
          </button>
          <button onClick={() => scrollTo('features')} style={{ background: 'transparent', color: '#f5f0e8', fontSize: '15px', fontWeight: 500, padding: '14px 28px', borderRadius: '10px', border: '0.5px solid #3a3733', cursor: 'pointer' }}>
            See how it works
          </button>
        </div>
        <div data-anim style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', flexWrap: 'wrap' as const }}>
          {['No credit card required', 'Built for shop owners', 'Cancel anytime'].map((t, i) => (
            <span key={i} style={{ fontSize: '12px', color: '#4a4845' }}>{t}</span>
          ))}
        </div>
      </div>

      {/* DASHBOARD PREVIEW */}
      <div data-anim data-animate="revenue" style={{ background: '#1a1917', border: '0.5px solid #2a2825', borderRadius: '16px', margin: '0 24px 60px', overflow: 'hidden', maxWidth: '632px', marginLeft: 'auto', marginRight: 'auto' }}>
        <div style={{ background: '#141312', borderBottom: '0.5px solid #2a2825', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          {['#ff5f57','#ffbd2e','#28ca41'].map((c, i) => <div key={i} style={{ width: '10px', height: '10px', borderRadius: '50%', background: c }} />)}
          <span style={{ fontSize: '11px', color: '#4a4845', marginLeft: '8px', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>Owner dashboard — live</span>
        </div>
        <div style={{ padding: '20px' }}>
          <div style={{ fontSize: '16px', color: '#f5f0e8', marginBottom: '8px' }}>Good morning, Bear.</div>
          <div ref={revenueRef} style={{ fontSize: '44px', color: '#f59e0b', fontWeight: 400, letterSpacing: '-2px', lineHeight: 1 }}>$0</div>
          <div style={{ fontSize: '11px', color: '#4a4845', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginTop: '4px', marginBottom: '16px' }}>Today's revenue</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '16px' }}>
            {[
              { ref: tipsRef, val: '$0', color: '#7caf5a', label: 'Tips' },
              { val: '6', color: '#f5f0e8', label: 'Bookings' },
              { val: '0%', color: '#c45a5a', label: 'No-shows' },
            ].map((t, i) => (
              <div key={i} style={{ background: '#141312', border: '0.5px solid #2a2825', borderRadius: '10px', padding: '12px', textAlign: 'center' as const }}>
                <div ref={i === 0 ? tipsRef : undefined} style={{ fontSize: '20px', color: t.color, fontWeight: 400 }}>{t.val}</div>
                <div style={{ fontSize: '10px', color: '#4a4845', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginTop: '3px' }}>{t.label}</div>
              </div>
            ))}
          </div>
          <div style={{ background: '#141312', border: '0.5px solid #2a2825', borderRadius: '10px', padding: '12px' }}>
            <div style={{ fontSize: '10px', color: '#4a4845', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: '8px' }}>The floor — live</div>
            {[
              { initial: 'B', name: 'Bear Bryant', comp: '70% commission', color: '#f59e0b', on: true },
              { initial: 'M', name: 'Marcus Webb', comp: '$150/wk booth rent', color: '#4a7fb5', on: true },
              { initial: 'D', name: 'Devon King', comp: '65% commission', color: '#3aab6e', on: false },
            ].map((b, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: i < 2 ? '0.5px solid #1e1c1b' : 'none' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: b.color + '22', border: `1.5px solid ${b.color}44`, color: b.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 600, flexShrink: 0 }}>{b.initial}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', color: '#f5f0e8' }}>{b.name}</div>
                  <div style={{ fontSize: '10px', color: '#4a4845' }}>{b.comp}</div>
                </div>
                <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: b.on ? '#7caf5a' : '#3a3733', flexShrink: 0 }} />
                <div style={{ fontSize: '10px', color: b.on ? '#7caf5a' : '#4a4845' }}>{b.on ? 'On floor' : 'Off floor'}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* OWNER FEATURES */}
      <div style={{ borderTop: '0.5px solid #1e1c1b', padding: '60px 24px', maxWidth: '680px', margin: '0 auto' }} id="features">
        <div data-anim style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#f59e0b', marginBottom: '12px' }}>For shop owners</div>
        <div data-anim style={{ fontSize: 'clamp(28px, 6vw, 36px)', fontWeight: 400, letterSpacing: '-0.8px', lineHeight: 1.2, marginBottom: '12px' }}>Run your shop.<br />Not spreadsheets.</div>
        <div data-anim style={{ fontSize: '16px', color: '#6b6760', lineHeight: 1.6, marginBottom: '36px' }}>Everything a shop owner needs — bookings, barber comp, client retention — in one dashboard.</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '40px' }}>
          {[
            { icon: '📅', title: 'Live booking page', desc: 'Branded for your shop. Clients book in 4 steps. Confirmation texts sent automatically.', color: '#f59e0b' },
            { icon: '💵', title: 'Barber compensation', desc: 'Commission or booth rent. Tips tracked per barber. Year-end statements built in.', color: '#7caf5a' },
            { icon: '👥', title: 'Floor visibility', desc: 'See who\'s in, who\'s off, who\'s pending — live. Barbers toggle their own status.', color: '#5b8fd4' },
            { icon: '🔔', title: 'Instant alerts', desc: 'New bookings, walk-ins, and status changes push to you in real time.', color: '#c45a5a' },
          ].map((f, i) => (
            <div data-anim key={i} style={{ background: '#1a1917', border: '0.5px solid #2a2825', borderRadius: '12px', padding: '20px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '9px', background: f.color + '22', border: `0.5px solid ${f.color}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', marginBottom: '12px' }}>{f.icon}</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#f5f0e8', marginBottom: '6px' }}>{f.title}</div>
              <div style={{ fontSize: '12px', color: '#4a4845', lineHeight: 1.5 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* CLIENT LOCK */}
      <div style={{ borderTop: '0.5px solid #1e1c1b', padding: '60px 24px', maxWidth: '680px', margin: '0 auto' }}>
        <div data-anim style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#f59e0b', marginBottom: '12px' }}>Client Lock — Proprietary</div>
        <div data-anim style={{ fontSize: 'clamp(28px, 6vw, 36px)', fontWeight: 400, letterSpacing: '-0.8px', lineHeight: 1.2, marginBottom: '12px' }}>Your clients.<br />Not floating revenue.</div>
        <div data-anim style={{ fontSize: '16px', color: '#6b6760', lineHeight: 1.6, marginBottom: '36px' }}>ChairOS tracks which clients belong to which barber. When a barber leaves, you know exactly what's at risk — before they walk out the door.</div>
        <div data-anim data-animate="lock" style={{ background: '#1a1917', border: '0.5px solid #2a2825', borderRadius: '12px', padding: '20px', marginBottom: '16px' }}>
          <div style={{ fontSize: '11px', color: '#4a4845', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: '12px' }}>Retention intelligence — updates on every appointment</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px', background: '#2a2825', borderRadius: '8px', overflow: 'hidden' }}>
            {[
              { ref: lockedRef, color: '#7caf5a', label: 'Locked' },
              { ref: atRiskRef, color: '#f59e0b', label: 'At risk' },
              { ref: floatingRef, color: '#c45a5a', label: 'Floating' },
            ].map((s, i) => (
              <div key={i} style={{ background: '#1a1917', padding: '16px', textAlign: 'center' as const }}>
                <div ref={s.ref} style={{ fontSize: '32px', color: s.color, fontWeight: 400, lineHeight: 1, marginBottom: '4px' }}>0</div>
                <div style={{ fontSize: '10px', color: '#4a4845', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
          {[
            { title: 'Locks after 2 visits', desc: 'A client books twice — they\'re locked. No guessing who owns who.' },
            { title: '90-day lapse window', desc: '90 days without a booking releases the lock. 12+ months earns loyalty protection at 365 days.' },
            { title: 'Owner override', desc: 'The logic runs automatically. You can always reassign or release any lock manually.' },
          ].map((c, i) => (
            <div data-anim key={i} style={{ background: '#1a1917', border: '0.5px solid #2a2825', borderRadius: '10px', padding: '14px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#f5f0e8', marginBottom: '4px' }}>{c.title}</div>
              <div style={{ fontSize: '12px', color: '#4a4845', lineHeight: 1.5 }}>{c.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* BARBER SECTION */}
      <div style={{ borderTop: '0.5px solid #1e1c1b', padding: '60px 24px', maxWidth: '680px', margin: '0 auto' }}>
        <div data-anim style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#f59e0b', marginBottom: '12px' }}>For barbers</div>
        <div data-anim style={{ fontSize: 'clamp(28px, 6vw, 36px)', fontWeight: 400, letterSpacing: '-0.8px', lineHeight: 1.2, marginBottom: '12px' }}>Built for the person<br />behind the chair.</div>
        <div data-anim style={{ fontSize: '16px', color: '#6b6760', lineHeight: 1.6, marginBottom: '36px' }}>Barbers get their own dashboard — schedule, earnings, clients, and floor toggle. No shared logins. No guessing what you made.</div>
        <div data-anim style={{ background: '#1a1917', border: '0.5px solid #2a2825', borderRadius: '28px', padding: '16px', maxWidth: '260px', margin: '0 auto 36px' }}>
          <div style={{ background: '#141312', borderRadius: '20px', overflow: 'hidden' }}>
            <div style={{ background: '#0f0e0d', padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '0.5px solid #2a2825' }}>
              <span style={{ fontSize: '14px', color: '#f59e0b' }}>ChairOS</span>
              <span style={{ fontSize: '10px', color: '#4a4845' }}>Barber view</span>
            </div>
            <div style={{ padding: '14px' }}>
              <div style={{ fontSize: '15px', color: '#f5f0e8', marginBottom: '10px' }}>Good morning, Marcus.</div>
              <div style={{ background: '#1a1917', border: '0.5px solid #2a2825', borderRadius: '10px', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: '#f59e0b22', border: '1.5px solid #f59e0b44', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', color: '#f59e0b', fontWeight: 600, flexShrink: 0 }}>M</div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#f5f0e8' }}>Marcus Webb</div>
                  <div style={{ fontSize: '10px', color: '#7caf5a', marginTop: '2px' }}>On the floor</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                {[
                  { val: '$340', color: '#f59e0b', label: "Today's cut" },
                  { val: '$45', color: '#7caf5a', label: 'Tips today' },
                  { val: '8', color: '#f5f0e8', label: 'Locked clients' },
                  { val: '2', color: '#c45a5a', label: 'At risk' },
                ].map((s, i) => (
                  <div key={i} style={{ background: '#1a1917', border: '0.5px solid #2a2825', borderRadius: '8px', padding: '10px', textAlign: 'center' as const }}>
                    <div style={{ fontSize: '18px', color: s.color, fontWeight: 400 }}>{s.val}</div>
                    <div style={{ fontSize: '9px', color: '#4a4845', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginTop: '2px' }}>{s.label}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: '#1a1917', border: '0.5px solid #2a2825', borderRadius: '8px', padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#f59e0b', fontFamily: 'monospace', fontWeight: 600 }}>14:00</div>
                  <div style={{ fontSize: '12px', color: '#f5f0e8', fontWeight: 500 }}>Jordan Davis</div>
                  <div style={{ fontSize: '10px', color: '#4a4845', marginTop: '1px' }}>Fade + lineup</div>
                </div>
                <div style={{ fontSize: '13px', color: '#f5f0e8', fontWeight: 600, fontFamily: 'monospace' }}>$55</div>
              </div>
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
          {[
            { title: 'Private earnings', desc: 'Your cut and tips. Tap to show or hide — other barbers never see your numbers.', color: '#f59e0b' },
            { title: 'Your client list', desc: 'See who\'s locked to you, who\'s at risk. Call or text directly from the app.', color: '#7caf5a' },
            { title: 'Real-time schedule', desc: 'Appointments update live. Mark done, add tips, book walk-ins from your phone.', color: '#5b8fd4' },
          ].map((f, i) => (
            <div data-anim key={i} style={{ background: '#1a1917', border: '0.5px solid #2a2825', borderRadius: '12px', padding: '20px' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#f5f0e8', marginBottom: '6px' }}>{f.title}</div>
              <div style={{ fontSize: '12px', color: '#4a4845', lineHeight: 1.5 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* PRICING */}
      <div style={{ borderTop: '0.5px solid #1e1c1b', padding: '60px 24px', maxWidth: '680px', margin: '0 auto' }}>
        <div data-anim style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#f59e0b', marginBottom: '12px' }}>Pricing</div>
        <div data-anim style={{ fontSize: 'clamp(28px, 6vw, 36px)', fontWeight: 400, letterSpacing: '-0.8px', lineHeight: 1.2, marginBottom: '12px' }}>Simple pricing.<br />No per-seat fees.</div>
        <div data-anim style={{ fontSize: '16px', color: '#6b6760', lineHeight: 1.6, marginBottom: '36px' }}>One flat rate. No per-barber fees. No add-on tiers. No surprises.</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '24px' }}>
          {[
            {
              featured: false,
              tier: 'Solo barber',
              amount: '$25',
              period: 'per month · 30-day free trial',
              features: ['Branded booking page', 'Client Lock engine', 'Earnings tracking', 'Real-time notifications', 'Portfolio + reviews'],
            },
            {
              featured: true,
              tier: 'Shop owner',
              amount: '$99',
              period: 'per month · up to 10 barbers',
              features: ['Everything in Solo', 'Full barber dashboards', 'Compensation management', 'Client Lock for all barbers', 'Year-end earnings reports', 'Live floor visibility'],
            },
          ].map((p, i) => (
            <div data-anim key={i} style={{ background: p.featured ? '#1e1a0a' : '#1a1917', border: p.featured ? '0.5px solid #f59e0b44' : '0.5px solid #2a2825', borderRadius: '14px', padding: '24px' }}>
              {p.featured && <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#f59e0b', background: '#f59e0b22', border: '0.5px solid #f59e0b44', padding: '3px 10px', borderRadius: '20px', display: 'inline-block', marginBottom: '12px' }}>Most popular</div>}
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#6b6760', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: '8px' }}>{p.tier}</div>
              <div style={{ fontSize: '36px', fontWeight: 400, color: '#f5f0e8', letterSpacing: '-1px', marginBottom: '4px' }}>{p.amount}</div>
              <div style={{ fontSize: '13px', color: '#4a4845', marginBottom: '16px' }}>{p.period}</div>
              {p.features.map((f, j) => (
                <div key={j} style={{ fontSize: '12px', color: '#6b6760', padding: '6px 0', borderBottom: j < p.features.length - 1 ? '0.5px solid #1e1c1b' : 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: '#7caf5a22', border: '0.5px solid #7caf5a44', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#7caf5a' }} />
                  </div>
                  {f}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div data-anim style={{ textAlign: 'center' as const, fontSize: '13px', color: '#4a4845' }}>
          Compare to Squire at $250/location or FullCap at $150+ — ChairOS is built differently.
        </div>
      </div>

      {/* FOUNDER */}
      <div style={{ borderTop: '0.5px solid #1e1c1b', padding: '60px 24px', maxWidth: '680px', margin: '0 auto' }}>
        <div data-anim style={{ background: '#1a1917', border: '0.5px solid #2a2825', borderRadius: '12px', padding: '24px' }}>
          <div style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: '12px' }}>Built by someone who's been behind the chair</div>
          <div style={{ fontSize: '16px', color: '#f5f0e8', lineHeight: 1.7, marginBottom: '12px', fontStyle: 'italic' }}>
            "I built ChairOS because I lived the problem. Managing barbers, tracking tips, watching clients walk out the door when a barber left — there was no tool built for how a barbershop actually runs. So I built it."
          </div>
          <div style={{ fontSize: '12px', color: '#4a4845' }}>Licensed barber · Former shop owner · Barbering instructor</div>
        </div>
      </div>

      {/* WAITLIST */}
      <div style={{ padding: '0 24px 60px', maxWidth: '680px', margin: '0 auto' }} id="waitlist">
        <div data-anim style={{ background: '#1a1917', border: '0.5px solid #2a2825', borderRadius: '16px', padding: '48px 32px', textAlign: 'center' as const }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#1e1a0a', border: '0.5px solid #3d3010', color: '#f59e0b', fontSize: '11px', fontWeight: 600, padding: '5px 12px', borderRadius: '20px', marginBottom: '20px', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
            Founding member pricing locked in at signup
          </div>
          <div style={{ fontSize: 'clamp(24px, 5vw, 32px)', fontWeight: 400, letterSpacing: '-0.6px', color: '#f5f0e8', marginBottom: '8px' }}>Start your free trial.</div>
          <div style={{ fontSize: '15px', color: '#6b6760', marginBottom: '28px', lineHeight: 1.6 }}>
            30 days free. No credit card.<br />Founding members lock in current pricing forever.
          </div>
          {joined ? (
            <div style={{ background: '#1e2e1a', border: '0.5px solid #3a5530', borderRadius: '12px', padding: '20px', maxWidth: '400px', margin: '0 auto' }}>
              <div style={{ fontSize: '16px', color: '#7caf5a', fontWeight: 600, marginBottom: '4px' }}>You're in.</div>
              <div style={{ fontSize: '13px', color: '#4a6a40' }}>We'll be in touch. Founding member pricing is locked in for you.</div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: '8px', maxWidth: '400px', margin: '0 auto 12px' }}>
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setEmailError(false) }}
                  placeholder="your@email.com"
                  style={{ flex: 1, background: '#141312', border: `0.5px solid ${emailError ? '#c45a5a' : '#3a3733'}`, borderRadius: '8px', padding: '12px 14px', color: '#f5f0e8', fontSize: '14px', outline: 'none' }}
                />
                <button
                  onClick={handleJoin}
                  style={{ background: '#f59e0b', color: '#000', fontSize: '13px', fontWeight: 700, padding: '12px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' as const }}>
                  Join waitlist
                </button>
              </div>
              <div style={{ fontSize: '12px', color: emailError ? '#c45a5a' : '#3a3733' }}>
                {emailError ? 'Please enter a valid email.' : 'Join 47 shop owners already on the waitlist.'}
              </div>
            </>
          )}
        </div>
      </div>

      {/* FOOTER */}
      <footer style={{ borderTop: '0.5px solid #1e1c1b', padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: '16px' }}>Chair<span style={{ color: '#f59e0b' }}>OS</span></div>
        <div style={{ fontSize: '12px', color: '#3a3733' }}>chairos.cc · Built for the industry</div>
      </footer>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}


