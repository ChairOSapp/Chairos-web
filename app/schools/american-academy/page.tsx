'use client'

// ---------------------------------------------------------------------------
// ChairOS for Schools — hidden pitch page for American Academy of Cosmetology.
// NOT linked in site nav. Thomas pulls this up as the demo/sales pitch.
// Later evolves into the school's booking URL.
// Route: /schools/american-academy
// ---------------------------------------------------------------------------

const SERIF = "Georgia, 'Iowan Old Style', 'Times New Roman', serif"
const SANS = "-apple-system, 'Helvetica Neue', 'Segoe UI', sans-serif"
const OLIVE = '#7A8C3A'
const OLIVE_DIM = '#B8C49A'
const CREAM = '#F2EFE6'
const MUTED = '#AAA696'
const BG = '#161A12'
const PANEL = '#20261A'
const DARK = '#12160E'

const wrap: React.CSSProperties = {
  background: BG, color: CREAM, fontFamily: SANS,
  minHeight: '100vh', paddingBottom: 80,
}
const inner: React.CSSProperties = { maxWidth: 1000, margin: '0 auto', padding: '0 24px' }
const eyebrow: React.CSSProperties = {
  color: OLIVE_DIM, fontSize: 13, letterSpacing: 4, fontWeight: 700, marginBottom: 18,
}
const h1: React.CSSProperties = {
  fontFamily: SERIF, fontSize: 'clamp(34px, 6vw, 58px)', lineHeight: 1.15,
  margin: '0 0 20px', fontWeight: 700,
}
const h2: React.CSSProperties = {
  fontFamily: SERIF, fontSize: 'clamp(26px, 4vw, 38px)', margin: '0 0 14px', fontWeight: 700,
}
const sub: React.CSSProperties = { color: MUTED, fontSize: 18, lineHeight: 1.6, maxWidth: 640 }
const card: React.CSSProperties = {
  background: PANEL, border: '1px solid #2C3324', borderRadius: 16, padding: 28,
}
const btn: React.CSSProperties = {
  display: 'inline-block', background: OLIVE, color: DARK, fontWeight: 700,
  padding: '14px 30px', borderRadius: 999, textDecoration: 'none', fontSize: 16,
}
const btnGhost: React.CSSProperties = {
  display: 'inline-block', border: '1px solid #3A422C', color: CREAM,
  padding: '14px 30px', borderRadius: 999, textDecoration: 'none', fontSize: 16,
}
const check: React.CSSProperties = { color: OLIVE, fontWeight: 700, marginRight: 10 }

const PAINS = [
  { t: 'Empty clinic chairs', d: 'The student clinic runs on walk-ins and paper books. Open chairs mean students practice on mannequins instead of people.' },
  { t: 'Guests come once, never return', d: 'No system remembers them, nobody follows up. Every guest is a one-time transaction instead of a standing appointment.' },
  { t: 'Grads start from zero', d: 'Students leave with a license and an empty book. Your enrollment team has nothing concrete to promise the next class.' },
]

const FEATURES = [
  { n: '01', t: 'Fills the clinic on autopilot', d: 'Every guest who walks in stays on file. Smart campaigns bring them back without your staff lifting a finger. A busy school means real experience — which is what tuition pays for.' },
  { n: '02', t: 'Gives enrollment a line that sells', d: '"You\'ll never sit around waiting for walk-ins. Our system keeps your book full while you learn." That sentence sells tuition.' },
  { n: '03', t: 'Hands every student a working book', d: 'Each student gets a full ChairOS account, free while enrolled. On graduation, one tap rolls it into their own $25/mo Solo Chair plan — clients, history, and reviews intact. Nobody starts from zero.' },
  { n: '04', t: 'Tracks tips, cleanly', d: 'Tips are recorded per student, and payout eligibility is tied to attendance and grades standing — your call, per student, from your own reports. Clean records mean students can claim the federal $25,000 no-tax-on-tips deduction. Only reported tips qualify.' },
  { n: '05', t: 'Shows where guests go', d: 'When a school guest follows a graduated student, you see it. Full visibility into your guest base — insight, not policing.' },
]

const STEPS = [
  { t: 'We set it up', d: 'Guest list loaded, student accounts created, staff trained. You don\'t touch a thing.' },
  { t: 'Clinic runs on it', d: 'Booking, reminders, win-back campaigns, and tip tracking run for 90 days while you watch the chairs fill.' },
  { t: 'You decide', d: 'Busier clinic at day 90? The founding rate locks in. Not convinced? Walk away — your data exports with you.' },
]

const FAQS = [
  { q: 'Do students pay anything?', a: 'Nothing while enrolled. Their account is covered by the campus license. After graduation they can roll it into their own $25/mo Solo Chair plan — or walk away, no strings.' },
  { q: 'Who handles tip payouts and tax filing?', a: 'The school does, like it does today. ChairOS tracks every tip per student and generates clean payout reports — including the records students need to claim the federal tip deduction. We never move the money.' },
  { q: 'What happens to our guest data if we leave?', a: 'It\'s yours. Full export at any time, including after the pilot. No hostage situations.' },
  { q: 'How is this different from the booking software we already have?', a: 'Most school software books appointments. ChairOS fills chairs — win-back campaigns, no-show protection, and a pipeline that turns today\'s students into tomorrow\'s paying professionals.' },
]

export default function SchoolPitch() {
  return (
    <div style={wrap}>
      {/* header */}
      <div style={{ borderBottom: '1px solid #2C3324' }}>
        <div style={{ ...inner, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 18, paddingBottom: 18 }}>
          <div style={{ fontFamily: SERIF, fontSize: 24, fontWeight: 700 }}>ChairOS <span style={{ color: OLIVE_DIM, fontFamily: SANS, fontSize: 13, fontWeight: 600, letterSpacing: 2, marginLeft: 8 }}>FOR SCHOOLS</span></div>
          <a href="/" style={{ color: MUTED, fontSize: 14, textDecoration: 'none' }}>chairos.cc</a>
        </div>
      </div>

      {/* hero */}
      <div style={{ ...inner, paddingTop: 56, paddingBottom: 56 }}>
        <div style={{ ...card, background: CREAM, border: 'none', display: 'flex', alignItems: 'center', gap: 26, marginBottom: 40, flexWrap: 'wrap' }}>
          <img src="/schools/aac-logo.png" alt="American Academy of Cosmetology" style={{ height: 66, width: 'auto' }} />
          <div>
            <div style={{ color: '#6B6B64', fontSize: 12, letterSpacing: 3, fontWeight: 700, marginBottom: 6 }}>PREPARED EXCLUSIVELY FOR</div>
            <div style={{ color: DARK, fontSize: 22, fontWeight: 700, fontFamily: SERIF }}>American Academy of Cosmetology</div>
            <div style={{ color: '#6B6B64', fontSize: 14, marginTop: 4 }}>1330 Blanding Blvd, Orange Park, FL · Founding School Offer</div>
          </div>
        </div>
        <div style={eyebrow}>CHAIROS FOR SCHOOLS — CAMPUS LICENSE</div>
        <h1 style={h1}>Your students graduate with a <span style={{ color: OLIVE_DIM }}>booked chair</span>, not an empty one.</h1>
        <p style={sub}>ChairOS runs the student clinic like a real shop — every guest on file, smart campaigns bringing them back, tips tracked per student — and hands every graduate a working client book on day one.</p>
        <div style={{ display: 'flex', gap: 14, marginTop: 32, flexWrap: 'wrap' }}>
          <a href="mailto:support@chairos.cc?subject=ChairOS%20Campus%20Pilot%20—%20American%20Academy" style={btn}>Start the 90-day pilot</a>
          <a href="#pricing" style={btnGhost}>See founding pricing</a>
        </div>
      </div>

      {/* problem */}
      <div style={{ ...inner, paddingBottom: 64 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          {PAINS.map(p => (
            <div key={p.t} style={card}>
              <div style={{ ...h2, fontSize: 22 }}>{p.t}</div>
              <p style={{ color: MUTED, fontSize: 15, lineHeight: 1.6, margin: 0 }}>{p.d}</p>
            </div>
          ))}
        </div>
      </div>

      {/* features */}
      <div style={{ ...inner, paddingBottom: 72 }}>
        <div style={eyebrow}>WHAT THE SCHOOL GETS</div>
        <h2 style={{ ...h2, marginBottom: 28 }}>One system. Five jobs done.</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {FEATURES.map(f => (
            <div key={f.n} style={{ ...card, display: 'flex', gap: 22 }}>
              <div style={{ fontFamily: SERIF, fontSize: 28, color: OLIVE, minWidth: 48 }}>{f.n}</div>
              <div>
                <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 8 }}>{f.t}</div>
                <p style={{ color: MUTED, fontSize: 15, lineHeight: 1.65, margin: 0 }}>{f.d}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* pricing */}
      <div id="pricing" style={{ ...inner, paddingBottom: 72 }}>
        <div style={eyebrow}>PRICING</div>
        <h2 style={{ ...h2, marginBottom: 8 }}>Founding rate. Locked for life.</h2>
        <p style={{ ...sub, marginBottom: 28 }}>5 admin seats + 145 student seats. The founding discount stays as long as you stay subscribed.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <div style={{ ...card, opacity: 0.75 }}>
            <div style={{ fontSize: 13, letterSpacing: 2, color: MUTED, fontWeight: 700, marginBottom: 12 }}>FULL PRODUCTION VALUE</div>
            <div style={{ fontFamily: SERIF, fontSize: 44, marginBottom: 4 }}>$1,500<span style={{ fontSize: 18, color: MUTED }}>/mo</span></div>
            <div style={{ color: MUTED, fontSize: 14, marginBottom: 18 }}>$18,000/yr — what this package lists at when it's a finished, self-serve product.</div>
            <div style={{ color: MUTED, fontSize: 14, lineHeight: 2 }}>
              <div><span style={check}>—</span>5 admin seats</div>
              <div><span style={check}>—</span>145 student seats</div>
              <div><span style={check}>—</span>Standard onboarding</div>
            </div>
          </div>
          <div style={{ ...card, border: '2px solid ' + OLIVE }}>
            <div style={{ fontSize: 13, letterSpacing: 2, color: OLIVE_DIM, fontWeight: 700, marginBottom: 12 }}>FOUNDING RATE — AMERICAN ACADEMY</div>
            <div style={{ fontFamily: SERIF, fontSize: 44, marginBottom: 4 }}>$349<span style={{ fontSize: 18, color: MUTED }}>/mo</span></div>
            <div style={{ color: MUTED, fontSize: 14, marginBottom: 18 }}>or <strong style={{ color: CREAM }}>$2,999/yr</strong> — works out to ~$250/mo.</div>
            <div style={{ fontSize: 14, lineHeight: 2 }}>
              <div><span style={check}>✓</span>5 admin seats</div>
              <div><span style={check}>✓</span>145 student seats</div>
              <div><span style={check}>✓</span>White-glove setup + staff training</div>
              <div><span style={check}>✓</span>Over 80% off full production</div>
            </div>
          </div>
        </div>
      </div>

      {/* pilot */}
      <div style={{ ...inner, paddingBottom: 72 }}>
        <div style={eyebrow}>THE PILOT</div>
        <h2 style={{ ...h2, marginBottom: 8 }}>90 days. Free. Then you decide.</h2>
        <p style={{ ...sub, marginBottom: 28 }}>If the clinic isn't busier at day 90, walk away.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 32 }}>
          {STEPS.map((s, i) => (
            <div key={s.t} style={card}>
              <div style={{ fontFamily: SERIF, fontSize: 28, color: OLIVE, marginBottom: 10 }}>Step {i + 1}</div>
              <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>{s.t}</div>
              <p style={{ color: MUTED, fontSize: 14, lineHeight: 1.6, margin: 0 }}>{s.d}</p>
            </div>
          ))}
        </div>
        <a href="mailto:support@chairos.cc?subject=ChairOS%20Campus%20Pilot%20—%20American%20Academy" style={btn}>Start the 90-day pilot</a>
      </div>

      {/* faq */}
      <div style={{ ...inner, paddingBottom: 72 }}>
        <div style={eyebrow}>STRAIGHT ANSWERS</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 20 }}>
          {FAQS.map(f => (
            <div key={f.q} style={card}>
              <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>{f.q}</div>
              <p style={{ color: MUTED, fontSize: 15, lineHeight: 1.65, margin: 0 }}>{f.a}</p>
            </div>
          ))}
        </div>
      </div>

      {/* final cta */}
      <div style={{ ...inner, textAlign: 'center', paddingTop: 24 }}>
        <h2 style={h2}>Full clinic. Graduates with books.<br />One system.</h2>
        <p style={{ ...sub, margin: '0 auto 28px', textAlign: 'center' }}>Founding schools lock the rate for life. There are only a handful of founding slots.</p>
        <a href="mailto:support@chairos.cc?subject=ChairOS%20Campus%20Pilot%20—%20American%20Academy" style={btn}>Talk to Thomas</a>
        <div style={{ color: MUTED, fontSize: 13, marginTop: 48 }}>
          Thomas Bryant, Founder — ChairOS · Former AAC instructor · Veteran-owned &amp; operated · Jacksonville, FL<br />support@chairos.cc · chairos.cc
        </div>
      </div>
    </div>
  )
}
