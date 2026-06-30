import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Box RAG Demo",
  description: "RAG chatbot over Box-hosted documents",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
