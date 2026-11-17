import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geist = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "English Coach",
    template: "%s · English Coach",
  },
  description: "Votre espace personnel pour apprendre l'anglais avec méthode.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body
        className={`${geist.variable} ${geistMono.variable} min-h-dvh bg-[#000000] font-sans text-[#EDEDED] antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
