import VerticalLandingPage from '@/components/VerticalLandingPage'

export default function SalonsPage() {
  return (
    <VerticalLandingPage
      vertical="salon"
      badge="Built for salons"
      headlineLines={["Your stylist's clients.", "Not hers."]}
      subline="Every color formula and service note logs against your salon, not just the stylist who did the work. A stylist gives her two weeks, you already have her whole locked client list before her last day, not after."
      pains={[
        'Color timing chaos',
        'Double-booked processing time',
        'Stylists leaving with formulas',
        'Per-seat software fees',
        'No-shows on 3-hour blocks',
        'Guessing at your numbers',
      ]}
      heroPhones={['/landing/app-schedule.jpg', '/landing/app-insights.jpg']}
      proofEyebrow="Why salons switch"
      proofTitle="Built for the way a salon actually runs."
      proofPoints={[
        {
          title: 'One flat fee. However many stylists.',
          body: 'One flat fee for the whole salon, never a per-stylist seat charge. Add a fifth stylist tomorrow. The price doesn\u2019t move.',
        },
        {
          title: 'Color time that actually fits.',
          body: "Booking that understands real service time. Color and chemical processing blocks automatically, so no stylist's afternoon gets double-booked.",
        },
        {
          title: 'Formulas live with the client, not the stylist.',
          body: "Every color formula and service history saved to the client's profile. Any stylist who picks them up next sees it instantly.",
        },
      ]}
      showcaseTitle={["Not another booking widget.", "The whole salon, in your pocket."]}
      showcaseSub="Real screens from the real app. Nothing mocked up, nothing faked."
      showcase={[
        {
          img: '/landing/app-home.jpg',
          alt: 'ChairOS home screen showing Client Lock: 15 locked, 0 at risk',
          kicker: 'Client Lock',
          title: 'Her clients are your clients.',
          body: "From the second visit, every relationship is recorded under your salon — not in a stylist's phone. She gives notice, you keep the book: every client, every formula, every dollar accounted for.",
        },
        {
          img: '/landing/app-brief.jpg',
          alt: 'ChairOS daily brief with specific recommendations for the team',
          kicker: 'The Daily Brief',
          title: 'Color days, planned.',
          body: 'Processing blocks, back-to-back colors, who is due for a fill. The day gets planned before the first client sits down — with names, not a dashboard you have to decode.',
        },
        {
          img: '/landing/app-schedule.jpg',
          alt: 'ChairOS schedule showing the day with dollars on the books',
          kicker: 'Schedule',
          title: 'Real service time, real booking.',
          body: 'Color and chemical processing built into every slot. A three-hour color books three hours. The whole day in one glance, from the back bar or the couch.',
        },
        {
          img: '/landing/app-insights.jpg',
          alt: 'ChairOS insights with revenue, tips, and no-show rate',
          kicker: 'Insights',
          title: "Know what's actually making money.",
          body: 'Service mix, rebooking rate, no-show rate per stylist — the numbers behind the chair, plain as day. Flags what is sliding before it becomes a problem.',
        },
      ]}
      stats={{ locked: 15, atRisk: 0, revenueProtected: '$2,960' }}
      statsBody="Fifteen clients this salon would have lost track of if a stylist walked. Now they're counted, named, and worth $2,960 — formulas, history, and all."
      steps={[
        { t: 'Claim your page', d: "Your salon gets its own booking link in minutes. Your name, your services with real timing, your rules — clients book the salon, not a stylist's DMs." },
        { t: 'Connect Square', d: 'Card payments and deposits flow straight into your account. ChairOS never touches your money.' },
        { t: 'Share the link', d: 'Put it in the salon bio, on a QR card at the front desk. Clients book themselves — no app download, no account, no friction.' },
      ]}
      faqs={[
        {
          q: 'Does booking really understand color timing?',
          a: 'Yes. Set processing time per service and ChairOS blocks it automatically — a three-hour color books three hours, not ninety minutes. No more double-booked afternoons.',
        },
        {
          q: 'Is it really one price for all my stylists?',
          a: 'Yes. One Shop Owner subscription covers the whole salon, however many stylists you add. No per-seat fees, ever.',
        },
        {
          q: 'What happens to our color formulas if a stylist leaves?',
          a: "They stay with the client. Every formula and service note is saved to the client's profile under your salon, so whoever picks them up next sees the full history on day one.",
        },
        {
          q: 'Can a client rebook with a different stylist?',
          a: 'Of course — and the new stylist sees everything: formulas, notes, timing. That is the whole point of the record living with the salon instead of the stylist.',
        },
      ]}
      ctaHeadline={['Your salon.', 'Your clients.', 'Your formulas.']}
      ctaSub="30 days free. One flat price, however many stylists."
      founderLine="Built first for barbershops by a working barber, then built out for salons the same way. For the owner, not just the booking calendar."
    />
  )
}
