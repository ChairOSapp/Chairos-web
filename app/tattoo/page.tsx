import VerticalLandingPage from '@/components/VerticalLandingPage'

export default function TattooPage() {
  return (
    <VerticalLandingPage
      vertical="tattoo"
      badge="Built for tattoo studios"
      headlineLines={["Your artist left.", "Your client left with them."]}
      subline="A sleeve takes a dozen sessions over a couple of years with the same artist. Client Lock claims that entire relationship for your studio from visit two. An artist leaves mid-project, you know exactly which multi-session clients and dollars just walked out the door."
      pains={[
        'No-shows on 4-hour pieces',
        'Deposits chased over text',
        'Consent forms in a drawer',
        'Artists leaving mid-sleeve',
        'Setup time nobody booked',
        'Guessing at your numbers',
      ]}
      heroPhones={['/landing/app-home.jpg', '/landing/app-brief.jpg']}
      proofEyebrow="Why studios switch"
      proofTitle="Built for the way a studio actually runs."
      proofPoints={[
        {
          title: 'Deposits before the chair is held.',
          body: "Collect the deposit before the chair's ever held. Kill the no-show that eats a three-hour block you already turned other work away for.",
        },
        {
          title: 'Consent without the paper folder.',
          body: 'Consent signed and stored automatically, tied to the client and the session. Not a paper folder in a drawer.',
        },
        {
          title: 'Sessions built like a studio runs.',
          body: 'Sessions and consultations booked the way a studio actually runs, with real setup and cleanup time built into every appointment.',
        },
      ]}
      showcaseTitle={["Not another booking widget.", "The whole studio, in your pocket."]}
      showcaseSub="Real screens from the real app. Nothing mocked up, nothing faked."
      showcase={[
        {
          img: '/landing/app-home.jpg',
          alt: 'ChairOS home screen showing Client Lock: 17 locked, 0 at risk',
          kicker: 'Client Lock',
          title: 'The sleeve stays with the studio.',
          body: 'A dozen sessions over two years, all tied to your studio from visit two. An artist leaves mid-project — you know exactly which multi-session clients and dollars just walked out the door.',
        },
        {
          img: '/landing/app-brief.jpg',
          alt: 'ChairOS daily brief with specific recommendations for the team',
          kicker: 'The Daily Brief',
          title: 'Big days, handled.',
          body: 'Which pieces are in the chair today, whose deposit is still outstanding, which consults need follow-up. The morning brief before the machines buzz.',
        },
        {
          img: '/landing/app-schedule.jpg',
          alt: 'ChairOS schedule showing the day with dollars on the books',
          kicker: 'Schedule',
          title: 'Sessions with real setup time.',
          body: 'Setup and cleanup baked into every appointment. A four-hour piece books a four-hour piece — plus the time around it. No more back-to-back collisions.',
        },
        {
          img: '/landing/app-insights.jpg',
          alt: 'ChairOS insights with revenue, tips, and no-show rate',
          kicker: 'Insights',
          title: "Deposits doing their job.",
          body: 'Deposit collection rate, no-show rate, revenue per artist. Proof the policies are working — and an early flag when a book starts going soft.',
        },
      ]}
      stats={{ locked: 17, atRisk: 0, revenueProtected: '$5,010' }}
      statsBody="Seventeen multi-session clients this studio would have lost track of if an artist walked. Now they're counted, named, and worth $5,010 — sessions, deposits, and all."
      steps={[
        { t: 'Claim your page', d: "Your studio gets its own booking link in minutes. Your artists, your flash, your deposit rules — clients book the studio, not an artist's inbox." },
        { t: 'Connect Square', d: 'Deposits and payments flow straight into your account. ChairOS never touches your money.' },
        { t: 'Share the link', d: 'Put it in the studio bio, on a QR card at the counter. Clients book, pay the deposit, and sign consent — no app download, no account.' },
      ]}
      faqs={[
        {
          q: 'How do deposits work?',
          a: 'You set the deposit per service. The client pays it when they book — before the chair is ever held. No-show on a four-hour block? You already got paid for the trouble.',
        },
        {
          q: 'Is the consent actually stored properly?',
          a: 'Yes. Consent is signed digitally at booking and stored against the client and the session — timestamped, retrievable, no paper folder in a drawer.',
        },
        {
          q: 'We do multi-session pieces. Does that work?',
          a: "That is what it is built for. Sessions link into a project, each with real setup and cleanup time, deposits per session if you want them — and the whole relationship locked to your studio from visit two.",
        },
        {
          q: 'Do clients need an account or an app?',
          a: 'No. They book through your studio link in a browser. No download, no account, no friction — just the deposit and the consent.',
        },
      ]}
      ctaHeadline={['Book the piece.', 'Keep the deposit.']}
      ctaSub="30 days free. Deposits up front, consent handled, sessions that fit reality."
      founderLine="Built by a barber, adapted for how a tattoo studio actually runs. Long sessions, deposits, consent. Not a walk-in haircut."
    />
  )
}
