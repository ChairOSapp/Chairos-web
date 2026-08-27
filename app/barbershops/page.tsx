import VerticalLandingPage from '@/components/VerticalLandingPage'

export default function BarbershopsPage() {
  return (
    <VerticalLandingPage
      eyebrow="Barbershops"
      headlineLines={["A barber builds his own book on your chair.", "Then he leaves with it."]}
      subline="The second time a client books, Client Lock records it under your shop's system, not a barber's personal phone. If a barber walks, his regulars are still sitting in your dashboard the next morning, ready to rebook."
      proofPoints={[
        "Floor visibility for every chair. See who's in, who's off, and who's about to finish, all live, from your phone or the front desk.",
        "Commission or booth rent, tracked automatically. Tips split per barber. No spreadsheet at the end of the week.",
        "A booking page branded to your shop, not to any one barber. Clients book with your shop's name in their calendar.",
      ]}
      screenshotSrc="/landing/barbershop-services.png"
      screenshotAlt="Downtown Fade Co. real service menu: Line-Up/Edge-Up $25, Youth Cut $40, Beard Sculpt $40"
      founderLine="Built by a licensed barber and former shop owner who lived this exact problem before writing a line of code."
    />
  )
}
