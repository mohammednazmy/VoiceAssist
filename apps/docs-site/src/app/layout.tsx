import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { HeadingProvider } from "@/components/HeadingContext";
import { PageFrame } from "@/components/PageFrame";

const inter = Inter({ subsets: ["latin"] });

const CANONICAL_URL = "https://assistdocs.asimo.io";

export const metadata: Metadata = {
  metadataBase: new URL(CANONICAL_URL),
  title: {
    default: "VoiceAssist Documentation",
    template: "%s | VoiceAssist Docs",
  },
  description:
    "Comprehensive documentation for VoiceAssist - Enterprise Medical AI Assistant",
  keywords: [
    "VoiceAssist",
    "documentation",
    "medical AI",
    "voice assistant",
    "healthcare",
    "HIPAA",
    "API",
  ],
  openGraph: {
    title: "VoiceAssist Documentation",
    description:
      "Comprehensive documentation for VoiceAssist - Enterprise Medical AI Assistant",
    url: CANONICAL_URL,
    siteName: "VoiceAssist Docs",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "VoiceAssist Documentation",
    description:
      "Comprehensive documentation for VoiceAssist - Enterprise Medical AI Assistant",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
  alternates: {
    canonical: CANONICAL_URL,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className={`${inter.className} h-full bg-white dark:bg-gray-900`}>
        {/* Skip to content link for keyboard navigation (WCAG 2.1 AA) */}
        <a href="#main-content" className="skip-to-content">
          Skip to main content
        </a>
        <HeadingProvider>
          <Header />
          <Sidebar />
          <main id="main-content" className="lg:pl-64" role="main" aria-label="Documentation content">
            <PageFrame>{children}</PageFrame>
          </main>
        </HeadingProvider>
      </body>
    </html>
  );
}
