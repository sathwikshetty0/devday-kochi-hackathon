import path from "node:path";
import fs from "node:fs";
import { chromium, type BrowserContext, type Page } from "playwright";
import { DATA_DIR } from "../db";

export const BROWSER_PROFILE_DIR = path.join(DATA_DIR, "browser-profile");

export interface BrowserOptions {
  headless?: boolean;
  cdpUrl?: string; // e.g. "http://localhost:9222" if user started Chrome with remote debugging
}

export async function getBrowserContext(options: BrowserOptions = {}): Promise<{
  context: BrowserContext;
  isCdp: boolean;
  close: () => Promise<void>;
}> {
  const cdpEndpoint = options.cdpUrl || process.env.CHROME_CDP_URL || "http://127.0.0.1:9222";

  // 1. Try to connect directly to the user's running Chrome via CDP port 9222
  if (cdpEndpoint) {
    try {
      const browser = await chromium.connectOverCDP(cdpEndpoint, { timeout: 3000 });
      console.log(`[BrowserSession] Successfully connected to your live Chrome at ${cdpEndpoint}!`);
      const contexts = browser.contexts();
      const context = contexts.length > 0 ? contexts[0] : await browser.newContext();
      return {
        context,
        isCdp: true,
        close: async () => {
          // Disconnect without killing the user's real Chrome
          await browser.close();
        },
      };
    } catch {
      console.log(`[BrowserSession] No live Chrome on ${cdpEndpoint}. To connect to your current logged-in Chrome, start it with: chrome.exe --remote-debugging-port=9222`);
    }
  }

  // 2. Launch your installed Google Chrome browser with persistent session
  const userProfileDir = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "User Data")
    : null;

  // If local data dir exists, we copy cookies/sessions into BROWSER_PROFILE_DIR so Chrome lock doesn't conflict
  if (!fs.existsSync(BROWSER_PROFILE_DIR)) {
    fs.mkdirSync(BROWSER_PROFILE_DIR, { recursive: true });
  }

  const isHeadless = options.headless ?? (process.env.PLAYWRIGHT_HEADLESS === "true");

  // Launch your actual installed Google Chrome application (channel: 'chrome')
  const context = await chromium.launchPersistentContext(BROWSER_PROFILE_DIR, {
    channel: "chrome",
    headless: isHeadless,
    viewport: null, // use full desktop screen
    args: [
      "--start-maximized",
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
    ],
  });

  return {
    context,
    isCdp: false,
    close: async () => {
      await context.close();
    },
  };
}
