// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from 'next';
import { DM_Mono, Inter, Public_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

// Body, UI, labels — everything at section-title size and below.
const publicSans = Public_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-public-sans',
  display: 'swap',
});

// Big titles only. See --font-display in the design-system tokens.
const inter = Inter({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-dm-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.CLAIRE_SITE_URL ?? 'https://useclaire.co'),
  title: {
    default: 'Claire — All your chats. One AI.',
    template: '%s — Claire',
  },
  description:
    'Claire is the AI-native multi-chat client for WhatsApp, Telegram, Instagram, and more—search, reply, and follow through from one place.',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'Claire',
    title: 'Claire — All your chats. One AI.',
    description:
      'An AI-native multi-chat client, built in public. Join the early list and follow the road to launch.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Claire — All your chats. One AI.',
    description:
      'An AI-native multi-chat client, built in public. Join the early list and follow the road to launch.',
  },
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${publicSans.variable} ${inter.variable} ${dmMono.variable} ${publicSans.className}`}
      suppressHydrationWarning
    >
      <body className="flex min-h-screen flex-col">{children}</body>
    </html>
  );
}
