import { describe, it, expect } from "vitest";
import {
  addDays,
  addMinutesIso,
  toDateInputValue,
  toMinutes,
  overlaps,
  weekdayMap,
  localDatePartsInZone,
  zonedDateToUtcIso,
} from "../dateUtils.js";

describe("toDateInputValue", () => {
  it("uses local calendar fields (no UTC off-by-one)", () => {
    // Local midnight in a positive UTC offset zone used to roll back a day
    // when going through toISOString(). Build a local date explicitly.
    const date = new Date(2026, 5, 27, 0, 0, 0); // 27 June 2026, local time
    expect(toDateInputValue(date)).toBe("2026-06-27");
  });

  it("pads month and day", () => {
    expect(toDateInputValue(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("addDays", () => {
  it("adds days without mutating the input", () => {
    const base = new Date("2026-06-27T12:00:00Z");
    const next = addDays(base, 3);
    expect(toDateInputValue(next)).toBe(toDateInputValue(new Date("2026-06-30T12:00:00Z")));
    expect(base.toISOString()).toBe("2026-06-27T12:00:00.000Z");
  });
});

describe("addMinutesIso", () => {
  it("adds minutes and returns ISO", () => {
    expect(addMinutesIso("2026-06-27T10:00:00.000Z", 75)).toBe("2026-06-27T11:15:00.000Z");
  });
});

describe("toMinutes", () => {
  it("converts HH:MM into minutes since midnight", () => {
    expect(toMinutes("09:30")).toBe(570);
    expect(toMinutes("00:00")).toBe(0);
    expect(toMinutes("23:59")).toBe(1439);
  });
});

describe("overlaps", () => {
  it("detects overlapping ranges", () => {
    expect(overlaps(0, 10, 5, 15)).toBe(true);
  });
  it("treats touching edges as non-overlapping", () => {
    expect(overlaps(0, 10, 10, 20)).toBe(false);
  });
  it("detects disjoint ranges", () => {
    expect(overlaps(0, 10, 20, 30)).toBe(false);
  });
});

describe("weekdayMap", () => {
  it("maps short names to JS weekday numbers", () => {
    expect(weekdayMap("Sun")).toBe(0);
    expect(weekdayMap("Mon")).toBe(1);
    expect(weekdayMap("Sat")).toBe(6);
  });
  it("falls back to 0 for unknown input", () => {
    expect(weekdayMap("???")).toBe(0);
  });
});

describe("zonedDateToUtcIso", () => {
  it("converts a wall-clock time in a zone to the correct UTC instant", () => {
    // 27 June 2026, 10:00 in Warsaw is CEST (UTC+2) => 08:00 UTC.
    const iso = zonedDateToUtcIso(
      { year: 2026, month: 6, day: 27, hour: 10, minute: 0 },
      "Europe/Warsaw",
    );
    expect(iso).toBe("2026-06-27T08:00:00.000Z");
  });

  it("round-trips through localDatePartsInZone", () => {
    const iso = zonedDateToUtcIso(
      { year: 2026, month: 1, day: 15, hour: 9, minute: 0 },
      "Europe/London",
    );
    // 15 Jan 2026 is GMT (UTC+0) in London => same wall clock in UTC.
    expect(iso).toBe("2026-01-15T09:00:00.000Z");
    const parts = localDatePartsInZone(new Date(iso), "Europe/London");
    expect(parts).toMatchObject({ year: 2026, month: 1, day: 15 });
  });
});
