import { getBrowserContext, type BrowserOptions } from "./browser";
import type { DeliveryPayload, PublishResult } from "./types";
import fs from "node:fs";

export async function publishToInstagram(
  payload: DeliveryPayload,
  options: BrowserOptions = {}
): Promise<PublishResult> {
  // If simulation is requested or in mock mode without display
  if (process.env.MOCK_SOCIAL_POSTING === "true") {
    const mockPostId = `ig_${Date.now().toString(36)}`;
    return {
      ok: true,
      deliveryMethod: "instagram",
      proofId: mockPostId,
      proofUrl: `https://www.instagram.com/reel/${mockPostId}/`,
    };
  }

  let session: Awaited<ReturnType<typeof getBrowserContext>> | null = null;
  try {
    session = await getBrowserContext(options);
    // Reuse existing window/tab if available, otherwise open one
    const pages = session.context.pages();
    const page = pages.length > 0 ? pages[0] : await session.context.newPage();

    // 1. Check Instagram Auth State
    await page.goto("https://www.instagram.com/", { waitUntil: "domcontentloaded", timeout: 30_000 });
    
    // Check if user is logged in
    // Instagram shows login forms or prompts like username/password input, or a "Log in" heading
    let isLoggedOut = await page.locator("input[name='username'], form#loginForm, a[href*='/accounts/login']").first().isVisible().catch(() => false);
    
    if (isLoggedOut) {
      console.log("[Instagram] Waiting for user to complete Instagram login/signup in the browser...");
      try {
        // Wait until navigation leads to logged in indicators:
        // 1. Create / New post SVG
        // 2. Profile icon / Avatar
        // 3. Navigation to instagram.com/ (without /accounts/login)
        await Promise.race([
          page.waitForSelector("svg[aria-label='New post'], svg[aria-label='Create'], svg[aria-label='Home'], svg[aria-label='Explore']", { timeout: 10 * 60 * 1000 }),
          page.waitForURL((url) => !url.pathname.includes("/accounts/login") && !url.pathname.includes("/accounts/emailsignup"), { timeout: 10 * 60 * 1000 }),
        ]);

        // Dismiss common Instagram post-login dialogs (e.g., "Save Your Login Info?", "Turn on Notifications")
        await page.waitForTimeout(3000);
        const notNowBtn = page.locator("button:has-text('Not now'), button:has-text('Not Now')").first();
        if (await notNowBtn.isVisible().catch(() => false)) {
          await notNowBtn.click().catch(() => {});
          await page.waitForTimeout(1000);
        }
        console.log("[Instagram] Logged-in state detected!");
      } catch {
        return {
          ok: false,
          deliveryMethod: "instagram",
          error: "Instagram login timed out (waited 10 minutes). Please log in and retry.",
        };
      }
    }

    // 2. Open Create Modal
    // Instagram sidebar has "Create" with various labels and text spans across web updates
    console.log("[Instagram] Opening Create modal...");
    const createBtn = page.locator(
      "svg[aria-label='New post'], svg[aria-label='Create'], a[href='#']:has-text('Create'), div[role='button']:has-text('Create'), span:has-text('Create')"
    ).first();
    await createBtn.waitFor({ state: "visible", timeout: 20_000 });
    await createBtn.click();

    // 3. Upload File
    // Find file input inside Instagram modal
    const fileInput = page.locator("input[type='file']").first();
    await fileInput.setInputFiles(payload.videoFilePath);

    // Wait for video preview/crop modal to settle
    await page.waitForTimeout(3000);

    // Instagram modal Next buttons
    // Typically: "Next" button in header
    const nextBtn = page.getByRole("button", { name: /^Next$/i });
    if (await nextBtn.isVisible()) {
      await nextBtn.click();
      await page.waitForTimeout(2000);
      if (await nextBtn.isVisible()) {
        await nextBtn.click();
        await page.waitForTimeout(2000);
      }
    }

    // 4. Caption Input
    const captionEditor = page.locator("div[aria-label='Write a caption...'], div[contenteditable='true']").first();
    if (await captionEditor.isVisible()) {
      const fullCaption = [payload.title, payload.caption, payload.hashtags.map(h => (h.startsWith("#") ? h : `#${h}`)).join(" ")]
        .filter(Boolean)
        .join("\n\n");
      await captionEditor.fill(fullCaption);
    }

    // 5. Share
    const shareBtn = page.getByRole("button", { name: /^Share$/i });
    await shareBtn.click();

    // Wait for "Your reel has been shared" confirmation
    await page.waitForSelector("text=/Your (reel|post) has been (shared|published)/i", { timeout: 60_000 });

    // Extract link or generated post ID
    const postLink = await page.locator("a[href*='/reel/'], a[href*='/p/']").first().getAttribute("href").catch(() => null);
    const proofUrl = postLink ? `https://www.instagram.com${postLink}` : "https://www.instagram.com/";
    const proofId = postLink ? postLink.replace(/[^a-zA-Z0-9_-]/g, "") : `ig_${Date.now()}`;

    await page.close();
    return {
      ok: true,
      deliveryMethod: "instagram",
      proofId,
      proofUrl,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      deliveryMethod: "instagram",
      error: `Instagram automation error: ${errorMsg}`,
    };
  } finally {
    if (session) {
      await session.close().catch(() => {});
    }
  }
}
