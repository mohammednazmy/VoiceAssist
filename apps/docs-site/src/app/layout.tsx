import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { HeadingProvider } from "@/components/HeadingContext";
import { PageFrame } from "@/components/PageFrame";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
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
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className={`${inter.className} h-full bg-white dark:bg-gray-900`}>
        <HeadingProvider>
          <Header />
          <Sidebar />
          <main className="lg:pl-64">
            <PageFrame>{children}</PageFrame>
          </main>
        </HeadingProvider>
      </body>
    </html>
  );
}
