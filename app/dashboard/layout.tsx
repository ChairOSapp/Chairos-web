import { VerticalProvider } from '@/lib/VerticalContext'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <VerticalProvider>{children}</VerticalProvider>
}
