export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-warm-50 py-16 px-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="font-serif text-3xl text-od-green mb-2">Privacy Policy</h1>
        <p className="text-charcoal-500 text-sm mb-10">Last updated: October 1, 2026</p>

        <div className="prose prose-sm text-charcoal-700 space-y-8">

          <section>
            <h2 className="font-serif text-xl text-charcoal-900 mb-3">1. Who We Are</h2>
            <p>ChairOS (<a href="https://chairos.cc" className="text-od-green underline">chairos.cc</a>) is a barbershop, salon, and tattoo studio management and booking platform. This policy explains what information we collect from you and how we use it, whether you're a shop owner, a barber/stylist/artist, or a client booking an appointment.</p>
          </section>

          <section>
            <h2 className="font-serif text-xl text-charcoal-900 mb-3">2. Information We Collect</h2>
            <p>When you book an appointment or use ChairOS, we collect:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Your name</li>
              <li>Phone number</li>
              <li>Email address</li>
              <li>Appointment history (services booked, dates, and shops visited)</li>
              <li>Payment information (processed securely by Stripe or Square — we do not store full card numbers)</li>
              <li>Consent form signatures (electronic signatures on shop consent forms, including IP address and timestamp)</li>
              <li>Date of birth (when a consent form requires it, such as tattoo services where state law sets a minimum age)</li>
              <li>Health information you disclose on consent forms (for example, health screening answers some states require before tattoo services — used only for the consent record)</li>
              <li>Tax information for shop staff (legal name, address, and tax ID, used for earnings summaries and 1099 reporting)</li>
              <li>Push notification tokens (if you enable notifications in the mobile app)</li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-xl text-charcoal-900 mb-3">3. How We Use Your Information</h2>
            <p>We use the information above to:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Send appointment reminders and confirmations</li>
              <li>Send rebooking SMS messages when you're due for a return visit</li>
              <li>Deliver other communications from the shop you booked with</li>
              <li>Help barbershops manage their business and understand their clients</li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-xl text-charcoal-900 mb-3">4. SMS Communications</h2>
            <p>If you provide your phone number and consent to SMS at the time of booking, you may receive appointment confirmations, reminders, and rebooking messages from the shop you booked with, sent via ChairOS.</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Consent to receive SMS is collected at the time you book an appointment.</li>
              <li>You can opt out at any time by replying <strong>STOP</strong> to any message you receive, or by visiting our <a href="/sms-optout" className="text-od-green underline">SMS opt-out page</a>.</li>
              <li>Message and data rates may apply.</li>
              <li>Your consent to receive SMS is not a condition of purchase.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-xl text-charcoal-900 mb-3">5. Sharing Your Information</h2>
            <p>We share your information with the barbershop, salon, or studio you book with. We do not sell your personal information to third parties.</p>
            <p className="mt-2">We use the following service providers to operate ChairOS, each bound by their own privacy and security obligations:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li><strong>Supabase</strong> — database and data storage</li>
              <li><strong>Twilio</strong> — SMS message delivery</li>
              <li><strong>Stripe</strong> and <strong>Square</strong> — payment processing (they receive payment details directly; we never see full card numbers)</li>
              <li><strong>Apple Push Notification Service</strong> — mobile push notifications</li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-xl text-charcoal-900 mb-3">6. Data Retention and Deletion</h2>
            <p>We keep your data only as long as needed:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li><strong>Active accounts:</strong> we retain your data while your subscription is active.</li>
              <li><strong>Cancelled accounts:</strong> we keep your data for 90 days after cancellation in case you reactivate, then delete it automatically.</li>
              <li><strong>Signed consent forms:</strong> we retain these for 7 years as legal records, even after account cancellation, unless you request earlier deletion and no legal hold applies.</li>
              <li><strong>SMS and audit logs:</strong> retained for 1 year.</li>
            </ul>
            <p className="mt-3"><strong>Your rights:</strong> you may request a copy of your data (export) or deletion of your data at any time. Shop owners can export client lists and appointment history from Settings. For full account deletion, email us at the address below — we complete deletion requests within 30 days.</p>
          </section>

          <section>
            <h2 className="font-serif text-xl text-charcoal-900 mb-3">7. Contact Us</h2>
            <p>For privacy questions or to request data deletion, email us at <a href="mailto:support@chairos.cc" className="text-od-green underline">support@chairos.cc</a>.</p>
          </section>

        </div>
      </div>
    </div>
  )
}
