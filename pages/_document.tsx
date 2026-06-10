import { Html, Head, Main, NextScript } from 'next/document';

// Set the theme before first paint to avoid a flash of the wrong palette.
const noFlash = `(function(){try{var t=localStorage.getItem('snr-theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.24.0/dist/tabler-icons.min.css" />
      </Head>
      <body>
        <script dangerouslySetInnerHTML={{ __html: noFlash }} />
        <Main /><NextScript />
      </body>
    </Html>
  );
}
