import VerticalLandingPage from '@/components/VerticalLandingPage'

export default function SalonsPage() {
  return (
    <VerticalLandingPage
      vertical="salon"
      eyebrow="Salons"
      headlineLines={["Your stylist's clients.", "Not hers."]}
      subline="Every color formula and service note logs against your salon, not just the stylist who did the work. A stylist gives her two weeks, you already have her whole locked client list before her last day, not after."
      proofPoints={[
        "One flat fee for the whole salon, never a per-stylist seat charge. Add a fifth stylist tomorrow. The price doesn't move.",
        "Booking that understands real service time. Color and chemical processing blocks automatically, so no stylist's afternoon gets double-booked.",
        "Every color formula and service history saved to the client's profile. Any stylist who picks them up next sees it instantly.",
      ]}
      founderLine="Built first for barbershops by a working barber, then built out for salons the same way. For the owner, not just the booking calendar."
      clientLockStats={{ locked: 15, atRisk: 0, revenueProtected: '$2,960' }}
    />
  )
}
