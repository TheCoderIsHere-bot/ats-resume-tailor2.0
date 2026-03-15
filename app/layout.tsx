import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://tailor-ai.app'),
  title: {
    default: "Tailor.ai \u2014 Stop Getting Ghosted by ATS",
    template: "%s | Tailor.ai",
  },
  description: "AI-powered resume tailoring and cover letter generation. Upload your resume, paste a job description, and get a perfectly ATS-optimised application in seconds.",
  keywords: [
    "ATS resume", "resume tailoring", "AI resume", "cover letter generator",
    "ATS optimization", "job application", "resume keywords", "tailor resume",
  ],
  openGraph: {
    title: "Tailor.ai \u2014 Stop Getting Ghosted by ATS",
    description: "AI-powered resume and cover letter tailoring. Land more interviews.",
    type: "website",
    siteName: "Tailor.ai",
  },
  twitter: {
    card: "summary_large_image",
    title: "Tailor.ai \u2014 Stop Getting Ghosted by ATS",
    description: "AI-powered resume and cover letter tailoring. Land more interviews.",
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: "https://tailor-ai.app",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
