import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GetMyShow Gate Scanner Terminal",
  description: "High-speed camera pass scanner and offline gate verification terminal for GetMyShow events.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "GMS Scanner",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0A0D14",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark bg-[#0A0D14]">
      <body className="min-h-screen bg-[#0A0D14] text-white antialiased flex flex-col">
        {children}
      </body>
    </html>
  );
}
