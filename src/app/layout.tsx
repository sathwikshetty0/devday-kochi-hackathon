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
        <header className="sticky top-0 z-30 border-b border-cream-dark/80 bg-white/70 backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-2.5 group">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-tr from-coral-dark to-coral font-display text-xl font-bold text-white shadow-md shadow-coral/30 group-hover:scale-105 transition">
                R
              </span>
              <div className="flex flex-col">
                <span className="font-display text-2xl font-bold tracking-tight text-ink leading-none">Reelix</span>
                <span className="text-[10px] uppercase font-bold tracking-widest text-muted">Auto Clipper</span>
              </div>
            </Link>
            <nav className="flex items-center gap-2">
              <Link href="/" className="btn-ghost min-h-10 rounded-xl px-3.5 text-sm font-semibold">Projects</Link>
              <Link href="/settings" className="btn-ghost min-h-10 rounded-xl px-3.5 text-sm font-semibold">Settings</Link>
              <Link href="/projects/new" className="btn-primary min-h-10 rounded-xl px-4 text-sm font-semibold ml-1">
                + New
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 pb-28 pt-6">{children}</main>
      </body>
    </html>
  );
}
