import type { Metadata } from "next";
import "./globals.css";
import Header from "../components/ui/Header";
import localFont from "next/font/local";

const gilroy = localFont({
  src: "../assets/fonts/Gilroy-Regular.ttf",
  variable: "--font-gilroy",
  display: "swap",
});


export const metadata: Metadata = {
  title: "Prism - TSA Analytics",
  description: "AI Analytics by TSA",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${gilroy.variable} antialiased h-screen flex flex-col`}
      >
        <Header />
        <div className="flex-1 bg-neutral-900">
          {children}
        </div>
      </body>
    </html>
  );
}
