import VerticalLandingPage from '@/components/VerticalLandingPage'

export default function TattooPage() {
  return (
    <VerticalLandingPage
      vertical="tattoo"
      eyebrow="Tattoo Studios"
      headlineLines={["Your artist left.", "Your client left with them."]}
      subline="A sleeve takes a dozen sessions over a couple of years with the same artist. Client Lock claims that entire relationship for your studio from visit two. An artist leaves mid-project, you know exactly which multi-session clients and dollars just walked out the door."
      proofPoints={[
        "Collect the deposit before the chair's ever held. Kill the no-show that eats a three-hour block you already turned other work away for.",
        "Consent signed and stored automatically, tied to the client and the session. Not a paper folder in a drawer.",
        "Sessions and consultations booked the way a studio actually runs, with real setup and cleanup time built into every appointment.",
      ]}
      screenshotSrc="/landing/tattoo-deposit.png"
      screenshotAlt="Ironclad Tattoo Studio real booking: Reese Talbot, Session (hourly), $200 total, $40 deposit due now"
      founderLine="Built by a barber, adapted for how a tattoo studio actually runs. Long sessions, deposits, consent. Not a walk-in haircut."
      clientLockStats={{ locked: 17, atRisk: 0, revenueProtected: '$5,010' }}
    />
  )
}
