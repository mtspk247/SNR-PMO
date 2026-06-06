import './globals.css';
export const metadata = { title: 'SNR-PMO', description: 'Project Management & Operations' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
