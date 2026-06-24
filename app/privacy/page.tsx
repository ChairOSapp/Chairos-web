export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-warm-50 py-16 px-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="font-serif text-3xl text-od-green mb-2">Privacy Policy</h1>
        <p className="text-charcoal-500 text-sm mb-10">Last updated: June 24, 2026</p>

        <div className="prose prose-sm text-charcoal-700 space-y-8">

          <section>
            <h2 className="font-serif text-xl text-charcoal-900 mb-3">1. Information We Collect</h2>
            <p>We collect information you provide when booking an appointment or creating an account, including your name, phone number, email address, and appointment history. We use this information to operate and improve the ChairOS service.</p>
          </section>

          <section>
            <h2 className="font-serif text-xl text-charcoal-900 mb-3">2. SMS Communications</h2>
            <p>If you provide your phone number and consent to SMS, you may receive appointment confirmations, reminders, and follow-up messages from the barbershop you booked with, powered by ChairOS.</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Message frequency varies. You may receive up to 5 messages per month.</li>
              <li>Message and data rates may apply.</li>
              <li>Reply <strong>STOP</strong> at any time to opt out of SMS messages from that shop.</li>
              <li>Reply <strong>HELP</strong> for assistance.</li>
              <li>Your consent to receive SMS is not a condition of purchase.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-xl text-charcoal-900 mb-3">3. How We Use Your Information</h2>
            <p>We use your information to:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Confirm and manage your appointments</li>
              <li>Send SMS reminders if you have consented</li>
              <li>Help barbershops understand their business performance</li>
              <li>Improve the ChairOS platform</li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-xl text-charcoal-900 mb-3">4. Sharing Your Information</h2>
            <p>We share your information with the barbershop you book with. We do not sell your personal information to third parties. We use Twilio to deliver SMS messages and Supabase to store data. Both are bound by their own privacy policies.</p>
          </section>

          <section>
            <h2 className="font-serif text-xl text-charcoal-900 mb-3">5. Data Retention</h2>
            <p>We retain appointment records to support rebooking and history. You may request deletion of your data by contacting us at the address below.</p>
          </section>

          <section>
            <h2 className="font-serif text-xl text-charcoal-900 mb-3">6. Contact Us</h2>
            <p>For privacy questions or to request data deletion, email us at <a href="mailto:privacy@chairos.app" className="text-od-green underline">privacy@chairos.app</a>.</p>
          </section>

        </div>
      </div>
    </div>
  )
}
