import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from '@react-email/components'

export default function Welcome({
  firstName,
  nextStep,
}: {
  firstName: string
  nextStep: string
}) {
  return (
    <Html>
      <Head />
      <Preview>Welcome to ChairOS</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Heading style={styles.heading}>Welcome to ChairOS</Heading>
          <Text style={styles.text}>Hi {firstName},</Text>
          <Text style={styles.text}>
            Welcome to ChairOS! Your account is set up and your 30-day free
            trial has started.
          </Text>
          <Text style={styles.text}>{nextStep}</Text>
          <Text style={styles.text}>Questions? Just reply to this email.</Text>
          <Text style={styles.signoff}>- The ChairOS team</Text>
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
  signoff: { color: '#4a443b', fontSize: '14px', margin: '16px 0 0' },
}
