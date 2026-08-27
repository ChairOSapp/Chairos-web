import VerticalLandingPage from '@/components/VerticalLandingPage'

export default function TattooPage() {
  return (
    <VerticalLandingPage
      eyebrow="Tattoo Studios"
      headlineLines={["Your artist's client left with them."]}
      subline="A sleeve takes a dozen sessions over a couple of years with the same artist. Client Lock tracks that entire relationship under your studio from visit two, so if an artist leaves mid-project, you know exactly which multi-session clients and dollars just walked out the door."
      proofPoints={[
        "Deposits collected before the chair's ever held. No more no-shows eating a three-hour block you turned other work away for.",
        "Consent forms signed and stored automatically, tied to the client and the session, not a paper folder in a drawer.",
        "Sessions and consultations booked the way a studio actually works, with real setup and cleanup time built in around every appointment.",
      ]}
      screenshotSrc="/landing/tattoo-services.png"
      screenshotAlt="Ironclad Tattoo Studio real service menu: Consultation $0, Piercing $35, Touch-up $60, Session (hourly) $200"
      founderLine="Built by a barber, adapted for how a tattoo studio actually runs: long sessions, deposits, and consent, not a walk-in haircut."
    />
  )
}
