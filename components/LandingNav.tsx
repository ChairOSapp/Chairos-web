'use client'
import { useRouter, usePathname } from 'next/navigation'

const LINKS = [
  { href: '/barbershops', label: 'Barbershops' },
  { href: '/salons', label: 'Salons' },
  { href: '/tattoo', label: 'Tattoo Studios' },
]

export default function LandingNav() {
  const router = useRouter()
  const pathname = usePathname()

  return (
    <nav style={{ background: 'rgba(250,250,247,0.92)', backdropFilter: 'blur(12px)', borderBottom: '0.5px solid #D8D5C8', padding: '0 24px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 }}>
      <button onClick={() => router.push('/')} style={{ fontSize: '22px', letterSpacing: '-0.5px', fontWeight: 400, background: 'none', border: 'none', cursor: 'pointer', color: '#1A1A18', padding: 0 }}>
        Chair<span style={{ color: '#4B5320' }}>OS</span>
      </button>
      <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '18px' }} className="landing-nav-links">
          {LINKS.map(l => (
            <button
              key={l.href}
              onClick={() => router.push(l.href)}
              style={{
                fontSize: '13px',
                fontWeight: 600,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: pathname === l.href ? '#4B5320' : '#65655F',
              }}
            >
              {l.label}
            </button>
          ))}
        </div>
        <button onClick={() => router.push('/login')} style={{ fontSize: '13px', color: '#65655F', background: 'none', border: 'none', cursor: 'pointer' }}>Sign in</button>
        <button onClick={() => router.push('/signup')} style={{ background: '#4B5320', color: '#fff', fontSize: '13px', fontWeight: 700, padding: '8px 18px', borderRadius: '8px', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          Start free trial
        </button>
      </div>
      <style>{`
        @media (max-width: 680px) {
          .landing-nav-links { display: none !important; }
        }
      `}</style>
    </nav>
  )
}
