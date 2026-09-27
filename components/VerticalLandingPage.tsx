'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { track } from '@vercel/analytics'
import LandingNav from '@/components/LandingNav'

// ---------------------------------------------------------------------------
// Vertical landing pages — rebuilt 2026-09-27.
// Same cinematic dark design system as the main landing page: staggered hero
// entrance, floating phone mockups with real screenshots, olive pain marquee,
// scroll reveals, animated counters. Each vertical gets bespoke copy, pains,
// showcase captions, stats, FAQs and CTA — the scaffold is shared, the story
// is not.
// ---------------------------------------------------------------------------

const SERIF = "Georgia, 'Iowan Old Style', 'Times New Roman', serif"
const SANS = "-apple-system, 'Helvetica Neue', 'Segoe UI', sans-serif"
const OLIVE = '#4B5320'
const OLIVE_LIGHT = '#B8C49A'
const CREAM = '#FAFAF7'
const INK = '#1A1A18'
const CHARCOAL = '#141410'

export type VerticalShowcaseItem = {
  img: string
  alt: string
  kicker: string
  title: string
  body: string
}

export type VerticalPageProps = {
  vertical: 'barbershop' | 'salon' | 'tattoo'
  badge: string
  headlineLines: string[]
  subline: string
  pains: string[]
  heroPhones: [string, string]
  proofEyebrow: string
  proofTitle: string
  proofPoints: { title: string; body: string }[]
  showcaseTitle: string[]
  showcaseSub: string
  showcase: VerticalShowcaseItem[]
  stats: { locked: number; atRisk: number; revenueProtected: string }
  statsBody: string
  steps: { t: string; d: string }[]
  faqs: { q: string; a: string }[]
  ctaHeadline: string[]
  ctaSub: string
  founderLine: string
}

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
function Counter({ to, prefix = '', duration = 1500 }: { to: number; prefix?: string; duration?: number }) {
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
    </span>
  )
}

// --- Phone mockup ----------------------------------------------------------
function Phone({ src, alt, tilt = 'none', glow = false }: { src: string; alt: string; tilt?: string; glow?: boolean }) {
  return (
    <div
      className="phone"
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

export default function VerticalLandingPage(props: VerticalPageProps) {
  const {
    vertical,
    badge,
    headlineLines,
    subline,
    pains,
    heroPhones,
    proofEyebrow,
    proofTitle,
    proofPoints,
    showcaseTitle,
    showcaseSub,
    showcase,
    stats,
    statsBody,
    steps,
    faqs,
    ctaHeadline,
    ctaSub,
    founderLine,
  } = props

  const router = useRouter()
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  useEffect(() => {
    track('vertical_page_view', { vertical })
  }, [vertical])

  function goSignup(location: string) {
    track('hero_cta_click', { location: `vertical_${vertical}_${location}` })
    router.push('/signup')
  }

  function toggleFaq(i: number) {
    setOpenFaq(prev => {
      const next = prev === i ? null : i
      if (next !== null) track('faq_open', { vertical, question: faqs[i].q })
      return next
    })
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
              {badge}
            </div>
            <h1
              className="hero-in"
              style={{ fontFamily: SERIF, fontSize: 'clamp(40px, 6.6vw, 68px)', lineHeight: 1.08, fontWeight: 700, letterSpacing: '-1.5px', color: CREAM, margin: '0 0 22px', animationDelay: '90ms' }}
            >
              {headlineLines.map((line, li) => (
                <span key={li} style={li === headlineLines.length - 1 ? { color: OLIVE_LIGHT } : undefined}>
                  {line}
                  {li < headlineLines.length - 1 && <br />}
                </span>
              ))}
            </h1>
            <p className="hero-in" style={{ fontSize: '17px', color: '#C9C9C2', lineHeight: 1.7, marginBottom: '34px', maxWidth: '480px', animationDelay: '180ms' }}>
              {subline}
            </p>
            <div className="hero-in" style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'center', animationDelay: '260ms' }}>
              <button
                onClick={() => goSignup('top')}
                style={{ background: OLIVE, color: '#fff', fontSize: '16px', fontWeight: 700, padding: '16px 36px', borderRadius: '12px', border: 'none', cursor: 'pointer', boxShadow: '0 8px 28px rgba(75,83,32,0.45)' }}
                className="cta-pulse"
              >
                Start free trial
              </button>
              <button
                onClick={() => document.getElementById('showcase')?.scrollIntoView({ behavior: 'smooth' })}
                style={{ background: 'transparent', color: CREAM, fontSize: '15px', fontWeight: 600, padding: '15px 26px', borderRadius: '12px', border: '1px solid rgba(250,250,247,0.25)', cursor: 'pointer' }}
              >
                See it in action ↓
              </button>
            </div>
            <div className="hero-in" style={{ fontSize: '13px', color: '#8f8f88', marginTop: '16px', animationDelay: '320ms' }}>
              30 days free. No card required to start.
            </div>
          </div>
          <div className="hero-in hero-phones" style={{ display: 'flex', justifyContent: 'center', gap: '0', animationDelay: '220ms' }}>
            <div style={{ marginRight: '-56px', zIndex: 1 }} className="float-a">
              <Phone src={heroPhones[0]} alt="ChairOS app screen" tilt="rotate(-5deg)" glow />
            </div>
            <div style={{ marginTop: '64px', zIndex: 2 }} className="float-b">
              <Phone src={heroPhones[1]} alt="ChairOS app screen" tilt="rotate(4deg)" />
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
            .hero-phones .phone { width: min(230px, 48vw) !important; }
          }
        `}</style>
      </div>

      {/* ================= PAIN MARQUEE ================= */}
      <div style={{ background: OLIVE, overflow: 'hidden', padding: '15px 0', borderTop: '1px solid rgba(0,0,0,0.2)', borderBottom: '1px solid rgba(0,0,0,0.2)' }}>
        <div className="marquee-track">
          {[0, 1].map(copy => (
            <div key={copy} style={{ display: 'flex', flexShrink: 0, alignItems: 'center' }} aria-hidden={copy === 1}>
              {pains.map((item, i) => (
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

      {/* ================= PROOF POINTS ================= */}
      <div style={{ padding: 'clamp(64px, 9vw, 110px) 24px' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <Reveal>
            <div style={{ textAlign: 'center', marginBottom: '44px' }}>
              <Eyebrow>{proofEyebrow}</Eyebrow>
              <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(30px, 5vw, 46px)', fontWeight: 700, letterSpacing: '-1px', margin: 0 }}>
                {proofTitle}
              </h2>
            </div>
          </Reveal>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
            {proofPoints.map((p, i) => (
              <Reveal key={p.title} delay={i * 120}>
                <div style={{ background: '#fff', border: '1px solid #E4E1D4', borderRadius: '20px', padding: '30px 26px', height: '100%', boxShadow: '0 12px 36px rgba(26,26,24,0.06)' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: OLIVE, color: CREAM, fontSize: '18px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '18px', fontFamily: SERIF }}>
                    {i + 1}
                  </div>
                  <div style={{ fontSize: '17px', fontWeight: 700, color: INK, marginBottom: '10px' }}>{p.title}</div>
                  <p style={{ fontSize: '14px', color: '#65655F', lineHeight: 1.65, margin: 0 }}>{p.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
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
                {showcaseTitle.map((line, li) => (
                  <span key={li}>{line}{li < showcaseTitle.length - 1 && <br />}</span>
                ))}
              </h2>
              <p style={{ fontSize: '16px', color: '#a3a39b', lineHeight: 1.6, maxWidth: '540px', margin: '0 auto' }}>
                {showcaseSub}
              </p>
            </div>
          </Reveal>

          {showcase.map((f, i) => (
            <div
              key={f.kicker}
              className="show-row"
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '56px',
                alignItems: 'center',
                marginBottom: i === showcase.length - 1 ? 0 : 'clamp(72px, 9vw, 120px)',
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
                { value: <Counter to={stats.locked} />, label: 'Locked clients' },
                { value: <Counter to={stats.atRisk} />, label: 'At risk right now' },
                { value: <Counter to={Number(stats.revenueProtected.replace(/[^0-9]/g, ''))} prefix="$" />, label: 'Revenue protected' },
              ].map((s, i) => (
                <div key={i} style={{ background: 'rgba(250,250,247,0.08)', border: '1px solid rgba(250,250,247,0.2)', borderRadius: '18px', padding: '26px 12px' }}>
                  <div style={{ fontFamily: SERIF, fontSize: 'clamp(34px, 6vw, 52px)', fontWeight: 700, color: CREAM, marginBottom: '6px' }}>{s.value}</div>
                  <div style={{ fontSize: '12px', color: 'rgba(250,250,247,0.75)', letterSpacing: '0.04em' }}>{s.label}</div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: '15px', color: 'rgba(250,250,247,0.85)', lineHeight: 1.65, maxWidth: '560px', margin: '0 auto' }}>
              {statsBody}
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
            {steps.map((s, i) => (
              <Reveal key={s.t} delay={i * 120}>
                <div style={{ background: '#fff', border: '1px solid #E4E1D4', borderRadius: '20px', padding: '30px 26px', height: '100%', boxShadow: '0 12px 36px rgba(26,26,24,0.06)' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: OLIVE, color: '#fff', fontSize: '18px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '18px', fontFamily: SERIF }}>
                    {i + 1}
                  </div>
                  <div style={{ fontSize: '17px', fontWeight: 700, color: INK, marginBottom: '10px' }}>{s.t}</div>
                  <p style={{ fontSize: '14px', color: '#65655F', lineHeight: 1.65, margin: 0 }}>{s.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>

      {/* ================= FOUNDER ================= */}
      <div style={{ padding: '0 24px clamp(64px, 9vw, 100px)' }}>
        <div style={{ maxWidth: '680px', margin: '0 auto' }}>
          <Reveal>
            <div style={{ borderLeft: `3px solid ${OLIVE}`, paddingLeft: '22px' }}>
              <p style={{ fontFamily: SERIF, fontSize: 'clamp(18px, 3vw, 22px)', fontStyle: 'italic', color: '#33332f', lineHeight: 1.6, margin: '0 0 10px' }}>
                &ldquo;{founderLine}&rdquo;
              </p>
              <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8a8a82' }}>
                Bear Bryant — Founder, ChairOS
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
            {faqs.map((item, i) => (
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
              {ctaHeadline.map((line, li) => (
                <span key={li}>{line}{li < ctaHeadline.length - 1 && <br />}</span>
              ))}
            </h2>
            <p style={{ fontSize: '16px', color: '#a3a39b', marginBottom: '8px', lineHeight: 1.65 }}>
              {ctaSub}
            </p>
            <p style={{ fontSize: '14px', color: '#8f8f88', marginBottom: '32px', lineHeight: 1.6 }}>
              $79/month after your first 30 days. Cancel anytime.
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
    </div>
  )
}
