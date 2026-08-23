export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-warm-50 py-16 px-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="font-serif text-3xl text-od-green mb-2">Privacy Policy</h1>
        <p className="text-charcoal-500 text-sm mb-10">Last updated: August 23, 2026</p>

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
            <p>We share your information with the barbershop, salon, or studio you book with. We do not sell your personal information to third parties. We use Twilio to deliver SMS messages and Supabase to store data — both are bound by their own privacy and security obligations.</p>
          </section>

          <section>
            <h2 className="font-serif text-xl text-charcoal-900 mb-3">6. Data Retention and Deletion</h2>
            <p>We retain your name, contact information, and appointment history to support scheduling, reminders, and rebooking. You may request deletion of your data at any time by contacting us at the address below.</p>
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
