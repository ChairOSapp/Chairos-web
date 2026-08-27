'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { track } from '@vercel/analytics'
import LandingNav from '@/components/LandingNav'

function ScreenshotCard({ src, alt, chromeLabel }: { src: string; alt: string; chromeLabel: string }) {
  return (
    <div style={{ background: '#F4F2EC', border: '1px solid #D8D5C8', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.10)' }}>
      <div style={{ background: '#EAE8E0', borderBottom: '0.5px solid #D8D5C8', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        {['#ff5f57', '#ffbd2e', '#28ca41'].map((c, i) => <div key={i} style={{ width: '10px', height: '10px', borderRadius: '50%', background: c }} />)}
        <span style={{ fontSize: '11px', color: '#65655F', marginLeft: '8px', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>{chromeLabel}</span>
      </div>
      <img src={src} alt={alt} style={{ width: '100%', height: 320, objectFit: 'cover', objectPosition: 'top', display: 'block' }} />
    </div>
  )
}

export type VerticalPageProps = {
  vertical: 'barbershop' | 'salon' | 'tattoo'
  eyebrow: string
  headlineLines: string[]
  subline: string
  proofPoints: string[]
  screenshotSrc: string
  screenshotAlt: string
  founderLine: string
  clientLockStats: { locked: number; atRisk: number; revenueProtected: string }
}

export default function VerticalLandingPage({
  vertical,
  eyebrow,
  headlineLines,
  subline,
  proofPoints,
  screenshotSrc,
  screenshotAlt,
  founderLine,
  clientLockStats,
}: VerticalPageProps) {
  const router = useRouter()

  useEffect(() => {
    track('vertical_page_view', { vertical })
  }, [vertical])

  return (
    <div style={{ background: '#FAFAF7', minHeight: '100vh', fontFamily: "-apple-system, 'Helvetica Neue', sans-serif", color: '#1A1A18', overflowX: 'hidden' }}>
      <LandingNav />

      {/* HEADLINE + SUBLINE */}
      <div style={{ padding: '64px 24px 32px' }}>
        <div style={{ maxWidth: '680px', margin: '0 auto' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#4B5320', marginBottom: '14px' }}>
            {eyebrow}
          </div>
          <div style={{ fontSize: 'clamp(30px, 6vw, 44px)', fontWeight: 400, letterSpacing: '-1px', lineHeight: 1.15, color: '#1A1A18', marginBottom: '18px' }}>
            {headlineLines.map((line, li) => (
              <span key={li}>{line}{li < headlineLines.length - 1 && <br />}</span>
            ))}
          </div>
          <div style={{ fontSize: '17px', color: '#4F4F48', lineHeight: 1.65, maxWidth: '560px' }}>
            {subline}
          </div>
        </div>
      </div>

      {/* SCREENSHOT */}
      <div style={{ padding: '0 24px 48px' }}>
        <div style={{ maxWidth: '620px', margin: '0 auto' }}>
          <ScreenshotCard src={screenshotSrc} alt={screenshotAlt} chromeLabel="Live in production" />
        </div>
      </div>

      {/* PROOF POINTS */}
      <div style={{ padding: '0 24px 56px' }}>
        <div style={{ maxWidth: '680px', margin: '0 auto', display: 'grid', gap: '16px' }}>
          {proofPoints.map((p, i) => (
            <div key={i} style={{ background: '#F4F2EC', border: '1px solid #D8D5C8', borderRadius: '14px', padding: '20px 22px', display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
              <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#4B532015', border: '1px solid #4B532040', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px' }}>
                <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#4B5320' }} />
              </div>
              <div style={{ fontSize: '14.5px', color: '#33332f', lineHeight: 1.6 }}>{p}</div>
            </div>
          ))}
        </div>
      </div>

      {/* CLIENT LOCK STATS: real numbers from a seeded shop in this vertical */}
      <div style={{ padding: '0 24px 40px' }}>
        <div style={{ maxWidth: '460px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
          {[
            { value: String(clientLockStats.locked), label: 'Locked clients' },
            { value: String(clientLockStats.atRisk), label: 'At risk right now' },
            { value: clientLockStats.revenueProtected, label: 'Revenue protected' },
          ].map((stat, i) => (
            <div key={i} style={{ background: '#F4F2EC', border: '1px solid #D8D5C8', borderRadius: '12px', padding: '14px 8px', textAlign: 'center' as const }}>
              <div style={{ fontSize: '22px', fontWeight: 700, color: '#4B5320', marginBottom: '4px' }}>{stat.value}</div>
              <div style={{ fontSize: '10.5px', color: '#65655F' }}>{stat.label}</div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: '12px', color: '#8a8a82', marginTop: '12px', textAlign: 'center' as const }}>
          Real numbers from a live ChairOS shop.
        </p>
      </div>

      {/* FOUNDER CREDIBILITY LINE */}
      <div style={{ padding: '0 24px 56px' }}>
        <div style={{ maxWidth: '680px', margin: '0 auto', borderTop: '1px solid #D8D5C8', paddingTop: '28px' }}>
          <p style={{ fontSize: '14px', color: '#65655F', lineHeight: 1.6, fontStyle: 'italic' }}>{founderLine}</p>
        </div>
      </div>

      {/* CTA */}
      <div style={{ background: '#4B5320', padding: '64px 24px', textAlign: 'center' as const }}>
        <div style={{ maxWidth: '480px', margin: '0 auto' }}>
          <div style={{ fontSize: 'clamp(24px, 5vw, 32px)', fontWeight: 400, letterSpacing: '-0.6px', color: '#FAFAF7', marginBottom: '12px' }}>
            Start your free trial.
          </div>
          <div style={{ fontSize: '15px', color: '#B8C49A', marginBottom: '28px', lineHeight: 1.6 }}>
            $79/month after your first 30 days. Cancel anytime.
          </div>
          <button
            onClick={() => { track('hero_cta_click', { location: 'vertical_page', vertical }); router.push('/signup') }}
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
    </div>
  )
}
