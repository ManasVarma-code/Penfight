import type { CapacitorConfig } from '@capacitor/cli';

// Capacitor Android configuration for Pen Fight Aura Wars.
// Note: Verify `appId` is unique to your Google Play Console developer account before first upload.
// AdMob testing vs. production mode is driven strictly via `.env` / `.env.production`
// (`VITE_ADMOB_TEST_MODE`) and Android Gradle `manifestPlaceholders` (never hardcoded here).
const config: CapacitorConfig = {
  appId: 'com.penfightroyale.game',
  appName: 'Pen Fight Aura Wars',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#0B1120',
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#0B1120',
      showSpinner: false,
    },
  },
};

export default config;
