import VerticalLandingPage from '@/components/VerticalLandingPage'

export default function BarbershopsPage() {
  return (
    <VerticalLandingPage
      vertical="barbershop"
      eyebrow="Barbershops"
      headlineLines={["A barber builds his own book on your chair.", "Then he walks out the door with it."]}
      subline="The second time a client books, Client Lock claims them for your shop, not a barber's personal phone. A barber walks, his regulars are still sitting in your dashboard the next morning, ready to rebook."
      proofPoints={[
        "See every chair in real time. Who's in, who's off, who's about to finish, from your phone or the front desk.",
        "Commission or booth rent, tracked automatically. Tips split per barber, automatically. No spreadsheet, ever.",
        "Your booking page, your brand, not any one barber's. Clients book under your shop's name, every time.",
      ]}
      screenshotSrc="/landing/barbershop-client-lock.png"
      screenshotAlt="Downtown Fade Co. Client Locks dashboard: 15 locked clients, 0 at risk, 5 floating"
      founderLine="Built by a licensed barber and shop owner who lived this exact problem before writing a line of code."
      clientLockStats={{ locked: 15, atRisk: 0, revenueProtected: '$2,275' }}
    />
  )
}
