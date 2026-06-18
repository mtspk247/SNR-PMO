import { Html, Head, Main, NextScript } from 'next/document';

// Set the theme before first paint to avoid a flash of the wrong palette.
const noFlash = `(function(){try{var t=localStorage.getItem('snr-theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);var sk=localStorage.getItem('snr-skin');document.documentElement.setAttribute('data-skin',(sk==='daylight'||sk==='vivid'||sk==='midnight')?sk:'classic');}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.24.0/dist/tabler-icons.min.css" />
        {/* PWA */}
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#10b981" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="SNR-PMO" />
        <link rel="apple-touch-icon" href="/icon-192.svg" />
      </Head>
      <body>
        <script dangerouslySetInnerHTML={{ __html: noFlash }} />
        <Main /><NextScript />
      </body>
    </Html>
  );
}
