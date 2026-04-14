import { Geist } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegister from "./components/ServiceWorkerRegister";
import InstallPrompt from "./components/InstallPrompt";

const geist = Geist({ subsets: ["latin"] });

export const metadata = {
  title: "ParkManagerAI",
  description: "Intelligent caravan park management platform",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ParkManagerAI",
  },
};

export const viewport = {
  themeColor: "#059669",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icon-192.svg" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body className={`${geist.className} antialiased bg-slate-50 text-slate-900`}>
        <ServiceWorkerRegister />
        {children}
        <InstallPrompt />
      </body>
    </html>
  );
}
