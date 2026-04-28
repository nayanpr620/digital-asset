import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "Digital Asset Protection — AI-Powered Sports Media Protection",
  description: "Enterprise-grade platform to identify, track, and flag unauthorized use of official sports media across YouTube using Gemini AI, pHash, and Chromaprint.",
  keywords: "digital asset protection, sports media, piracy detection, DMCA, pHash, Chromaprint, YouTube",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#060918" />
      </head>
      <body className="antialiased flex min-h-screen">
        <Sidebar />
        <main className="flex-1 lg:ml-64 min-h-screen pt-16 lg:pt-0">{children}</main>
      </body>
    </html>
  );
}
