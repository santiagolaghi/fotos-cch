import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Culto Media',
  description: 'Selección rápida y segura de fotos de OneDrive',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Culto Media', statusBarStyle: 'black-translucent' }
};

export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#0b0d12'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
