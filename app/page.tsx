'use client'
import { useEffect, useState } from 'react'
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

const FEATURE_STRIP: string[] = [
  'AI drafts your campaigns. You approve and send.',
  'AI drafts responses to your reviews. You approve it, then post it wherever the review lives.',
  'ChairOS flags what needs attention: slow days, clients going cold, ticket averages sliding, with the real numbers behind every flag.',
  'Recovers bookings people started but did not finish, with an automatic follow-up text.',
  'Clients get their own portal: saved card, booking history, one-tap rebook, no app download required.',
]

const PRICING_PLANS = [
  { name: 'Solo Chair', price: '$25', description: 'For an independent professional running their own chair.' },
  { name: 'Shop Owner', price: '$79', description: 'Unlimited staff, Client Lock, and the full shop dashboard.' },
]

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: 'Does each staff member need their own subscription?',
    a: 'No. One Shop Owner subscription covers your whole shop, however many staff you add.',
  },
  {
    q: 'Can clients book without downloading an app?',
    a: 'Yes. Clients book through a plain web page at your shop\'s own booking link, no app or account required on their end.',
  },
  {
    q: 'How does Client Lock work?',
    a: 'From a client\'s second visit with the same staff member, Client Lock records that relationship under your shop, so you always know which clients belong to which staff member, and which ones are at risk if that person leaves.',
  },
  {
    q: 'Do you process payments?',
    a: 'Yes. Stripe handles your ChairOS subscription, and Square handles the payments your clients make for appointments and deposits.',
  },
  {
    q: 'Can I mix commission and booth rent staff in the same shop?',
    a: 'Yes. Each staff member is set up as commission or booth rent individually, so a shop can freely mix both at once.',
  },
  {
    q: 'What happens to my data if I cancel?',
    a: 'Cancelling stops billing and starts a 7-day grace period, then blocks dashboard access. Your shop\'s data is not deleted automatically.',
  },
]

export default function LandingPage() {
  const router = useRouter()
  const supabase = createClient()
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  function toggleFaq(i: number) {
    setOpenFaq(prev => {
      const next = prev === i ? null : i
      if (next !== null) track('faq_open', { question: FAQ_ITEMS[i].q })
      return next
    })
  }

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
        <div style={{ display: 'inline-flex', alignItems: 'center', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#4B5320', background: '#F0EDE6', border: '1px solid #D8D5C8', borderRadius: '999px', padding: '6px 14px', marginBottom: '22px' }}>
          Veteran-Owned & Operated
        </div>
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

      {/* BEYOND BOOKING: compact feature strip, real live features only */}
      <div style={{ padding: '64px 24px' }}>
        <div style={{ maxWidth: '620px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center' as const, fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#4B5320', marginBottom: '28px' }}>
            Beyond booking
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '18px' }}>
            {FEATURE_STRIP.map((f, i) => (
              <div key={i} style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4B5320', marginTop: '8px', flexShrink: 0 }} />
                <p style={{ fontSize: '15px', color: '#33332f', lineHeight: 1.6, margin: 0 }}>{f}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* FOUNDER */}
      <div style={{ background: '#F4F2EC', borderTop: '1px solid #D8D5C8', borderBottom: '1px solid #D8D5C8', padding: '64px 24px' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto', display: 'flex', gap: '28px', flexWrap: 'wrap' as const, alignItems: 'flex-start' }}>
          <img
            src="/landing/founder-photo.jpg"
            alt="Bear Bryant, founder of ChairOS, cutting a client's hair"
            style={{ width: '120px', height: '120px', borderRadius: '14px', objectFit: 'cover' as const, flexShrink: 0 }}
          />
          <div style={{ flex: '1 1 260px', minWidth: '240px' }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#1A1A18', marginBottom: '6px' }}>Bear Bryant, Founder</div>
            <div style={{ fontSize: '12px', color: '#65655F', marginBottom: '16px', lineHeight: 1.6 }}>
              US Navy Veteran &middot; Licensed Barber &middot; Former Shop Owner &middot; Barbering Instructor &middot; Infrastructure Engineer
            </div>
            <p style={{ fontSize: '14.5px', color: '#4F4F48', lineHeight: 1.7, margin: 0 }}>
              I built ChairOS after years behind the chair as a licensed barber and shop owner, dealing with the same problems independent shops face every day: disconnected tools, messy compensation, limited visibility, and no real way to understand the client relationships behind the revenue. As a barbering instructor, I kept thinking about the tools I wished I could hand my students. My background as a Navy veteran and my current work as an infrastructure engineer gave me the skills to actually build it. ChairOS is the system I wanted when I was running a shop.
            </p>
          </div>
        </div>
      </div>

      {/* PRICING */}
      <div style={{ padding: '64px 24px' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center' as const, fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#4B5320', marginBottom: '8px' }}>
            Pricing
          </div>
          <div style={{ textAlign: 'center' as const, fontSize: '13px', color: '#65655F', marginBottom: '28px' }}>
            30 days free. Cancel anytime.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
            {PRICING_PLANS.map(p => (
              <div key={p.name} style={{ background: '#F4F2EC', border: '1px solid #D8D5C8', borderRadius: '16px', padding: '24px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: '#65655F', marginBottom: '8px' }}>{p.name}</div>
                <div style={{ fontSize: '32px', fontWeight: 700, color: '#1A1A18', marginBottom: '4px' }}>
                  {p.price}<span style={{ fontSize: '14px', fontWeight: 400, color: '#65655F' }}>/mo</span>
                </div>
                <p style={{ fontSize: '13px', color: '#65655F', lineHeight: 1.5, margin: 0 }}>{p.description}</p>
              </div>
            ))}
          </div>
          <p style={{ textAlign: 'center' as const, fontSize: '12.5px', color: '#8a8a82', marginTop: '18px' }}>
            Most shops run 5 to 10 staff. That's as little as $7.90 per staff, per month.{' '}
            <button onClick={() => router.push('/subscribe')} style={{ background: 'none', border: 'none', color: '#4B5320', fontWeight: 600, cursor: 'pointer', font: 'inherit', padding: 0 }}>
              Full plan details →
            </button>
          </p>
        </div>
      </div>

      {/* FAQ */}
      <div style={{ background: '#F0EDE6', borderTop: '1px solid #D8D5C8', borderBottom: '1px solid #D8D5C8', padding: '64px 24px' }}>
        <div style={{ maxWidth: '620px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center' as const, fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#4B5320', marginBottom: '24px' }}>
            Questions
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '10px' }}>
            {FAQ_ITEMS.map((item, i) => (
              <div key={item.q} style={{ background: '#FAFAF7', border: '1px solid #D8D5C8', borderRadius: '12px', overflow: 'hidden' }}>
                <button
                  onClick={() => toggleFaq(i)}
                  style={{ width: '100%', display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' as const, font: 'inherit', color: 'inherit' }}
                >
                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#1A1A18' }}>{item.q}</span>
                  <span style={{ fontSize: '14px', color: '#65655F', flexShrink: 0 }}>{openFaq === i ? '−' : '+'}</span>
                </button>
                {openFaq === i && (
                  <p style={{ padding: '0 16px 16px', fontSize: '13.5px', color: '#65655F', lineHeight: 1.6, margin: 0 }}>{item.a}</p>
                )}
              </div>
            ))}
          </div>
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
