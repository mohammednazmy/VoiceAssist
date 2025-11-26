import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";

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
        <Header />
        <Sidebar />
        <main className="lg:pl-64">
          <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}
