export default function TermsPage() {
  return (
    <div className="min-h-screen bg-warm-50 py-16 px-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="font-serif text-3xl text-od-green mb-2">Terms of Service</h1>
        <p className="text-charcoal-500 text-sm mb-10">Last updated: June 24, 2026</p>

        <div className="prose prose-sm text-charcoal-700 space-y-8">

          <section>
            <h2 className="font-serif text-xl text-charcoal-900 mb-3">1. Acceptance of Terms</h2>
            <p>By using ChairOS — whether as a barbershop owner, barber, or client — you agree to these Terms of Service. If you do not agree, do not use the service.</p>
          </section>

          <section>
            <h2 className="font-serif text-xl text-charcoal-900 mb-3">2. Use of the Service</h2>
            <p>ChairOS provides appointment scheduling, client management, and business intelligence tools for barbershops. You agree to use ChairOS only for lawful purposes and in accordance with these terms.</p>
          </section>

          <section>
            <h2 className="font-serif text-xl text-charcoal-900 mb-3">3. SMS Messaging</h2>
            <p>ChairOS sends appointment confirmations, reminders, and follow-up messages via SMS on behalf of barbershops. By providing your phone number and consenting to SMS, you agree to receive these messages. Standard message and data rates apply. You can opt out at any time by replying STOP.</p>
          </section>

          <section>
            <h2 className="font-serif text-xl text-charcoal-900 mb-3">4. Subscriptions and Billing</h2>
            <p>ChairOS is a subscription service billed monthly. Shop owners are billed $99/month. Independent barbers are billed $25/month. You may cancel at any time. No refunds are issued for partial billing periods.</p>
          </section>

          <section>
            <h2 className="font-serif text-xl text-charcoal-900 mb-3">5. Accounts</h2>
            <p>You are responsible for maintaining the confidentiality of your account credentials. You are responsible for all activity that occurs under your account.</p>
          </section>

          <section>
            <h2 className="font-serif text-xl text-charcoal-900 mb-3">6. Limitation of Liability</h2>
            <p>ChairOS is provided "as is." We are not liable for missed appointments, SMS delivery failures, or any indirect damages arising from use of the service.</p>
          </section>

          <section>
            <h2 className="font-serif text-xl text-charcoal-900 mb-3">7. Changes to Terms</h2>
            <p>We may update these terms from time to time. Continued use of ChairOS after changes constitutes acceptance of the updated terms.</p>
          </section>

          <section>
            <h2 className="font-serif text-xl text-charcoal-900 mb-3">8. Contact</h2>
            <p>Questions about these terms? Email us at <a href="mailto:legal@chairos.app" className="text-od-green underline">legal@chairos.app</a>.</p>
          </section>

        </div>
      </div>
    </div>
  )
}
