import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'

export default function TrialReminder({
  firstName,
  subscribeUrl,
}: {
  firstName: string
  subscribeUrl: string
}) {
  return (
    <Html>
      <Head />
      <Preview>Your ChairOS trial ends in 5 days</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Heading style={styles.heading}>5 days left on your trial</Heading>
          <Text style={styles.text}>Hi {firstName},</Text>
          <Text style={styles.text}>
            Your 30-day ChairOS trial ends in 5 days. To keep your shop,
            bookings, and staff running without interruption, add a payment
            method any time before then.
          </Text>
          <Section style={styles.cta}>
            <Link href={subscribeUrl} style={styles.button}>
              Choose your plan
            </Link>
          </Section>
          <Text style={styles.signoff}>— The ChairOS team</Text>
        </Container>
      </Body>
    </Html>
  )
}

const styles: Record<string, React.CSSProperties> = {
  body: {
    backgroundColor: '#faf7f2',
    fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
    padding: '24px 12px',
  },
  container: {
    backgroundColor: '#ffffff',
    border: '1px solid #e8e0d4',
    borderRadius: '12px',
    padding: '32px',
    maxWidth: '560px',
    margin: '0 auto',
  },
  heading: {
    color: '#2b2620',
    fontSize: '22px',
    fontWeight: 700,
    margin: '0 0 16px',
  },
  text: {
    color: '#4a443b',
    fontSize: '14px',
    lineHeight: '1.6',
    margin: '0 0 12px',
  },
  cta: { textAlign: 'center', margin: '24px 0' },
  button: {
    backgroundColor: '#b4552d',
    borderRadius: '8px',
    color: '#ffffff',
    display: 'inline-block',
    fontSize: '14px',
    fontWeight: 600,
    padding: '12px 28px',
    textDecoration: 'none',
  },
  signoff: { color: '#4a443b', fontSize: '14px', margin: '16px 0 0' },
}
