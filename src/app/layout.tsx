import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, DM_Sans } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"] });
const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Reelix — Upload once. Approve once.",
  description: "Upload once. Approve once. Reelix handles the rest.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#fff7ee" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${bricolage.variable} ${dmSans.variable} antialiased`}>
        <header className="sticky top-0 z-30 border-b border-cream-dark bg-cream/90 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-coral font-display text-lg font-bold text-white">R</span>
              <span className="font-display text-2xl font-bold">Reelix</span>
            </Link>
            <nav className="flex items-center gap-1">
              <Link href="/" className="btn-ghost min-h-11 px-3 text-sm">Projects</Link>
              <Link href="/settings" className="btn-ghost min-h-11 px-3 text-sm">Settings</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 pb-28 pt-6">{children}</main>
      </body>
    </html>
  );
}
