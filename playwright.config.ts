import { defineConfig, devices } from '@playwright/test';

// Runs against the built site (`npm run build:preview` first), the same bytes Netlify serves.
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4321',
    trace: 'retain-on-failure',
    // The theme follows the device; tests run dark unless they ask for light.
    colorScheme: 'dark',
    launchOptions: {
      // WebGPU in headless Chromium (software adapter): lets tests exercise the high tier where supported.
      args: ['--enable-unsafe-webgpu'],
      // Lets sandboxes with a preinstalled Chromium skip the browser download.
      ...(process.env.PW_CHROMIUM_PATH && { executablePath: process.env.PW_CHROMIUM_PATH }),
    },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: 'npx astro preview --port 4321 --ignore-lock',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
  },
});
