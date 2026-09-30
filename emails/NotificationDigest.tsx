import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'

export type DigestItem = {
  title: string
  body: string
  created_at: string
}

export default function NotificationDigest({
  firstName,
  items,
  more,
  inboxUrl,
}: {
  firstName: string
  items: DigestItem[]
  more: boolean
  inboxUrl: string
}) {
  return (
    <Html>
      <Head />
      <Preview>{`Your ChairOS digest — ${items.length} unread alert${items.length === 1 ? '' : 's'}`}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Heading style={styles.heading}>Your ChairOS digest</Heading>
          <Text style={styles.text}>Hi {firstName},</Text>
          <Text style={styles.text}>Here's what happened in your shop today:</Text>
          <Section>
            {items.map((item, i) => (
              <Section key={i} style={styles.item}>
                <Text style={styles.itemTitle}>{item.title}</Text>
                <Text style={styles.itemBody}>{item.body}</Text>
              </Section>
            ))}
          </Section>
          {more && <Text style={styles.text}>…and more in your inbox.</Text>}
          <Section style={styles.cta}>
            <Link href={inboxUrl} style={styles.button}>
              View all notifications
            </Link>
          </Section>
          <Hr style={styles.hr} />
          <Text style={styles.footer}>
            You're getting this because you turned on the daily digest in
            Settings &gt; Notifications.
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
  item: {
    backgroundColor: '#faf7f2',
    borderRadius: '8px',
    padding: '12px 16px',
    marginBottom: '8px',
  },
  itemTitle: {
    color: '#2b2620',
    fontSize: '14px',
    fontWeight: 600,
    margin: '0 0 4px',
  },
  itemBody: {
    color: '#6b6357',
    fontSize: '13px',
    lineHeight: '1.5',
    margin: 0,
  },
  cta: { textAlign: 'center', margin: '24px 0 8px' },
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
  hr: { borderColor: '#e8e0d4', margin: '24px 0 16px' },
  footer: { color: '#9a9184', fontSize: '12px', lineHeight: '1.5', margin: 0 },
}
