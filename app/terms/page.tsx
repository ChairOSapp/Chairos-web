export default function TermsPage() {
  return (
    <div className="min-h-screen bg-warm-50 py-16 px-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="font-serif text-3xl text-od-green mb-2">Terms of Service</h1>
        <p className="text-charcoal-500 text-sm mb-10">Last updated: August 23, 2026</p>

        <div className="prose prose-sm text-charcoal-700 space-y-8">

          <section>
            <h2 className="font-serif text-xl text-charcoal-900 mb-3">1. Acceptance of Terms</h2>
            <p>By using ChairOS (<a href="https://chairos.cc" className="text-od-green underline">chairos.cc</a>) — whether as a shop owner, barber/stylist/artist, or client — you agree to these Terms of Service. If you do not agree, do not use the service.</p>
          </section>

          <section>
            <h2 className="font-serif text-xl text-charcoal-900 mb-3">2. Service Description</h2>
            <p>ChairOS is a barbershop management and booking platform. It provides appointment scheduling, client management, staff/compensation tools, and business intelligence for barbershops, salons, and tattoo studios, and lets clients discover and book appointments online.</p>
          </section>

          <section>
            <h2 className="font-serif text-xl text-charcoal-900 mb-3">3. User Responsibilities</h2>
            <p>You agree to use ChairOS only for lawful purposes and in accordance with these terms. You are responsible for the accuracy of the information you provide (including contact details and appointment information), for maintaining the confidentiality of your account credentials, and for all activity that occurs under your account.</p>
          </section>

          <section>
            <h2 className="font-serif text-xl text-charcoal-900 mb-3">4. SMS Messaging</h2>
            <p>ChairOS sends appointment confirmations, reminders, and rebooking messages via SMS on behalf of shops. By providing your phone number and consenting to SMS, you agree to receive these messages.</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Message frequency varies depending on your appointment activity.</li>
              <li>Message and data rates may apply.</li>
              <li>Reply <strong>STOP</strong> at any time to unsubscribe from SMS messages.</li>
              <li>Reply <strong>HELP</strong> for help.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-xl text-charcoal-900 mb-3">5. Subscriptions and Billing</h2>
            <p>ChairOS is a subscription service billed monthly. Shop owners are billed $99/month. Independent professionals are billed $25/month. You may cancel at any time. No refunds are issued for partial billing periods.</p>
          </section>

          <section>
            <h2 className="font-serif text-xl text-charcoal-900 mb-3">6. Limitation of Liability</h2>
            <p>ChairOS is provided "as is" and "as available," without warranties of any kind, express or implied. To the fullest extent permitted by law, ChairOS and its owners and operators are not liable for any indirect, incidental, or consequential damages, including missed appointments, scheduling errors, or SMS delivery failures, arising from your use of the service.</p>
          </section>

          <section>
            <h2 className="font-serif text-xl text-charcoal-900 mb-3">7. Governing Law</h2>
            <p>These Terms are governed by the laws of the State of Florida, without regard to its conflict-of-law principles, and any disputes arising from these Terms or your use of ChairOS will be resolved in the state or federal courts located in Florida.</p>
          </section>

          <section>
            <h2 className="font-serif text-xl text-charcoal-900 mb-3">8. Changes to Terms</h2>
            <p>We may update these terms from time to time. Continued use of ChairOS after changes constitutes acceptance of the updated terms.</p>
          </section>

          <section>
            <h2 className="font-serif text-xl text-charcoal-900 mb-3">9. Contact</h2>
            <p>Questions about these terms? Email us at <a href="mailto:support@chairos.cc" className="text-od-green underline">support@chairos.cc</a>.</p>
          </section>

        </div>
      </div>
    </div>
  )
}
