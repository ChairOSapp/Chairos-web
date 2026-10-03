import {
  Body,
  Container,
  Head,
  Html,
  Preview,
  Text,
} from '@react-email/components'

/**
 * Founder outreach email sent from Mission Control (admin contact route).
 * The message is plain text authored by the founder; newlines are preserved
 * as line breaks. React escapes all interpolated values at render time.
 */
export default function AdminOutreach({
  name,
  message,
}: {
  name: string
  message: string
}) {
  const lines = message.split('\n')
  return (
    <Html>
      <Head />
      <Preview>A message from Thomas at ChairOS</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Text style={styles.text}>Hi {name},</Text>
          <Text style={styles.text}>
            {lines.map((line, i) => (
              <span key={i}>
                {line}
                {i < lines.length - 1 && <br />}
              </span>
            ))}
          </Text>
          <Text style={styles.signoff}>- Thomas, ChairOS</Text>
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
    margin: '0 0 12px',
  },
  signoff: { color: '#4a443b', fontSize: '14px', margin: '16px 0 0' },
}
