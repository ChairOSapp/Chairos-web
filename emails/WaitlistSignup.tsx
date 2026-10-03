import {
  Body,
  Container,
  Head,
  Html,
  Preview,
  Text,
} from '@react-email/components'

/** Internal notification to the ChairOS team when someone joins the waitlist. */
export default function WaitlistSignup({ email }: { email: string }) {
  return (
    <Html>
      <Head />
      <Preview>New waitlist signup</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Text style={styles.text}>
            New waitlist signup: <strong>{email}</strong>
          </Text>
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
  text: {
    color: '#4a443b',
    fontSize: '14px',
    lineHeight: '1.6',
    margin: 0,
  },
}
