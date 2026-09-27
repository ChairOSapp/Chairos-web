'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { track } from '@vercel/analytics'
import { createClient } from '@/lib/supabase'
import LandingNav from '@/components/LandingNav'

// ---------------------------------------------------------------------------
// ChairOS landing — rebuilt 2026-09-27.
// Dark cinematic hero, real app screenshots in phone frames, an interactive
// no-show cost calculator, scroll reveals, animated counters. Copy is plain
// spoken — no AI gloss.
// ---------------------------------------------------------------------------

const SERIF = "Georgia, 'Iowan Old Style', 'Times New Roman', serif"
const SANS = "-apple-system, 'Helvetica Neue', 'Segoe UI', sans-serif"
const OLIVE = '#4B5320'
const OLIVE_LIGHT = '#B8C49A'
const CREAM = '#FAFAF7'
const INK = '#1A1A18'
const CHARCOAL = '#141410'

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

const MARQUEE_ITEMS = [
  'No-shows',
  'Empty chairs',
  'Clients following stylists out the door',
  'Double-booked Saturdays',
  'Chasing deposits over text',
  'Guessing at your numbers',
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
    a: "Yes. Clients book through a plain web page at your shop's own booking link, no app or account required on their end.",
  },
  {
    q: 'How does Client Lock work?',
    a: "From a client's second visit with the same staff member, Client Lock records that relationship under your shop, so you always know which clients belong to which staff member, and which ones are at risk if that person leaves.",
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
    a: "Cancelling stops billing and starts a 7-day grace period, then blocks dashboard access. Your shop's data is not deleted automatically.",
  },
]

// --- Scroll reveal wrapper -----------------------------------------------
function Reveal({ children, delay = 0, y = 28, className = '' }: { children: React.ReactNode; delay?: number; y?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          setVisible(true)
          io.disconnect()
        }
      },
      { threshold: 0.12 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'none' : `translateY(${y}px)`,
        transition: `opacity 0.8s ease ${delay}ms, transform 0.8s cubic-bezier(0.22,1,0.36,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  )
}

// --- Animated counter ------------------------------------------------------
function Counter({ to, prefix = '', suffix = '', duration = 1500 }: { to: number; prefix?: string; suffix?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const started = useRef(false)
  const [val, setVal] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && !started.current) {
          started.current = true
          const t0 = performance.now()
          const tick = (t: number) => {
            const p = Math.min(1, (t - t0) / duration)
            const eased = 1 - Math.pow(1 - p, 3)
            setVal(Math.round(to * eased))
            if (p < 1) requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
          io.disconnect()
        }
      },
      { threshold: 0.4 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [to, duration])
  return (
    <span ref={ref} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {prefix}
      {val.toLocaleString()}
      {suffix}
    </span>
  )
}

// --- Phone mockup ----------------------------------------------------------
function Phone({ src, alt, tilt = 'none', glow = false }: { src: string; alt: string; tilt?: string; glow?: boolean }) {
  return (
    <div
      style={{
        width: 'min(290px, 68vw)',
        flexShrink: 0,
        borderRadius: '46px',
        padding: '11px',
        background: '#0d0d0b',
        transform: tilt,
        boxShadow: glow
          ? '0 40px 100px rgba(0,0,0,0.55), 0 0 90px rgba(75,83,32,0.35), inset 0 0 0 2px #2b2b27'
          : '0 30px 70px rgba(0,0,0,0.4), inset 0 0 0 2px #2b2b27',
      }}
    >
      <div style={{ borderRadius: '36px', overflow: 'hidden', aspectRatio: '9 / 18.6', position: 'relative', background: '#000' }}>
        <img
          src={src}
          alt={alt}
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', display: 'block' }}
        />
        <div
          style={{
            position: 'absolute',
            top: '11px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '88px',
            height: '25px',
            borderRadius: '999px',
            background: '#0d0d0b',
          }}
        />
      </div>
    </div>
  )
}

// --- Eyebrow label ---------------------------------------------------------
function Eyebrow({ children, light = false }: { children: React.ReactNode; light?: boolean }) {
  return (
    <div
      style={{
        fontSize: '11px',
        fontWeight: 700,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: light ? OLIVE_LIGHT : OLIVE,
        marginBottom: '14px',
      }}
    >
      {children}
    </div>
  )
}

// --- No-show cost calculator ------------------------------------------------
function NoShowCalculator({ onCta }: { onCta: () => void }) {
  const [noShows, setNoShows] = useState(3)
  const [ticket, setTicket] = useState(45)
  const yearly = noShows * 52 * ticket
  const sliderStyle: React.CSSProperties = { width: '100%', accentColor: OLIVE, cursor: 'pointer' }
  return (
    <div style={{ background: '#fff', border: '1px solid #E4E1D4', borderRadius: '24px', padding: 'clamp(24px, 5vw, 44px)', boxShadow: '0 20px 60px rgba(26,26,24,0.08)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '32px', alignItems: 'center' }}>
        <div>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: INK, marginBottom: '10px' }}>
            No-shows per week: <span style={{ color: OLIVE, fontVariantNumeric: 'tabular-nums' }}>{noShows}</span>
          </label>
          <input type="range" min={0} max={15} value={noShows} onChange={e => setNoShows(Number(e.target.value))} style={sliderStyle} aria-label="No-shows per week" />
          <div style={{ height: '26px' }} />
          <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: INK, marginBottom: '10px' }}>
            Average ticket: <span style={{ color: OLIVE, fontVariantNumeric: 'tabular-nums' }}>${ticket}</span>
          </label>
          <input type="range" min={15} max={250} step={5} value={ticket} onChange={e => setTicket(Number(e.target.value))} style={sliderStyle} aria-label="Average ticket price" />
        </div>
        <div style={{ textAlign: 'center', borderLeft: '1px solid #EDEAE0', paddingLeft: '32px' }} className="calc-result">
          <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8a8a82', marginBottom: '8px' }}>
            Walking out your door every year
          </div>
          <div style={{ fontFamily: SERIF, fontSize: 'clamp(52px, 9vw, 84px)', fontWeight: 700, color: '#B3261E', letterSpacing: '-2px', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            ${yearly.toLocaleString()}
          </div>
          <p style={{ fontSize: '14px', color: '#65655F', lineHeight: 1.6, margin: '14px 0 20px' }}>
            ChairOS collects deposits when clients book. No-shows either show up — or pay you anyway.
          </p>
          <button
            onClick={() => { track('calculator_cta_click'); onCta() }}
            style={{ background: OLIVE, color: '#fff', fontSize: '14px', fontWeight: 700, padding: '13px 28px', borderRadius: '10px', border: 'none', cursor: 'pointer' }}
          >
            Stop the bleed — start free
          </button>
        </div>
      </div>
      <style>{`
        @media (max-width: 640px) {
          .calc-result { border-left: none !important; padding-left: 0 !important; border-top: 1px solid #EDEAE0; padding-top: 28px; }
        }
      `}</style>
    </div>
  )
}

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

  function goSignup(location: string) {
    track('hero_cta_click', { location })
    router.push('/signup')
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

  function scrollToShowcase() {
    track('see_it_in_action_click')
    document.getElementById('showcase')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div style={{ background: CREAM, minHeight: '100vh', fontFamily: SANS, color: INK, overflowX: 'hidden' }}>
      <LandingNav />

      {/* ================= HERO ================= */}
      <div style={{ background: CHARCOAL, position: 'relative', overflow: 'hidden' }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(900px 480px at 78% 18%, rgba(75,83,32,0.5), transparent 65%), radial-gradient(700px 500px at 12% 88%, rgba(75,83,32,0.28), transparent 60%)',
            pointerEvents: 'none',
          }}
        />
        <div
          className="hero-grid"
          style={{
            position: 'relative',
            maxWidth: '1120px',
            margin: '0 auto',
            padding: 'clamp(56px, 8vw, 110px) 24px clamp(64px, 8vw, 110px)',
            display: 'grid',
            gridTemplateColumns: '1.05fr 0.95fr',
            gap: '48px',
            alignItems: 'center',
          }}
        >
          <div>
            <div className="hero-in" style={{ display: 'inline-flex', alignItems: 'center', fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: OLIVE_LIGHT, background: 'rgba(184,196,154,0.1)', border: '1px solid rgba(184,196,154,0.3)', borderRadius: '999px', padding: '7px 15px', marginBottom: '26px', animationDelay: '0ms' }}>
              Veteran-Owned &amp; Operated
            </div>
            <h1
              className="hero-in"
              style={{ fontFamily: SERIF, fontSize: 'clamp(44px, 7.2vw, 76px)', lineHeight: 1.04, fontWeight: 700, letterSpacing: '-1.5px', color: CREAM, margin: '0 0 22px', animationDelay: '90ms' }}
            >
              Own your shop.<br />Lock your clients.<br /><span style={{ color: OLIVE_LIGHT }}>Scale your business.</span>
            </h1>
            <p className="hero-in" style={{ fontSize: '17px', color: '#C9C9C2', lineHeight: 1.7, marginBottom: '12px', maxWidth: '480px', animationDelay: '180ms' }}>
              A barber built this after watching clients walk out the door with the people who cut their hair. Booking, deposits, and the relationships behind your revenue — finally in one place.
            </p>
            <p className="hero-in" style={{ fontSize: '14px', color: '#8f8f88', lineHeight: 1.6, marginBottom: '34px', animationDelay: '240ms' }}>
              The operating system for independent shops.
            </p>
            <div className="hero-in" style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'center', animationDelay: '300ms' }}>
              <button
                onClick={() => goSignup('top')}
                style={{ background: OLIVE, color: '#fff', fontSize: '16px', fontWeight: 700, padding: '16px 36px', borderRadius: '12px', border: 'none', cursor: 'pointer', boxShadow: '0 8px 28px rgba(75,83,32,0.45)' }}
                className="cta-pulse"
              >
                Start free trial
              </button>
              <button
                onClick={scrollToShowcase}
                style={{ background: 'transparent', color: CREAM, fontSize: '15px', fontWeight: 600, padding: '15px 26px', borderRadius: '12px', border: '1px solid rgba(250,250,247,0.25)', cursor: 'pointer' }}
              >
                See it in action ↓
              </button>
            </div>
            <div className="hero-in" style={{ fontSize: '13px', color: '#8f8f88', marginTop: '16px', animationDelay: '360ms' }}>
              30 days free. No card required to start.
            </div>
          </div>
          <div className="hero-in hero-phones" style={{ display: 'flex', justifyContent: 'center', gap: '0', animationDelay: '220ms' }}>
            <div style={{ marginRight: '-56px', zIndex: 1 }} className="float-a">
              <Phone src="/landing/app-home.jpg" alt="ChairOS home screen with Client Lock stats" tilt="rotate(-5deg)" glow />
            </div>
            <div style={{ marginTop: '64px', zIndex: 2 }} className="float-b">
              <Phone src="/landing/app-brief.jpg" alt="ChairOS daily brief with the one thing to do today" tilt="rotate(4deg)" />
            </div>
          </div>
        </div>
        <style>{`
          .hero-in { opacity: 0; animation: heroUp 0.9s cubic-bezier(0.22,1,0.36,1) forwards; }
          @keyframes heroUp { from { opacity: 0; transform: translateY(26px); } to { opacity: 1; transform: none; } }
          .float-a { animation: floatA 7s ease-in-out infinite; }
          .float-b { animation: floatB 8s ease-in-out infinite; }
          @keyframes floatA { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-12px); } }
          @keyframes floatB { 0%,100% { transform: translateY(-6px); } 50% { transform: translateY(8px); } }
          .cta-pulse { transition: transform 0.2s ease, box-shadow 0.2s ease; }
          .cta-pulse:hover { transform: translateY(-2px); box-shadow: 0 12px 34px rgba(75,83,32,0.55); }
          @media (max-width: 900px) {
            .hero-grid { grid-template-columns: 1fr !important; }
            .hero-phones { margin-top: 12px; }
          }
        `}</style>
      </div>

      {/* ================= MARQUEE ================= */}
      <div style={{ background: OLIVE, overflow: 'hidden', padding: '15px 0', borderTop: '1px solid rgba(0,0,0,0.2)', borderBottom: '1px solid rgba(0,0,0,0.2)' }}>
        <div className="marquee-track">
          {[0, 1].map(copy => (
            <div key={copy} style={{ display: 'flex', flexShrink: 0, alignItems: 'center' }} aria-hidden={copy === 1}>
              {MARQUEE_ITEMS.map((item, i) => (
                <span key={i} style={{ display: 'inline-flex', alignItems: 'center', color: CREAM, fontSize: '13px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', whiteSpace: 'nowrap', padding: '0 26px' }}>
                  {item} <span style={{ marginLeft: '52px', opacity: 0.5 }}>✦</span>
                </span>
              ))}
            </div>
          ))}
        </div>
        <style>{`
          .marquee-track { display: flex; width: max-content; animation: marquee 30s linear infinite; }
          @keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        `}</style>
      </div>

      {/* ================= NO-SHOW CALCULATOR ================= */}
      <div style={{ padding: 'clamp(64px, 9vw, 110px) 24px' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <Reveal>
            <div style={{ textAlign: 'center', marginBottom: '36px' }}>
              <Eyebrow>The math nobody wants to do</Eyebrow>
              <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(30px, 5vw, 46px)', fontWeight: 700, letterSpacing: '-1px', margin: '0 0 12px' }}>
                What are no-shows costing you?
              </h2>
              <p style={{ fontSize: '16px', color: '#65655F', lineHeight: 1.6, maxWidth: '520px', margin: '0 auto' }}>
                Be honest. Move the sliders. That number is real money that booked a chair and never sat in it.
              </p>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <NoShowCalculator onCta={() => goSignup('calculator')} />
          </Reveal>
        </div>
      </div>

      {/* ================= SHOWCASE ================= */}
      <div id="showcase" style={{ background: CHARCOAL, padding: 'clamp(64px, 9vw, 110px) 24px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(800px 420px at 15% 10%, rgba(75,83,32,0.35), transparent 65%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', maxWidth: '1060px', margin: '0 auto' }}>
          <Reveal>
            <div style={{ textAlign: 'center', marginBottom: 'clamp(48px, 6vw, 80px)' }}>
              <Eyebrow light>This is ChairOS</Eyebrow>
              <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(30px, 5vw, 46px)', fontWeight: 700, letterSpacing: '-1px', color: CREAM, margin: '0 0 12px' }}>
                Not another booking widget.<br />The whole shop, in your pocket.
              </h2>
              <p style={{ fontSize: '16px', color: '#a3a39b', lineHeight: 1.6, maxWidth: '540px', margin: '0 auto' }}>
                Real screens from the real app. Nothing mocked up, nothing faked.
              </p>
            </div>
          </Reveal>

          {[
            {
              img: '/landing/app-home.jpg',
              alt: 'ChairOS home screen showing Client Lock: 15 locked, 0 at risk',
              kicker: 'Client Lock',
              title: "You'll know exactly who's yours.",
              body: "From a client's second visit, they're locked to your shop — not to whoever holds the clippers. When someone gives notice, you already know which clients are at risk and what they're worth. No more finding out the hard way.",
            },
            {
              img: '/landing/app-brief.jpg',
              alt: 'ChairOS daily brief with specific recommendations for the team',
              kicker: 'The Daily Brief',
              title: 'Wake up to a plan, not a prayer.',
              body: "Every morning ChairOS reads your books and tells you the one thing that matters today — which chair needs filling, who's going cold, where the money is hiding. Specific, with names. Not a dashboard you have to decode.",
            },
            {
              img: '/landing/app-schedule.jpg',
              alt: 'ChairOS schedule showing the day with dollars on the books',
              kicker: 'Schedule',
              title: 'Your whole day, one glance.',
              body: "Every appointment, every dollar already on the books, one-tap checkout when the client is in the chair. The front desk fits in your back pocket — evenings, weekends, whenever.",
            },
            {
              img: '/landing/app-insights.jpg',
              alt: 'ChairOS insights with revenue, tips, and no-show rate',
              kicker: 'Insights',
              title: 'Stop guessing.',
              body: "Revenue, tips, repeat rate, no-show rate — the numbers behind the chair, plain as day. ChairOS even flags what's sliding before it becomes a problem, with the real numbers behind every flag.",
            },
          ].map((f, i) => (
            <div
              key={f.kicker}
              className="show-row"
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '56px',
                alignItems: 'center',
                marginBottom: i === 3 ? 0 : 'clamp(72px, 9vw, 120px)',
              }}
            >
              <Reveal className={i % 2 === 1 ? 'show-phone-right' : ''}>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <Phone src={f.img} alt={f.alt} tilt={i % 2 === 0 ? 'rotate(-3deg)' : 'rotate(3deg)'} />
                </div>
              </Reveal>
              <Reveal delay={140} className={i % 2 === 1 ? 'show-text-left' : ''}>
                <div>
                  <Eyebrow light>{f.kicker}</Eyebrow>
                  <h3 style={{ fontFamily: SERIF, fontSize: 'clamp(26px, 4vw, 38px)', fontWeight: 700, letterSpacing: '-0.8px', color: CREAM, margin: '0 0 16px', lineHeight: 1.15 }}>
                    {f.title}
                  </h3>
                  <p style={{ fontSize: '16px', color: '#b9b9b1', lineHeight: 1.75, margin: 0, maxWidth: '440px' }}>
                    {f.body}
                  </p>
                </div>
              </Reveal>
            </div>
          ))}
        </div>
        <style>{`
          @media (max-width: 860px) {
            .show-row { grid-template-columns: 1fr !important; gap: 36px !important; }
            .show-phone-right { order: 0 !important; }
          }
          @media (min-width: 861px) {
            .show-phone-right { order: 2 !important; }
            .show-text-left { order: 1 !important; }
          }
        `}</style>
      </div>

      {/* ================= STATS BAND ================= */}
      <div style={{ background: OLIVE, padding: 'clamp(56px, 7vw, 84px) 24px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', textAlign: 'center' }}>
          <Reveal>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(250,250,247,0.75)', marginBottom: '30px' }}>
              From a live ChairOS shop
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '22px' }} className="stats-grid">
              {[
                { value: <Counter to={15} />, label: 'Locked clients' },
                { value: <Counter to={0} />, label: 'At risk right now' },
                { value: <Counter to={2275} prefix="$" />, label: 'Revenue protected' },
              ].map((s, i) => (
                <div key={i} style={{ background: 'rgba(250,250,247,0.08)', border: '1px solid rgba(250,250,247,0.2)', borderRadius: '18px', padding: '26px 12px' }}>
                  <div style={{ fontFamily: SERIF, fontSize: 'clamp(34px, 6vw, 52px)', fontWeight: 700, color: CREAM, marginBottom: '6px' }}>{s.value}</div>
                  <div style={{ fontSize: '12px', color: 'rgba(250,250,247,0.75)', letterSpacing: '0.04em' }}>{s.label}</div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: '15px', color: 'rgba(250,250,247,0.85)', lineHeight: 1.65, maxWidth: '560px', margin: '0 auto' }}>
              Fifteen clients this shop would have lost track of if a barber walked. Now they're counted, named, and worth $2,275 — and the owner can see it from the couch.
            </p>
          </Reveal>
        </div>
        <style>{`
          @media (max-width: 600px) { .stats-grid { grid-template-columns: 1fr !important; max-width: 320px; margin: 0 auto 22px; } }
        `}</style>
      </div>

      {/* ================= HOW IT WORKS ================= */}
      <div style={{ padding: 'clamp(64px, 9vw, 110px) 24px' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <Reveal>
            <div style={{ textAlign: 'center', marginBottom: '44px' }}>
              <Eyebrow>Up and running today</Eyebrow>
              <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(30px, 5vw, 46px)', fontWeight: 700, letterSpacing: '-1px', margin: 0 }}>
                Three steps. No IT department.
              </h2>
            </div>
          </Reveal>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
            {[
              { n: '1', t: 'Claim your page', d: "Your shop gets its own booking link in minutes. It looks like you — your name, your prices, your rules — not like software." },
              { n: '2', t: 'Connect Square', d: 'Card payments and deposits flow straight into your account. ChairOS never touches your money, and shops without Square simply fail closed.' },
              { n: '3', t: 'Share the link', d: 'Put it in your bio, on a QR card at the register, anywhere. Clients book themselves — no app download, no account, no friction.' },
            ].map((s, i) => (
              <Reveal key={s.n} delay={i * 120}>
                <div style={{ background: '#fff', border: '1px solid #E4E1D4', borderRadius: '20px', padding: '30px 26px', height: '100%', boxShadow: '0 12px 36px rgba(26,26,24,0.06)' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: OLIVE, color: '#fff', fontSize: '18px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '18px', fontFamily: SERIF }}>
                    {s.n}
                  </div>
                  <div style={{ fontSize: '17px', fontWeight: 700, color: INK, marginBottom: '10px' }}>{s.t}</div>
                  <p style={{ fontSize: '14px', color: '#65655F', lineHeight: 1.65, margin: 0 }}>{s.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>

      {/* ================= VERTICALS ================= */}
      <div style={{ padding: '0 24px clamp(64px, 9vw, 110px)' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <Reveal>
            <div style={{ textAlign: 'center', fontSize: '13px', fontWeight: 600, color: '#65655F', letterSpacing: '0.04em', marginBottom: '24px' }}>
              What kind of shop are you running?
            </div>
          </Reveal>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '20px' }}>
            {VERTICAL_TILES.map((v, i) => (
              <Reveal key={v.href} delay={i * 100}>
                <button
                  onClick={() => router.push(v.href)}
                  className="vertical-tile"
                  style={{ width: '100%', background: '#fff', border: '1px solid #E4E1D4', borderRadius: '20px', padding: '30px 26px', textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit', boxShadow: '0 12px 36px rgba(26,26,24,0.06)' }}
                >
                  <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: OLIVE, color: CREAM, fontSize: '18px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '18px', fontFamily: SERIF }}>
                    {v.initial}
                  </div>
                  <div style={{ fontSize: '17px', fontWeight: 700, color: INK, marginBottom: '8px' }}>{v.label}</div>
                  <div style={{ fontSize: '14px', color: '#65655F', lineHeight: 1.6, marginBottom: '16px' }}>{v.description}</div>
                  <span style={{ fontSize: '13px', color: OLIVE, fontWeight: 700 }}>See how it fits →</span>
                </button>
              </Reveal>
            ))}
          </div>
        </div>
      </div>

      {/* ================= PRICING ================= */}
      <div style={{ background: '#F0EDE6', borderTop: '1px solid #D8D5C8', borderBottom: '1px solid #D8D5C8', padding: 'clamp(64px, 9vw, 100px) 24px' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto' }}>
          <Reveal>
            <div style={{ textAlign: 'center', marginBottom: '36px' }}>
              <Eyebrow>Pricing</Eyebrow>
              <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(30px, 5vw, 44px)', fontWeight: 700, letterSpacing: '-1px', margin: '0 0 10px' }}>
                One flat price. No per-chair math.
              </h2>
              <p style={{ fontSize: '14px', color: '#65655F' }}>30 days free. Cancel anytime.</p>
            </div>
          </Reveal>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
            {PRICING_PLANS.map((p, i) => (
              <Reveal key={p.name} delay={i * 120}>
                <div style={{ background: CREAM, border: i === 1 ? `2px solid ${OLIVE}` : '1px solid #D8D5C8', borderRadius: '20px', padding: '32px 28px', position: 'relative' }}>
                  {i === 1 && (
                    <div style={{ position: 'absolute', top: '-13px', left: '50%', transform: 'translateX(-50%)', background: OLIVE, color: '#fff', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '5px 14px', borderRadius: '999px', whiteSpace: 'nowrap' }}>
                      Most shops pick this
                    </div>
                  )}
                  <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#65655F', marginBottom: '10px' }}>{p.name}</div>
                  <div style={{ fontFamily: SERIF, fontSize: '44px', fontWeight: 700, color: INK, marginBottom: '6px', letterSpacing: '-1px' }}>
                    {p.price}<span style={{ fontFamily: SANS, fontSize: '15px', fontWeight: 400, color: '#65655F' }}>/mo</span>
                  </div>
                  <p style={{ fontSize: '14px', color: '#65655F', lineHeight: 1.6, margin: '0 0 22px' }}>{p.description}</p>
                  <button
                    onClick={() => goSignup('pricing')}
                    style={{ width: '100%', background: i === 1 ? OLIVE : 'transparent', color: i === 1 ? '#fff' : OLIVE, fontSize: '14px', fontWeight: 700, padding: '13px', borderRadius: '10px', border: i === 1 ? 'none' : `1.5px solid ${OLIVE}`, cursor: 'pointer' }}
                  >
                    Start free trial
                  </button>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal>
            <p style={{ textAlign: 'center', fontSize: '13px', color: '#8a8a82', marginTop: '22px', lineHeight: 1.6 }}>
              Most shops run 5 to 10 staff. That&apos;s as little as $7.90 per staff, per month.{' '}
              <button onClick={() => router.push('/subscribe')} style={{ background: 'none', border: 'none', color: OLIVE, fontWeight: 700, cursor: 'pointer', font: 'inherit', padding: 0 }}>
                Full plan details →
              </button>
            </p>
          </Reveal>
        </div>
      </div>

      {/* ================= FOUNDER ================= */}
      <div style={{ padding: 'clamp(64px, 9vw, 100px) 24px' }}>
        <div style={{ maxWidth: '680px', margin: '0 auto' }}>
          <Reveal>
            <div style={{ display: 'flex', gap: '28px', flexWrap: 'wrap', alignItems: 'flex-start', background: '#fff', border: '1px solid #E4E1D4', borderRadius: '24px', padding: 'clamp(24px, 5vw, 40px)', boxShadow: '0 16px 48px rgba(26,26,24,0.07)' }}>
              <img
                src="/landing/founder-photo.jpg"
                alt="Bear Bryant, founder of ChairOS, cutting a client's hair"
                style={{ width: '120px', height: '120px', borderRadius: '16px', objectFit: 'cover', flexShrink: 0 }}
              />
              <div style={{ flex: '1 1 260px', minWidth: '240px' }}>
                <Eyebrow>Why this exists</Eyebrow>
                <div style={{ fontSize: '16px', fontWeight: 700, color: INK, marginBottom: '4px' }}>Bear Bryant, Founder</div>
                <div style={{ fontSize: '12px', color: '#65655F', marginBottom: '16px', lineHeight: 1.6 }}>
                  US Navy Veteran · Licensed Barber · Former Shop Owner · Barbering Instructor · Infrastructure Engineer
                </div>
                <p style={{ fontSize: '15px', color: '#4F4F48', lineHeight: 1.75, margin: 0 }}>
                  &ldquo;I built ChairOS after years behind the chair — juggling disconnected tools, messy pay setups, and no real picture of the client relationships behind the revenue. As a barbering instructor, I kept thinking about the tools I wished I could hand my students. This is the system I wanted when I was running a shop.&rdquo;
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </div>

      {/* ================= FAQ ================= */}
      <div style={{ background: '#F0EDE6', borderTop: '1px solid #D8D5C8', padding: 'clamp(64px, 9vw, 100px) 24px' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <Reveal>
            <div style={{ textAlign: 'center', marginBottom: '30px' }}>
              <Eyebrow>Questions</Eyebrow>
              <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(28px, 4.5vw, 40px)', fontWeight: 700, letterSpacing: '-0.8px', margin: 0 }}>
                Asked all the time.
              </h2>
            </div>
          </Reveal>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {FAQ_ITEMS.map((item, i) => (
              <Reveal key={item.q} delay={Math.min(i * 60, 240)}>
                <div style={{ background: CREAM, border: '1px solid #D8D5C8', borderRadius: '14px', overflow: 'hidden' }}>
                  <button
                    onClick={() => toggleFaq(i)}
                    style={{ width: '100%', display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', padding: '16px 18px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'inherit' }}
                  >
                    <span style={{ fontSize: '15px', fontWeight: 600, color: INK }}>{item.q}</span>
                    <span style={{ fontSize: '18px', color: OLIVE, flexShrink: 0, fontWeight: 700 }}>{openFaq === i ? '−' : '+'}</span>
                  </button>
                  {openFaq === i && (
                    <p style={{ padding: '0 18px 18px', fontSize: '14px', color: '#65655F', lineHeight: 1.65, margin: 0 }}>{item.a}</p>
                  )}
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>

      {/* ================= FINAL CTA ================= */}
      <div style={{ background: CHARCOAL, padding: 'clamp(72px, 10vw, 120px) 24px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(700px 380px at 50% 100%, rgba(75,83,32,0.5), transparent 65%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', maxWidth: '560px', margin: '0 auto' }}>
          <Reveal>
            <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(32px, 6vw, 52px)', fontWeight: 700, letterSpacing: '-1.2px', color: CREAM, margin: '0 0 14px', lineHeight: 1.1 }}>
              Your chairs are ready.<br />Are your books?
            </h2>
            <p style={{ fontSize: '16px', color: '#a3a39b', marginBottom: '32px', lineHeight: 1.65 }}>
              30 days free. Set up in an afternoon. Cancel anytime — your data stays yours.
            </p>
            <button
              onClick={() => goSignup('bottom')}
              className="cta-pulse"
              style={{ background: OLIVE, color: '#fff', fontSize: '16px', fontWeight: 700, padding: '16px 44px', borderRadius: '12px', border: 'none', cursor: 'pointer', boxShadow: '0 8px 28px rgba(75,83,32,0.45)' }}
            >
              Start free trial
            </button>
          </Reveal>
        </div>
      </div>

      <footer style={{ background: '#0f0f0d', padding: '28px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ fontSize: '20px', color: CREAM, fontFamily: SERIF }}>Chair<span style={{ color: OLIVE_LIGHT }}>OS</span></div>
        <div style={{ fontSize: '12px', color: '#6a6a62' }}>chairos.cc · Built for the industry, by the industry</div>
      </footer>

      <style>{`
        .vertical-tile { transition: transform 0.25s ease, box-shadow 0.25s ease; }
        .vertical-tile:hover { transform: translateY(-5px); box-shadow: 0 20px 50px rgba(26,26,24,0.12); }
      `}</style>
    </div>
  )
}
