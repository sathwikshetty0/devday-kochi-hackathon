import { describe, expect, it } from "vitest";
import { MAX_PART_BYTES, AUDIO_KBPS, formatTime, planParts, silenceWindows, videoBitrateKbps } from "@/lib/split-math";

describe("planParts (equal parts)", () => {
  it("60 sec or less = 1 part", () => {
    expect(planParts(60, 60)).toEqual([{ part_number: 1, start: 0, duration: 60 }]);
    expect(planParts(42, 60)).toHaveLength(1);
  });
  it("80 sec at 60 max = 2 parts of 40 sec", () => {
    const p = planParts(80, 60);
    expect(p.map((x) => x.duration)).toEqual([40, 40]);
    expect(p[1].start).toBe(40);
  });
  it("10 min at 30 sec = 20 parts", () => {
    expect(planParts(600, 30)).toHaveLength(20);
  });
  it("fixed lengths when even is off", () => {
    expect(planParts(80, 60, false).map((x) => x.duration)).toEqual([60, 20]);
  });
});

describe("silenceWindows", () => {
  it("cuts at the quietest frame inside the allowed range", () => {
    const frames = Array(300).fill(0.2); // 30 s at 0.1 s frames
    frames[120] = 0; // quiet at 12.05 s
    const w = silenceWindows(frames, 0.1, 8, 20);
    expect(w[0].end).toBeCloseTo(12.05);
    expect(w[w.length - 1].end).toBeCloseTo(30);
  });
  it("keeps short audio as one window", () => {
    expect(silenceWindows(Array(100).fill(0.1), 0.1, 8, 20)).toEqual([{ start: 0, end: 10 }]);
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

import { ratioLabel } from "@/lib/split-math";
it("labels aspect ratios", () => {
  expect(ratioLabel(1920, 1080)).toBe("16:9");
  expect(ratioLabel(1080, 1920)).toBe("9:16");
  expect(ratioLabel(1366, 768)).toBe("16:9");
  expect(ratioLabel(1080, 1350)).toBe("4:5");
  expect(ratioLabel(1000, 700)).toBe("10:7");
});
