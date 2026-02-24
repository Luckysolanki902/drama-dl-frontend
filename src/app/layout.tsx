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
    default: "DramaDL — Download Drama Episodes for Free in HD",
    template: "%s | DramaDL — Free Drama Downloads",
  },
  description:
    "Download Korean drama, Chinese drama, Thai & Turkish drama episodes for free — no sign-up, no ads. Search any drama by name and get free HD download links instantly.",
  keywords: [
    "download drama for free",
    "free drama download",
    "free k-drama download",
    "download korean drama free",
    "download chinese drama free",
    "free c-drama episodes download",
    "download thai drama free HD",
    "free turkish drama download",
    "download drama episodes free online",
    "free asian drama download HD",
    "download drama without sign up",
    "free drama downloader",
    "download k-drama episodes free HD",
    "free drama download site",
    "watch and download drama free",
  ],
  metadataBase: new URL(SITE_URL),
  openGraph: {
    title: "DramaDL — Download Any Drama Episode for Free in HD",
    description:
      "Free drama downloader — search by name and download Korean, Chinese, Thai & Turkish drama episodes in HD. No sign-up required.",
    url: SITE_URL,
    siteName: "DramaDL",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "DramaDL — Free Drama Downloads in HD",
    description:
      "Download any drama episode for free. Just type the name, pick a quality, and download — no sign-up needed.",
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
    name: "DramaDL — Free Drama Downloader",
    url: SITE_URL,
    description:
      "Download drama episodes for free in HD — Korean, Chinese, Thai & Turkish dramas. No sign-up, no ads, just free downloads.",
    applicationCategory: "EntertainmentApplication",
    operatingSystem: "Any",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      description: "100% free — no subscription or sign-up required",
    },
    featureList: "Free HD drama downloads, Korean drama, Chinese drama, Thai drama, Turkish drama, No sign-up required",
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
