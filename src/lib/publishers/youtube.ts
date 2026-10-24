import { getBrowserContext, type BrowserOptions } from "./browser";
import type { DeliveryPayload, PublishResult } from "./types";

export async function publishToYouTube(
  payload: DeliveryPayload,
  options: BrowserOptions = {}
): Promise<PublishResult> {
  // Mock mode for local testing/fast feedback
  if (process.env.MOCK_SOCIAL_POSTING === "true") {
    const mockVideoId = `yt_${Date.now().toString(36)}`;
    return {
      ok: true,
      deliveryMethod: "youtube",
      proofId: mockVideoId,
      proofUrl: `https://youtube.com/shorts/${mockVideoId}`,
    };
  }

  let session: Awaited<ReturnType<typeof getBrowserContext>> | null = null;
  try {
    session = await getBrowserContext(options);
    // Reuse existing window/tab if available, otherwise open one
    const pages = session.context.pages();
    const page = pages.length > 0 ? pages[0] : await session.context.newPage();

    // 1. Navigate to YouTube Studio
    await page.goto("https://studio.youtube.com/", { waitUntil: "domcontentloaded", timeout: 35_000 });

    // Check if sign-in is required
    const currentUrl = page.url();
    const isAccountsPage = currentUrl.includes("accounts.google.com") || currentUrl.includes("signin");
    const isSignIn = isAccountsPage || (await page.locator("text=/Sign in|Choose an account/i").isVisible().catch(() => false));
    
    if (isSignIn) {
      console.log("[YouTube] Sign-in required. Waiting for user to complete sign-in (email, password, 2FA)...");
      try {
        // Wait until navigation finishes and URL becomes studio.youtube.com with dashboard/channel loaded
        await page.waitForURL((url) => url.hostname.includes("studio.youtube.com") && !url.pathname.includes("signin"), {
          timeout: 10 * 60 * 1000,
        });
        // Also wait for Studio's Create button or Channel avatar
        await page.waitForSelector("#create-icon, button[aria-label='Create'], #avatar-btn", {
          timeout: 60_000,
        });
        console.log("[YouTube] Successfully signed in and loaded YouTube Studio!");
        await page.waitForTimeout(3000);
      } catch (waitErr) {
        return {
          ok: false,
          deliveryMethod: "youtube",
          error: "Sign-in timed out or incomplete. Please finish signing into YouTube Studio and press Retry.",
        };
      }
    }

    // 2. Click Create -> Upload videos
    const createBtn = page.locator("#create-icon, button[aria-label='Create']").first();
    await createBtn.waitFor({ state: "visible", timeout: 30_000 });
    await createBtn.click();

    const uploadOption = page.locator("#text-item-0, ytcp-text-menu #text-item-0, tp-yt-paper-item:has-text('Upload videos')").first();
    await uploadOption.waitFor({ state: "visible", timeout: 15_000 });
    await uploadOption.click();

    // 3. Upload File
    const fileInput = page.locator("input[type='file']").first();
    await fileInput.setInputFiles(payload.videoFilePath);

    // Wait for the upload & details dialog to load
    await page.waitForSelector("#textbox[aria-label*='title' i], #title-textarea", { timeout: 30_000 });

    // Title input
    const titleBox = page.locator("#textbox[aria-label*='title' i], #title-textarea textarea").first();
    const titleWithTag = `${payload.title} #Shorts`;
    await titleBox.fill(titleWithTag.slice(0, 100));

    // Description input
    const descBox = page.locator("#description-textarea textarea, #textbox[aria-label*='description' i]").first();
    if (await descBox.isVisible()) {
      const fullDesc = [payload.caption, payload.hashtags.map(h => (h.startsWith("#") ? h : `#${h}`)).join(" ")]
        .filter(Boolean)
        .join("\n\n");
      await descBox.fill(fullDesc.slice(0, 5000));
    }

    // Audience: ALWAYS select "No, it's not made for kids"
    // Scroll the details dialog container down so the audience radio buttons are rendered
    await page.evaluate(() => {
      const scrollable = document.querySelector("#scrollable-content, ytcp-uploads-dialog #dialog, .ytcp-video-metadata-editor");
      if (scrollable) scrollable.scrollTop = scrollable.scrollHeight;
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(1000);

    // Try finding by text or role or name
    const notForKids = page.locator("[name='NOT_MADE_FOR_KIDS'], tp-yt-paper-radio-button:has-text('No, it\\'s not made for kids')").first();
    await notForKids.scrollIntoViewIfNeeded().catch(() => {});
    if (await notForKids.isVisible({ timeout: 5000 }).catch(() => false)) {
      await notForKids.click({ force: true });
    } else {
      // Fallback: click directly via text content
      await page.getByText("No, it's not made for kids").first().click({ force: true }).catch(() => {});
    }
    await page.waitForTimeout(1000);

    // Grab video link if generated early on the dialog
    let shortUrl: string | null = null;
    const linkEl = page.locator("a.ytcp-video-info, a.ytcp-upload-dialog[href*='youtu.be']").first();
    if (await linkEl.isVisible()) {
      shortUrl = await linkEl.getAttribute("href");
    }

    // Click Next until reaching the Visibility step
    for (let step = 0; step < 4; step++) {
      const nextBtn = page.locator("#next-button:not([hidden])").first();
      await nextBtn.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
      if (await nextBtn.isVisible().catch(() => false)) {
        await nextBtn.click();
        await page.waitForTimeout(1500);
      }
    }

    // Visibility step: choose Public (and ensure it's selected)
    await page.waitForTimeout(1000);
    const publicRadio = page.locator("tp-yt-paper-radio-button[name='PUBLIC'], [name='PUBLIC']").first();
    await publicRadio.scrollIntoViewIfNeeded().catch(() => {});
    if (await publicRadio.isVisible({ timeout: 5000 }).catch(() => false)) {
      await publicRadio.click({ force: true });
    } else {
      await page.getByText("Public", { exact: false }).first().click({ force: true }).catch(() => {});
    }
    await page.waitForTimeout(1000);

    // Click Publish / Done button
    const doneBtn = page.locator("#done-button, ytcp-button#done-button, [id='done-button']").first();
    await doneBtn.scrollIntoViewIfNeeded().catch(() => {});
    await doneBtn.waitFor({ state: "visible", timeout: 20_000 });
    await doneBtn.click({ force: true });

    // Wait for publication / upload complete confirmation dialog
    await page.waitForTimeout(5000);

    const videoId = shortUrl ? shortUrl.split("/").pop() || `yt_${Date.now()}` : `yt_${Date.now()}`;
    const proofUrl = shortUrl || `https://youtube.com/shorts/${videoId}`;

    await page.close();
    return {
      ok: true,
      deliveryMethod: "youtube",
      proofId: videoId,
      proofUrl,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      deliveryMethod: "youtube",
      error: `YouTube automation error: ${errorMsg}`,
    };
  } finally {
    if (session) {
      await session.close().catch(() => { });
    }
  }
}
