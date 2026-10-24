import { describe, expect, it } from "vitest";
import { MAX_PART_BYTES, AUDIO_KBPS, formatTime, planParts, videoBitrateKbps } from "@/lib/split-math";

describe("planParts", () => {
  it("10 min at 30 sec = 20 parts", () => {
    expect(planParts(600, 30, true)).toHaveLength(20);
  });
  it("merges a very short last part", () => {
    const parts = planParts(65, 30, true);
    expect(parts).toHaveLength(2);
    expect(parts[1].duration).toBeCloseTo(35);
  });
  it("keeps the short last part when merge is off", () => {
    expect(planParts(65, 30, false)).toHaveLength(3);
  });
  it("does not merge a reasonably long last part", () => {
    expect(planParts(80, 30, true)).toHaveLength(3);
  });
  it("handles a video shorter than one part", () => {
    expect(planParts(12, 30, true)).toEqual([{ part_number: 1, start: 0, duration: 12 }]);
  });
});

describe("videoBitrateKbps", () => {
  it.each([15, 30, 45, 60, 90, 120])("keeps a %is part under 20 MB", (d) => {
    const bytes = ((videoBitrateKbps(d) + AUDIO_KBPS) * 1000 * d) / 8;
    expect(bytes).toBeLessThan(MAX_PART_BYTES);
  });
});

it("formats time ranges", () => {
  expect(formatTime(0)).toBe("0:00");
  expect(formatTime(90)).toBe("1:30");
  expect(formatTime(3725)).toBe("1:02:05");
});
