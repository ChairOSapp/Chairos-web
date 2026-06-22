
'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

function IconCalendar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
      <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M8 2v4M16 2v4M3 10h18" />
    </svg>
  )
}
function IconDollar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
      <circle cx="12" cy="12" r="9" /><path d="M12 7v10M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4" />
    </svg>
  )
}
function IconUsers() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
      <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}
function IconBell() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}
function IconLock() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
      <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}
function IconChart() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
      <path d="M3 3v18h18" /><path d="M18 9l-5 5-4-4-3 3" />
    </svg>
  )
}
function IconShield() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
      <path d="M12 2l8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4z" />
    </svg>
  )
}

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

  async function handleJoin() {
    if (!email || !email.includes('@')) { setEmailError(true); return }
    const { error } = await supabase.from('waitlist').insert({ email })
    if (error && error.code !== '23505') { setEmailError(true); return }
    setEmailError(false)
    setJoined(true)
  }

  const FEATURES = [
    { icon: <IconCalendar />, title: 'Live booking page', desc: 'Branded for your shop. Clients book in 4 steps. Confirmation texts sent automatically.' },
    { icon: <IconDollar />, title: 'Barber compensation', desc: 'Commission or booth rent. Tips tracked per barber. Year-end statements built in.' },
    { icon: <IconUsers />, title: 'Floor visibility', desc: "See who's in, who's off, who's pending — live. Barbers toggle their own status." },
    { icon: <IconBell />, title: 'Instant alerts', desc: 'New bookings, walk-ins, and status changes push to you in real time.' },
    { icon: <IconChart />, title: 'Revenue analytics', desc: 'Daily revenue trends, monthly breakdowns, busiest days, service performance — all in one view.' },
    { icon: <IconShield />, title: 'Client Lock', desc: 'Proprietary retention engine. Track which clients belong to which barber. Know your exposure before a barber walks.' },
  ]

  return (
    <div style={{ background: '#FAFAF7', minHeight: '100vh', fontFamily: "-apple-system, 'Helvetica Neue', sans-serif", color: '#1A1A18', overflowX: 'hidden' }}>

      {/* NAV */}
      <nav style={{ background: 'rgba(250,250,247,0.92)', backdropFilter: 'blur(12px)', borderBottom: '0.5px solid #D8D5C8', padding: '0 24px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ fontSize: '22px', letterSpacing: '-0.5px', fontWeight: 400 }}>
          Chair<span style={{ color: '#4B5320' }}>OS</span>
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <button onClick={() => router.push('/login')} style={{ fontSize: '13px', color: '#65655F', background: 'none', border: 'none', cursor: 'pointer' }}>Sign in</button>
          <button onClick={() => router.push('/signup')} style={{ background: '#4B5320', color: '#fff', fontSize: '13px', fontWeight: 700, padding: '8px 18px', borderRadius: '8px', border: 'none', cursor: 'pointer' }}>
            Get started
          </button>
        </div>
      </nav>

      {/* HERO — full-bleed, bold */}
      <div style={{ padding: '72px 24px 64px', maxWidth: '760px', margin: '0 auto' }}>
        <div data-anim style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#EDF2E5', border: '0.5px solid #B8C49A', color: '#4B5320', fontSize: '11px', fontWeight: 600, padding: '5px 12px', borderRadius: '20px', marginBottom: '28px', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4B5320', display: 'inline-block', animation: 'pulse 2s infinite' }} />
          Founding member spots open — 30-day free trial
        </div>
        <div data-anim style={{ fontSize: 'clamp(42px, 9vw, 64px)', lineHeight: 1.05, fontWeight: 400, letterSpacing: '-2px', marginBottom: '20px' }}>
          Run your shop.<br /><span style={{ color: '#4B5320' }}>Not spreadsheets.</span>
        </div>
        <div data-anim style={{ fontSize: '18px', color: '#4F4F48', lineHeight: 1.65, marginBottom: '36px', maxWidth: '520px' }}>
          The operating system for barbershop owners. Bookings, barber comp, client retention, and analytics — built by someone who's been behind the chair.
        </div>
        <div data-anim style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' as const, marginBottom: '36px' }}>
          <button onClick={() => router.push('/signup')} style={{ background: '#4B5320', color: '#fff', fontSize: '15px', fontWeight: 700, padding: '15px 32px', borderRadius: '10px', border: 'none', cursor: 'pointer', boxShadow: '0 4px 14px rgba(75,83,32,0.3)' }}>
            Start free trial — 30 days
          </button>
          <button onClick={() => scrollTo('features')} style={{ background: '#FAFAF7', color: '#1A1A18', fontSize: '15px', fontWeight: 500, padding: '15px 28px', borderRadius: '10px', border: '1px solid #C0BDB0', cursor: 'pointer' }}>
            See how it works →
          </button>
        </div>
        <div data-anim style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' as const }}>
          {['30-day free trial', 'No per-barber fees', 'Cancel anytime'].map((t, i) => (
            <span key={i} style={{ fontSize: '12px', color: '#65655F', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: '14px', height: '14px', borderRadius: '50%', background: '#EDF2E5', border: '0.5px solid #B8C49A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4B5320', display: 'block' }} />
              </span>
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* DASHBOARD PREVIEW */}
      <div data-anim data-animate="revenue" style={{ background: '#F4F2EC', border: '1px solid #D8D5C8', borderRadius: '16px', margin: '0 24px 80px', overflow: 'hidden', maxWidth: '680px', marginLeft: 'auto', marginRight: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.08)' }}>
        <div style={{ background: '#EAE8E0', borderBottom: '0.5px solid #D8D5C8', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          {['#ff5f57', '#ffbd2e', '#28ca41'].map((c, i) => <div key={i} style={{ width: '10px', height: '10px', borderRadius: '50%', background: c }} />)}
          <span style={{ fontSize: '11px', color: '#65655F', marginLeft: '8px', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>Owner dashboard — live</span>
        </div>
        <div style={{ padding: '20px' }}>
          <div style={{ fontSize: '16px', color: '#1A1A18', marginBottom: '8px' }}>Good morning, Bear.</div>
          <div ref={revenueRef} style={{ fontSize: '44px', color: '#4B5320', fontWeight: 400, letterSpacing: '-2px', lineHeight: 1 }}>$0</div>
          <div style={{ fontSize: '11px', color: '#65655F', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginTop: '4px', marginBottom: '16px' }}>Today's revenue</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '16px' }}>
            {[
              { val: '$0', color: '#3a7d2a', label: 'Tips' },
              { val: '6', color: '#1A1A18', label: 'Bookings' },
              { val: '0%', color: '#b94040', label: 'No-shows' },
            ].map((t, i) => (
              <div key={i} style={{ background: '#EAE8E0', border: '0.5px solid #D8D5C8', borderRadius: '10px', padding: '12px', textAlign: 'center' as const }}>
                <div ref={i === 0 ? tipsRef : undefined} style={{ fontSize: '20px', color: t.color, fontWeight: 400 }}>{t.val}</div>
                <div style={{ fontSize: '10px', color: '#65655F', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginTop: '3px' }}>{t.label}</div>
              </div>
            ))}
          </div>
          <div style={{ background: '#EAE8E0', border: '0.5px solid #D8D5C8', borderRadius: '10px', padding: '12px' }}>
            <div style={{ fontSize: '10px', color: '#65655F', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: '8px' }}>The floor — live</div>
            {[
              { initial: 'B', name: 'Bear Bryant', comp: '70% commission', color: '#4B5320', on: true },
              { initial: 'M', name: 'Marcus Webb', comp: '$150/wk booth rent', color: '#4a7fb5', on: true },
              { initial: 'D', name: 'Devon King', comp: '65% commission', color: '#3aab6e', on: false },
            ].map((b, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: i < 2 ? '0.5px solid #D8D5C8' : 'none' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: b.color + '22', border: `1.5px solid ${b.color}44`, color: b.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 600, flexShrink: 0 }}>{b.initial}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', color: '#1A1A18' }}>{b.name}</div>
                  <div style={{ fontSize: '10px', color: '#65655F' }}>{b.comp}</div>
                </div>
                <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: b.on ? '#3a7d2a' : '#C0BDB0', flexShrink: 0 }} />
                <div style={{ fontSize: '10px', color: b.on ? '#3a7d2a' : '#65655F' }}>{b.on ? 'On floor' : 'Off floor'}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* FEATURES — dark OD green section */}
      <div id="features" style={{ background: '#4B5320', padding: '80px 24px' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto' }}>
          <div data-anim style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#B8C49A', marginBottom: '14px' }}>For shop owners</div>
          <div data-anim style={{ fontSize: 'clamp(30px, 6vw, 42px)', fontWeight: 400, letterSpacing: '-1px', lineHeight: 1.15, color: '#FAFAF7', marginBottom: '14px' }}>Everything you need<br />to run a modern shop.</div>
          <div data-anim style={{ fontSize: '16px', color: '#B8C49A', lineHeight: 1.65, marginBottom: '52px', maxWidth: '480px' }}>Bookings, barber comp, client retention, and analytics — in one dashboard built for how a barbershop actually runs.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            {FEATURES.map((f, i) => (
              <div data-anim key={i} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '14px', padding: '24px', backdropFilter: 'blur(4px)' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#B8C49A', marginBottom: '14px' }}>
                  {f.icon}
                </div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#FAFAF7', marginBottom: '7px' }}>{f.title}</div>
                <div style={{ fontSize: '12px', color: '#9aa87a', lineHeight: 1.55 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CLIENT LOCK — premium hero section */}
      <div style={{ background: '#FAFAF7', padding: '80px 24px' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto' }}>
          <div data-anim style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#EDF2E5', border: '0.5px solid #B8C49A', borderRadius: '20px', padding: '5px 14px', marginBottom: '24px' }}>
            <span style={{ color: '#4B5320' }}><IconLock /></span>
            <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#4B5320' }}>Client Lock — Proprietary</span>
          </div>
          <div data-anim style={{ fontSize: 'clamp(32px, 7vw, 48px)', fontWeight: 400, letterSpacing: '-1.2px', lineHeight: 1.1, marginBottom: '16px' }}>
            Your clients stay yours.<br /><span style={{ color: '#4B5320' }}>Even when barbers leave.</span>
          </div>
          <div data-anim style={{ fontSize: '17px', color: '#4F4F48', lineHeight: 1.65, marginBottom: '40px', maxWidth: '520px' }}>
            ChairOS tracks which clients belong to which barber — and for how long. When a barber leaves, you know exactly what revenue is at risk before they walk out the door.
          </div>

          {/* Lock metrics card */}
          <div data-anim data-animate="lock" style={{ background: '#F0EDE6', border: '1px solid #C8C4B8', borderRadius: '20px', overflow: 'hidden', marginBottom: '24px', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
            <div style={{ background: '#2d3214', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#B8C49A' }}>Retention intelligence — live</span>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#5ecc5e', display: 'inline-block', animation: 'pulse 2s infinite' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', background: '#E8E4DC' }}>
              {[
                { ref: lockedRef, val: '0', color: '#3a7d2a', label: 'Locked', desc: 'Clients who belong to a barber' },
                { ref: atRiskRef, val: '0', color: '#b97a20', label: 'At Risk', desc: 'Haven\'t been in 60+ days' },
                { ref: floatingRef, val: '0', color: '#b94040', label: 'Floating', desc: 'Not yet locked to anyone' },
              ].map((s, i) => (
                <div key={i} style={{ padding: '24px 16px', textAlign: 'center' as const, borderRight: i < 2 ? '1px solid #D8D5C8' : 'none' }}>
                  <div ref={s.ref} style={{ fontSize: '40px', color: s.color, fontWeight: 400, lineHeight: 1, marginBottom: '6px' }}>{s.val}</div>
                  <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#4F4F48', marginBottom: '4px' }}>{s.label}</div>
                  <div style={{ fontSize: '10px', color: '#65655F', lineHeight: 1.4 }}>{s.desc}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
            {[
              { icon: '2', title: 'Locks after 2 visits', desc: 'A client books twice — they\'re locked. No guessing who owns who.' },
              { icon: '90', title: '90-day lapse window', desc: '90 days without a booking releases the lock. 12+ months earns loyalty protection.' },
              { icon: '∞', title: 'Owner override', desc: 'The logic runs automatically. You can reassign or release any lock manually.' },
            ].map((c, i) => (
              <div data-anim key={i} style={{ background: '#F4F2EC', border: '1px solid #D8D5C8', borderRadius: '12px', padding: '18px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#4B5320', marginBottom: '8px', fontFamily: 'monospace' }}>{c.icon}</div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#1A1A18', marginBottom: '5px' }}>{c.title}</div>
                <div style={{ fontSize: '12px', color: '#65655F', lineHeight: 1.5 }}>{c.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* BARBER SECTION */}
      <div style={{ background: '#F0EDE6', borderTop: '1px solid #D8D5C8', borderBottom: '1px solid #D8D5C8', padding: '80px 24px' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto' }}>
          <div data-anim style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#4B5320', marginBottom: '12px' }}>For barbers</div>
          <div data-anim style={{ fontSize: 'clamp(28px, 6vw, 40px)', fontWeight: 400, letterSpacing: '-0.8px', lineHeight: 1.15, marginBottom: '14px' }}>Built for the person<br />behind the chair.</div>
          <div data-anim style={{ fontSize: '16px', color: '#4F4F48', lineHeight: 1.65, marginBottom: '44px', maxWidth: '480px' }}>Barbers get their own dashboard — schedule, earnings, clients, and floor toggle. No shared logins. No guessing what you made.</div>
          <div style={{ display: 'flex', gap: '32px', alignItems: 'flex-start', flexWrap: 'wrap' as const }}>
            <div data-anim style={{ background: '#F4F2EC', border: '1px solid #D8D5C8', borderRadius: '28px', padding: '16px', width: '260px', flexShrink: 0, boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}>
              <div style={{ background: '#EAE8E0', borderRadius: '20px', overflow: 'hidden' }}>
                <div style={{ background: '#FAFAF7', padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '0.5px solid #D8D5C8' }}>
                  <span style={{ fontSize: '14px', color: '#4B5320' }}>ChairOS</span>
                  <span style={{ fontSize: '10px', color: '#65655F' }}>Barber view</span>
                </div>
                <div style={{ padding: '14px' }}>
                  <div style={{ fontSize: '15px', color: '#1A1A18', marginBottom: '10px' }}>Good morning, Marcus.</div>
                  <div style={{ background: '#F4F2EC', border: '0.5px solid #D8D5C8', borderRadius: '10px', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: '#4B532018', border: '1.5px solid #4B532040', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', color: '#4B5320', fontWeight: 600, flexShrink: 0 }}>M</div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#1A1A18' }}>Marcus Webb</div>
                      <div style={{ fontSize: '10px', color: '#3a7d2a', marginTop: '2px' }}>On the floor</div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                    {[
                      { val: '$340', color: '#4B5320', label: "Today's cut" },
                      { val: '$45', color: '#3a7d2a', label: 'Tips today' },
                      { val: '8', color: '#1A1A18', label: 'Locked clients' },
                      { val: '2', color: '#b94040', label: 'At risk' },
                    ].map((s, i) => (
                      <div key={i} style={{ background: '#F4F2EC', border: '0.5px solid #D8D5C8', borderRadius: '8px', padding: '10px', textAlign: 'center' as const }}>
                        <div style={{ fontSize: '18px', color: s.color, fontWeight: 400 }}>{s.val}</div>
                        <div style={{ fontSize: '9px', color: '#65655F', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginTop: '2px' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ background: '#F4F2EC', border: '0.5px solid #D8D5C8', borderRadius: '8px', padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '11px', color: '#4B5320', fontFamily: 'monospace', fontWeight: 600 }}>14:00</div>
                      <div style={{ fontSize: '12px', color: '#1A1A18', fontWeight: 500 }}>Jordan Davis</div>
                      <div style={{ fontSize: '10px', color: '#65655F', marginTop: '1px' }}>Fade + lineup</div>
                    </div>
                    <div style={{ fontSize: '13px', color: '#1A1A18', fontWeight: 600, fontFamily: 'monospace' }}>$55</div>
                  </div>
                </div>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '12px' }}>
                {[
                  { icon: <IconDollar />, title: 'Private earnings', desc: 'Your cut and tips — tap to show or hide. Other barbers never see your numbers.' },
                  { icon: <IconUsers />, title: 'Your client list', desc: "See who's locked to you, who's at risk. Call or text directly from the app." },
                  { icon: <IconCalendar />, title: 'Real-time schedule', desc: 'Appointments update live. Mark done, add tips, book walk-ins from your phone.' },
                ].map((f, i) => (
                  <div data-anim key={i} style={{ background: '#FAFAF7', border: '1px solid #D8D5C8', borderRadius: '12px', padding: '18px 20px', display: 'flex', gap: '14px', alignItems: 'flex-start', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                    <div style={{ color: '#4B5320', flexShrink: 0, marginTop: '1px' }}>{f.icon}</div>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#1A1A18', marginBottom: '4px' }}>{f.title}</div>
                      <div style={{ fontSize: '12px', color: '#65655F', lineHeight: 1.5 }}>{f.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* PRICING */}
      <div style={{ background: '#FAFAF7', padding: '80px 24px' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto' }}>
          <div data-anim style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#4B5320', marginBottom: '12px' }}>Pricing</div>
          <div data-anim style={{ fontSize: 'clamp(28px, 6vw, 40px)', fontWeight: 400, letterSpacing: '-0.8px', lineHeight: 1.15, marginBottom: '12px' }}>Simple pricing.<br />No per-seat fees.</div>
          <div data-anim style={{ fontSize: '16px', color: '#4F4F48', lineHeight: 1.65, marginBottom: '44px' }}>One flat rate. No per-barber fees. No add-on tiers. No surprises.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '28px' }}>
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
              <div data-anim key={i} style={{ background: p.featured ? '#EDF2E5' : '#F4F2EC', border: p.featured ? '1.5px solid #4B532050' : '1px solid #D8D5C8', borderRadius: '16px', padding: '28px', boxShadow: p.featured ? '0 4px 20px rgba(75,83,32,0.12)' : '0 1px 6px rgba(0,0,0,0.04)' }}>
                {p.featured && <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#4B5320', background: '#4B532015', border: '0.5px solid #4B532030', padding: '4px 10px', borderRadius: '20px', display: 'inline-block', marginBottom: '14px' }}>Most popular</div>}
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#65655F', textTransform: 'uppercase' as const, letterSpacing: '0.1em', marginBottom: '10px' }}>{p.tier}</div>
                <div style={{ fontSize: '40px', fontWeight: 400, color: '#1A1A18', letterSpacing: '-1.5px', lineHeight: 1, marginBottom: '4px' }}>{p.amount}</div>
                <div style={{ fontSize: '13px', color: '#65655F', marginBottom: '20px' }}>{p.period}</div>
                {p.features.map((f, j) => (
                  <div key={j} style={{ fontSize: '13px', color: '#4F4F48', padding: '7px 0', borderBottom: j < p.features.length - 1 ? '0.5px solid #D8D5C8' : 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#4B532012', border: '0.5px solid #4B532040', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4B5320' }} />
                    </div>
                    {f}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div data-anim style={{ textAlign: 'center' as const, fontSize: '13px', color: '#65655F' }}>
            Compare to Squire at $250/location or FullCap at $150+ — ChairOS is built differently.
          </div>
        </div>
      </div>

      {/* FOUNDER */}
      <div style={{ background: '#F0EDE6', borderTop: '1px solid #D8D5C8', padding: '64px 24px' }}>
        <div style={{ maxWidth: '680px', margin: '0 auto' }}>
          <div data-anim style={{ background: '#FAFAF7', border: '1px solid #D8D5C8', borderRadius: '16px', padding: '32px', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: '11px', color: '#4B5320', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.1em', marginBottom: '14px' }}>Built by someone who's been behind the chair</div>
            <div style={{ fontSize: '17px', color: '#1A1A18', lineHeight: 1.7, marginBottom: '16px', fontStyle: 'italic' }}>
              "I built ChairOS because I lived the problem. Managing barbers, tracking tips, watching clients walk out the door when a barber left — there was no tool built for how a barbershop actually runs. So I built it."
            </div>
            <div style={{ fontSize: '12px', color: '#65655F', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#4B532015', border: '1px solid #4B532030', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4B5320', fontSize: '14px', fontWeight: 600 }}>B</div>
              <div>
                <div style={{ fontWeight: 600, color: '#1A1A18', marginBottom: '2px' }}>Licensed barber · Former shop owner</div>
                Barbering instructor · Founder of ChairOS
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* WAITLIST */}
      <div style={{ background: '#4B5320', padding: '80px 24px' }} id="waitlist">
        <div style={{ maxWidth: '580px', margin: '0 auto', textAlign: 'center' as const }}>
          <div data-anim style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.12)', border: '0.5px solid rgba(255,255,255,0.25)', color: '#D4E0A0', fontSize: '11px', fontWeight: 600, padding: '5px 14px', borderRadius: '20px', marginBottom: '24px', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#7ec86e', display: 'inline-block', animation: 'pulse 2s infinite' }} />
            Founding member pricing locked in at signup
          </div>
          <div data-anim style={{ fontSize: 'clamp(26px, 6vw, 36px)', fontWeight: 400, letterSpacing: '-0.8px', color: '#FAFAF7', marginBottom: '10px' }}>
            Start your 30-day free trial.
          </div>
          <div data-anim style={{ fontSize: '16px', color: '#B8C49A', marginBottom: '32px', lineHeight: 1.65 }}>
            Cancel anytime. Founding members lock in current pricing forever.
          </div>
          {joined ? (
            <div style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '14px', padding: '24px', maxWidth: '420px', margin: '0 auto' }}>
              <div style={{ fontSize: '18px', color: '#7ec86e', fontWeight: 600, marginBottom: '6px' }}>You're in.</div>
              <div style={{ fontSize: '14px', color: '#B8C49A' }}>We'll be in touch. Founding member pricing is locked in for you.</div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: '8px', maxWidth: '420px', margin: '0 auto 12px' }}>
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setEmailError(false) }}
                  placeholder="your@email.com"
                  style={{ flex: 1, background: 'rgba(255,255,255,0.12)', border: `1px solid ${emailError ? '#f87171' : 'rgba(255,255,255,0.2)'}`, borderRadius: '10px', padding: '14px 16px', color: '#FAFAF7', fontSize: '14px', outline: 'none' }}
                />
                <button
                  onClick={handleJoin}
                  style={{ background: '#FAFAF7', color: '#4B5320', fontSize: '14px', fontWeight: 700, padding: '14px 22px', borderRadius: '10px', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' as const, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
                  Get started
                </button>
              </div>
              <div style={{ fontSize: '12px', color: emailError ? '#f87171' : '#9aa87a' }}>
                {emailError ? 'Please enter a valid email.' : 'Join 47 shop owners already on the waitlist.'}
              </div>
              <div style={{ marginTop: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
                <button onClick={() => router.push('/signup')} style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)', color: '#FAFAF7', fontSize: '13px', fontWeight: 600, padding: '10px 20px', borderRadius: '8px', cursor: 'pointer' }}>
                  Create account →
                </button>
                <button onClick={() => router.push('/login')} style={{ background: 'none', border: 'none', color: '#B8C49A', fontSize: '13px', cursor: 'pointer', textDecoration: 'underline' }}>
                  Already have an account? Sign in
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* FOOTER */}
      <footer style={{ background: '#2d3214', borderTop: '0.5px solid rgba(255,255,255,0.08)', padding: '24px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: '18px', color: '#FAFAF7' }}>Chair<span style={{ color: '#B8C49A' }}>OS</span></div>
        <div style={{ fontSize: '12px', color: '#6a7a4a' }}>chairos.cc · Built for the industry</div>
      </footer>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        ::placeholder { color: rgba(250,250,247,0.4) !important; }
      `}</style>
    </div>
  )
}
