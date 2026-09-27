import VerticalLandingPage from '@/components/VerticalLandingPage'

export default function BarbershopsPage() {
  return (
    <VerticalLandingPage
      vertical="barbershop"
      badge="Built for barbershops"
      headlineLines={["A barber builds his own book on your chair.", "Then he walks out the door with it."]}
      subline="The second time a client books, Client Lock claims them for your shop, not a barber's personal phone. A barber walks, his regulars are still sitting in your dashboard the next morning, ready to rebook."
      pains={[
        'Barbers walking with the book',
        'Empty chairs on Saturdays',
        'Commission math on napkins',
        'Clients texting barbers directly',
        'No-shows',
        'Guessing at your numbers',
      ]}
      heroPhones={['/landing/app-home.jpg', '/landing/app-schedule.jpg']}
      proofEyebrow="Why shops switch"
      proofTitle="Built for the way a shop actually runs."
      proofPoints={[
        {
          title: 'Every chair, live.',
          body: "See every chair in real time. Who's in, who's off, who's about to finish — from your phone or the front desk.",
        },
        {
          title: 'Payday without the spreadsheet.',
          body: 'Commission or booth rent, tracked automatically. Tips split per barber, automatically. No spreadsheet, ever.',
        },
        {
          title: "The book stays when they don't.",
          body: "Your booking page, your brand — not any one barber's. Clients book under your shop's name, every time.",
        },
      ]}
      showcaseTitle={["Not another booking widget.", "The whole shop, in your pocket."]}
      showcaseSub="Real screens from the real app. Nothing mocked up, nothing faked."
      showcase={[
        {
          img: '/landing/app-home.jpg',
          alt: 'ChairOS home screen showing Client Lock: 15 locked, 0 at risk',
          kicker: 'Client Lock',
          title: "You'll know exactly who's whose.",
          body: "From a client's second visit, they're locked to your shop — not to whoever holds the clippers. When a barber gives notice, you already know which clients are at risk and what they're worth. No more finding out the hard way.",
        },
        {
          img: '/landing/app-brief.jpg',
          alt: 'ChairOS daily brief with specific recommendations for the team',
          kicker: 'The Daily Brief',
          title: 'Wake up knowing which chair to fill.',
          body: "Every morning: who's in, who's off, which chair has a gap, and who's going cold. Names, not dashboards. The one thing that matters today, before your first cut.",
        },
        {
          img: '/landing/app-schedule.jpg',
          alt: 'ChairOS schedule showing the day with dollars on the books',
          kicker: 'Schedule',
          title: 'The whole shop in one glance.',
          body: 'Every chair, every cut, every dollar already on the books. One-tap checkout when the client is in the chair — the front desk fits in your back pocket.',
        },
        {
          img: '/landing/app-insights.jpg',
          alt: 'ChairOS insights with revenue, tips, and no-show rate',
          kicker: 'Insights',
          title: 'Commission math, done.',
          body: 'Cuts, tips, repeat rate per barber — plain as day. Payday stops being a Sunday-night spreadsheet, and you can see which chair is actually making you money.',
        },
      ]}
      stats={{ locked: 15, atRisk: 0, revenueProtected: '$2,275' }}
      statsBody="Fifteen clients this shop would have lost track of if a barber walked. Now they're counted, named, and worth $2,275 — and the owner can see it from the couch."
      steps={[
        { t: 'Claim your page', d: "Your shop gets its own booking link in minutes. Your name, your prices, your rules — clients book the shop, not a barber's personal number." },
        { t: 'Connect Square', d: 'Card payments and deposits flow straight into your account. ChairOS never touches your money.' },
        { t: 'Share the link', d: 'Put it in the shop bio, on a QR card at the register. Clients book themselves — no app download, no account, no friction.' },
      ]}
      faqs={[
        {
          q: 'My barbers already take bookings by text. Why change?',
          a: "Because those bookings live in their phones, not your shop. When a barber leaves, the book leaves with him. ChairOS puts every appointment under your roof — clients still text, they just book through your link.",
        },
        {
          q: 'Commission, booth rent, or both?',
          a: 'Both, per barber. Set each staff member up as commission or booth rent individually and ChairOS tracks it automatically — tips split, payouts calculated, no spreadsheet.',
        },
        {
          q: 'What actually happens when a barber leaves?',
          a: "You keep the client list. Client Lock has been recording every relationship under your shop since the client's second visit, so you know exactly who's at risk and what they're worth — before the last day, not after.",
        },
        {
          q: 'Do my barbers need to download anything?',
          a: 'No. They get a staff view right in the browser. Only you need the app — and even that is optional.',
        },
      ]}
      ctaHeadline={['Keep the book.', 'Fill the chairs.']}
      ctaSub="30 days free. Your clients stay yours from the second visit."
      founderLine="Built by a licensed barber and shop owner who lived this exact problem before writing a line of code."
    />
  )
}
