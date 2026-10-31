import type { Metadata } from "next";
import "../src/styles.css";
export const metadata: Metadata = {
  title: "Runninggem · Your training, in focus",
  description:
    "A calmer place for your training. Today, calendar and performance.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
