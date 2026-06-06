import './globals.css';
export const metadata = {
  title: 'Shahzad & Rainer — Operations Platform',
  description: 'Projects, tasks, CRM, attendance, leave and integrations in one clean workspace.',
};
export default function RootLayout({ children }:{children:React.ReactNode}) {
  return <html lang="en"><body>{children}</body></html>;
}
