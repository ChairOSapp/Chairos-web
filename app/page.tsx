'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { track } from '@vercel/analytics'
import { createClient } from '@/lib/supabase'
import LandingNav from '@/components/LandingNav'

const VERTICAL_TILES = [
  {
    href: '/barbershops',
    label: 'Barbershops',
    initial: 'B',
    description: 'Chair tracking, commission, and a booking page that stays yours when a barber leaves.',
  },
  {
    href: '/salons',
    label: 'Salons',
    initial: 'S',
    description: 'Color and chemical service times built into booking, one flat fee no matter how many stylists.',
  },
  {
    href: '/tattoo',
    label: 'Tattoo Studios',
    initial: 'T',
    description: 'Deposits collected at booking, consent signed and stored automatically, sessions built for real setup time.',
  },
]

const HASH_REDIRECTS: Record<string, string> = {
  '#barbershops': '/barbershops',
  '#salons': '/salons',
  '#tattoo': '/tattoo',
}

export default function LandingPage() {
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function checkAuth() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) { router.push('/dashboard'); return }
    }
    checkAuth()
    track('landing_view')

    // Old anchor links from the previous single-page layout
    // (chairos.cc/#barbershops etc.) now route to the dedicated pages.
    const hash = window.location.hash
    if (hash && HASH_REDIRECTS[hash]) {
      router.replace(HASH_REDIRECTS[hash])
    }
  }, [])

  return (
    <div style={{ background: '#FAFAF7', minHeight: '100vh', fontFamily: "-apple-system, 'Helvetica Neue', sans-serif", color: '#1A1A18', overflowX: 'hidden' }}>
      <LandingNav />

      {/* HERO */}
      <div style={{ padding: '72px 24px 48px', maxWidth: '760px', margin: '0 auto' }}>
        <div style={{ fontSize: 'clamp(38px, 8vw, 58px)', lineHeight: 1.08, fontWeight: 400, letterSpacing: '-2px', marginBottom: '20px' }}>
          Own your shop.<br />Lock your clients.<br /><span style={{ color: '#4B5320' }}>Scale your business.</span>
        </div>
        <div style={{ fontSize: '18px', color: '#4F4F48', lineHeight: 1.65, marginBottom: '12px', maxWidth: '540px' }}>
          A barber built this after watching clients walk out the door with the people who cut their hair. Now it runs salons and tattoo studios too.
        </div>
        <div style={{ fontSize: '14px', color: '#65655F', lineHeight: 1.6, marginBottom: '32px', maxWidth: '540px' }}>
          The operating system for independent shops.
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' as const, alignItems: 'center' }}>
          <button onClick={() => { track('hero_cta_click', { location: 'top' }); router.push('/signup') }} style={{ background: '#4B5320', color: '#fff', fontSize: '15px', fontWeight: 700, padding: '15px 32px', borderRadius: '10px', border: 'none', cursor: 'pointer', boxShadow: '0 4px 14px rgba(75,83,32,0.3)' }}>
            Start free trial
          </button>
          <span style={{ fontSize: '13px', color: '#65655F' }}>30 days free. No card required to start.</span>
        </div>
      </div>

      {/* VERTICAL PICKER: each tile routes to its own dedicated page. */}
      <div style={{ padding: '0 24px 56px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center' as const, fontSize: '13px', fontWeight: 600, color: '#65655F', letterSpacing: '0.04em', marginBottom: '20px' }}>
            What kind of shop are you running?
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '20px' }}>
            {VERTICAL_TILES.map(v => (
              <button
                key={v.href}
                onClick={() => router.push(v.href)}
                className="vertical-tile"
                style={{ background: '#F4F2EC', border: '1px solid #D8D5C8', borderRadius: '16px', padding: '28px 24px', textAlign: 'left' as const, cursor: 'pointer', font: 'inherit', color: 'inherit' }}
              >
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#4B5320', color: '#FAFAF7', fontSize: '17px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '18px' }}>
                  {v.initial}
                </div>
                <div style={{ fontSize: '16px', fontWeight: 600, color: '#1A1A18', marginBottom: '8px' }}>{v.label}</div>
                <div style={{ fontSize: '13.5px', color: '#65655F', lineHeight: 1.55, marginBottom: '16px' }}>{v.description}</div>
                <span style={{ fontSize: '13px', color: '#4B5320', fontWeight: 600 }}>View →</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* TRUST / PROOF: Client Lock, vertical-neutral, kept to a few sentences */}
      <div style={{ background: '#F0EDE6', borderTop: '1px solid #D8D5C8', borderBottom: '1px solid #D8D5C8', padding: '64px 24px' }}>
        <div style={{ maxWidth: '620px', margin: '0 auto', textAlign: 'center' as const }}>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#4B5320', marginBottom: '14px' }}>
            Client Lock
          </div>
          <p style={{ fontSize: '17px', color: '#33332f', lineHeight: 1.7, marginBottom: '32px' }}>
            Every shop loses clients when staff leave. Client Lock locks each client to a staff member from their second visit, so you know exactly who is at risk before anyone walks out the door. It runs itself. No extra work, ever.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', maxWidth: '460px', margin: '0 auto' }}>
            {[
              { value: '15', label: 'Locked clients' },
              { value: '0', label: 'At risk right now' },
              { value: '$2,275', label: 'Revenue protected' },
            ].map((stat, i) => (
              <div key={i} style={{ background: '#FAFAF7', border: '1px solid #D8D5C8', borderRadius: '12px', padding: '16px 8px' }}>
                <div style={{ fontSize: '24px', fontWeight: 700, color: '#4B5320', marginBottom: '4px' }}>{stat.value}</div>
                <div style={{ fontSize: '11px', color: '#65655F', letterSpacing: '0.02em' }}>{stat.label}</div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: '12px', color: '#8a8a82', marginTop: '14px' }}>
            Real numbers from a live ChairOS shop.
          </p>
        </div>
      </div>

      {/* CTA */}
      <div style={{ background: '#4B5320', padding: '64px 24px', textAlign: 'center' as const }}>
        <div style={{ maxWidth: '480px', margin: '0 auto' }}>
          <div style={{ fontSize: 'clamp(26px, 6vw, 36px)', fontWeight: 400, letterSpacing: '-0.8px', color: '#FAFAF7', marginBottom: '12px' }}>
            Start your 30-day free trial.
          </div>
          <div style={{ fontSize: '15px', color: '#B8C49A', marginBottom: '28px', lineHeight: 1.6 }}>
            Cancel anytime.
          </div>
          <button
            onClick={() => { track('hero_cta_click', { location: 'bottom' }); router.push('/signup') }}
            style={{ background: '#FAFAF7', color: '#4B5320', fontSize: '15px', fontWeight: 700, padding: '15px 34px', borderRadius: '10px', border: 'none', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
          >
            Start free trial
          </button>
        </div>
      </div>

      <footer style={{ background: '#2d3214', borderTop: '0.5px solid rgba(255,255,255,0.08)', padding: '24px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: '10px' }}>
        <div style={{ fontSize: '18px', color: '#FAFAF7' }}>Chair<span style={{ color: '#B8C49A' }}>OS</span></div>
        <div style={{ fontSize: '12px', color: '#6a7a4a' }}>chairos.cc · Built for the industry</div>
      </footer>

      <style>{`
        .vertical-tile { transition: transform 0.2s ease; }
        .vertical-tile:hover { transform: translateY(-4px); }
      `}</style>
    </div>
  )
}
