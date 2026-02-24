import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://dramadl.vercel.app";

export const viewport: Viewport = {
  themeColor: "#a855f7",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: {
    default: "DramaDL — Download Any Drama Episode Free",
    template: "%s | DramaDL",
  },
  description:
    "Search and download Korean, Chinese, Thai & Turkish drama episodes for free in HD. Just type the drama name and get instant download links.",
  keywords: [
    "drama download",
    "k-drama download",
    "c-drama download",
    "thai drama download",
    "turkish drama download",
    "watch drama online",
    "dailymotion drama",
    "free drama episodes",
    "drama HD download",
    "asian drama download",
  ],
  metadataBase: new URL(SITE_URL),
  openGraph: {
    title: "DramaDL — Download Any Drama Episode Free",
    description:
      "Search and download Korean, Chinese, Thai & Turkish drama episodes for free in HD.",
    url: SITE_URL,
    siteName: "DramaDL",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "DramaDL — Download Any Drama Episode Free",
    description:
      "Search and download drama episodes for free in HD. Just type the name.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  alternates: { canonical: SITE_URL },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "DramaDL",
    url: SITE_URL,
    description:
      "Search and download Korean, Chinese, Thai & Turkish drama episodes for free in HD.",
    applicationCategory: "EntertainmentApplication",
    operatingSystem: "Any",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  };

  return (
    <html lang="en" className="dark">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={`${inter.variable} font-sans antialiased bg-[#09090b] text-zinc-100`}>
        {children}
      </body>
    </html>
  );
}
