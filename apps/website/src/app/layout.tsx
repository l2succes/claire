// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from 'next';
import { DM_Mono, Inter, Public_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
import { RootProvider } from 'fumadocs-ui/provider/next';
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
  title: {
    default: 'Claire — All your chats. One AI.',
    template: '%s — Claire',
  },
  description:
    'Claire is the AI-native multi-chat client for WhatsApp, Telegram, Instagram, and more—search, reply, and follow through from one place.',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${publicSans.variable} ${inter.variable} ${dmMono.variable} ${publicSans.className}`}
      suppressHydrationWarning
    >
      <body className="flex min-h-screen flex-col">
        <RootProvider
          theme={{ defaultTheme: 'light', enableSystem: false }}
          search={{
            options: {
              api: '/api/search',
            },
          }}
        >
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
