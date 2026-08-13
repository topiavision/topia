import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import PrivyProviderWrapper from "./components/PrivyProviderWrapper";
import { ToastProvider } from "./components/Toast";
import ThemeInit from "./components/ThemeInit";
import CookieConsent from "./components/CookieConsent";
import FeedbackWidget from "./components/FeedbackWidget";

export const metadata: Metadata = {
  metadataBase: new URL("https://topia.vision"),
  title: "TOPIA - Culture Before Tech",
  description: "A breathing network for artists, audiences, and communities to create, explore, and sustain collaborative worlds.",
  openGraph: {
    title: "TOPIA — What You Make It",
    description: "A creator engine for artists, by artists.",
    type: "website",
    siteName: "Topia",
    images: [{ url: "/brand/og-image.png", width: 1200, height: 630, alt: "TOPIA" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "TOPIA — What You Make It",
    description: "A creator engine for artists, by artists.",
    images: ["/brand/og-image.png"],
  },
  // PWA install identity (manifest itself is app/manifest.ts).
  appleWebApp: {
    capable: true,
    title: "TOPIA",
    statusBarStyle: "black-translucent",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

// `interactive-widget=overlays-content` (the browser default): the on-screen
// keyboard floats OVER the page, so the layout viewport stays full-height and
// `window.visualViewport` reliably reports the true visible area above the
// keyboard. Forms scroll their focused field into view natively; the one place
// that needs help is a pinned footer (the messages composer), which clamps a
// layer to visualViewport so it sits flush on the keyboard (see
// useKeyboardViewport). We tried resizes-content, but its dvh shrink left the
// composer floating with a gap above the keyboard on iOS Safari.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "overlays-content",
  themeColor: "#1a1a1a",
  // Required for env(safe-area-inset-*) to be non-zero on iOS — the installed
  // PWA draws edge-to-edge (black-translucent status bar), so surfaces pad
  // themselves with the safe-area insets instead.
  viewportFit: "cover",
};

// Prevent flash of wrong theme on load. Accent is fixed site-wide to lime —
// the custom accent picker was removed, so we clear any stale saved accent.
const themeScript = `
  (function() {
    try {
      var theme = localStorage.getItem('topia-theme');
      if (theme !== 'light') {
        document.documentElement.setAttribute('data-theme', 'dark');
      }
      localStorage.removeItem('topia-accent-index');
    } catch(e) {}
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link
          rel="preload"
          as="font"
          type="font/woff2"
          href="/fonts/BasementGrotesque-Black.woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          as="font"
          type="font/woff2"
          href="/fonts/GTZirkon-Regular.woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body className="antialiased">
        <ThemeInit />
        {/* Global texture overlays */}
        <div className="grain-overlay" />
        <div className="scanlines-overlay" />

        <PrivyProviderWrapper>
          <ToastProvider>
            {children}
            <FeedbackWidget />
          </ToastProvider>
        </PrivyProviderWrapper>
        <CookieConsent />
        <Analytics />
      </body>
    </html>
  );
}
