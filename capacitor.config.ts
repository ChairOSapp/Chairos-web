import type { CapacitorConfig } from '@capacitor/cli';

// Chairos iOS wrapper. The app is a dynamic Next.js app (API routes, auth,
// webhooks), so the native shell loads the production deployment directly
// rather than bundling static assets. Point `url` at the live site; the
// native project adds the app icon, splash screen, and status-bar handling.
const config: CapacitorConfig = {
  appId: 'cc.chairos.app',
  appName: 'Chairos',
  webDir: 'public',
  server: {
    url: 'https://chairos.cc',
    cleartext: false,
  },
  ios: {
    contentInset: 'automatic',
    // Keep the web content out from under the notch / home indicator.
    limitsNavigationsToAppBoundDomains: true,
  },
  plugins: {
    SplashScreen: {
      // Hold the native splash until the web app says it is ready
      // (SplashShell hides it once the branded web shell has painted).
      // Auto-hiding here is what used to drop the splash early and
      // flash the raw site streaming in.
      launchShowDuration: 0,
      launchAutoHide: false,
      launchFadeOutDuration: 300,
      backgroundColor: '#4b5320',
    },
    StatusBar: {
      style: 'dark',
    },
  },
};

export default config;
