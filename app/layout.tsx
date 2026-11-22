import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Archivo: a plain, sturdy grotesk that stays legible at arm's length; the width axis gives condensed headings.
const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], axes: ["wdth"] });
// Plex Mono: labels and numbers (step counts, metadata), the "printed manual" voice.
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: { default: "Reelish: turn cooking videos into recipes", template: "%s · Reelish" },
  description:
    "Paste a YouTube or Instagram cooking video. Get the ingredients, clear instructions, and a step-by-step cooking guide.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f4f3ee",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${archivo.variable} ${plexMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
