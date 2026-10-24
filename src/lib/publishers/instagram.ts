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
    let isLoginPage = await page.locator("input[name='username']").isVisible().catch(() => false);
    if (isLoginPage) {
      console.log("[Instagram] Not logged in. Waiting up to 10 minutes for user to complete login in the opened browser...");
      try {
        // Wait up to 10 minutes (600,000 ms) for navigation to feed or appearance of Create / Home icons
        await page.waitForSelector("svg[aria-label='New post'], svg[aria-label='Create'], svg[aria-label='Home']", {
          timeout: 10 * 60 * 1000,
        });
        console.log("[Instagram] Login detected! Proceeding with upload...");
        isLoginPage = false;
        await page.waitForTimeout(2000);
      } catch {
        return {
          ok: false,
          deliveryMethod: "instagram",
          error: "Instagram login timed out (waited 10 minutes). Please log in and retry.",
        };
      }
    }

    // 2. Open Create Modal
    // Instagram sidebar 'New post' icon / text
    const createBtn = page.locator("svg[aria-label='New post'], svg[aria-label='Create']").first();
    await createBtn.click({ timeout: 15_000 });

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
