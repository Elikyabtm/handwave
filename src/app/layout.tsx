import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HANDWAVE",
  description: "Gesture-controlled musical instrument using MediaPipe and Tone.js.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
