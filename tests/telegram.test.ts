import { expect, it } from "vitest";
import { buildCaption, friendlyTelegramError } from "@/lib/telegram";

it("maps chat not found to a plain-language next step", () => {
  expect(friendlyTelegramError("Bad Request: chat not found")).toContain("Add the bot as an admin to your channel and check the chat ID");
});
it("maps unauthorized", () => {
  expect(friendlyTelegramError("Unauthorized")).toContain("BotFather");
});
it("has a generic fallback with a next step", () => {
  expect(friendlyTelegramError("weird")).toContain("Next step:");
});
it("builds and truncates captions", () => {
  expect(buildCaption("T - Part 1/2", "Hello", ["a", "#b"])).toBe("T - Part 1/2\n\nHello\n\n#a #b");
  expect(buildCaption("x", "y".repeat(2000), []).length).toBe(1024);
});
