import { Inter, DM_Mono } from 'next/font/google';

// Fontlar build sırasında self-host edilir; Türkçe karakterler için latin-ext şart.
// [locale]/layout.tsx ve global-not-found.tsx ortak kullanır.
// font-display ve font-sans → Inter (sade tasarım), font-mono → DM Mono.
const govde = Inter({ subsets: ['latin', 'latin-ext'], variable: '--font-govde', display: 'swap' });
const baslik = Inter({ subsets: ['latin', 'latin-ext'], variable: '--font-baslik', display: 'swap' });
const kod = DM_Mono({ subsets: ['latin', 'latin-ext'], weight: ['400', '500'], variable: '--font-kod', display: 'swap' });

export const fontVariables = `${baslik.variable} ${govde.variable} ${kod.variable}`;
