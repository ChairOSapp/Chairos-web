import VerticalLandingPage from '@/components/VerticalLandingPage'

export default function SalonsPage() {
  return (
    <VerticalLandingPage
      eyebrow="Salons"
      headlineLines={["Your stylist's clients.", "Not theirs."]}
      subline="Every color formula and service note gets logged against your salon, not just the stylist who did the work. When a stylist gives her two weeks, you can see her whole locked client list before her last day, not after."
      proofPoints={[
        "One flat fee for the whole salon, not a per-stylist seat charge. Add your fifth stylist and the price doesn't change.",
        "Booking built around real service time. Color and chemical processing time is blocked automatically, so a stylist's afternoon doesn't get double-booked.",
        "Every client's color formula and service history saved to their profile, visible to whichever stylist picks them up next.",
      ]}
      screenshotSrc="/landing/salon-services.png"
      screenshotAlt="Willow & Rose Salon real service menu: Cut $55, Color $95, Highlights $145"
      founderLine="Built first for barbershops by a working barber, now built out for salons the same way: for the owner, not just the booking calendar."
    />
  )
}
