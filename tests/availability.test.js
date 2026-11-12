import { describe, it, expect } from "vitest";
import { computeAvailability, isWithinBreak } from "../availability.js";

// Monday 2026-07-06, 09:00–11:00 in Warsaw, with a short break at 10:00–10:15.
const resource = {
  id: 1,
  timeZone: "Europe/Warsaw",
  weeklyHours: { 1: [["09:00", "11:00"]] },
  breakHours: { 1: [["10:00", "10:15"]] },
  blackoutDates: [],
};
const service = { id: 1, durationMinutes: 30, bufferAfterMinutes: 10, slotStepMinutes: 15 };

const FROM = "2026-07-06";
const TO = "2026-07-06";
// Reference "now" far in the past so future slots are never filtered out.
const NOW = new Date("2026-01-01T00:00:00.000Z");

describe("computeAvailability", () => {
  it.each(["Europe/Warsaw", "Europe/London"])("keeps DST transition slots unique, real and of the advertised duration in %s", (timeZone) => {
    const sunday = { ...resource, timeZone, weeklyHours: { 0: [["00:00", "05:00"]] }, breakHours: {} };
    for (const date of ["2026-03-29", "2026-10-25"]) {
      const slots = computeAvailability(service, sunday, { from: date, to: date, now: new Date("2026-01-01") });
      expect(slots.length).toBeGreaterThan(0);
      expect(new Set(slots.map((slot) => slot.startsAt)).size).toBe(slots.length);
      for (const slot of slots) {
        expect(Date.parse(slot.endsAt) - Date.parse(slot.startsAt)).toBe(service.durationMinutes * 60_000);
        const wall = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(slot.startsAt));
        if (date === "2026-03-29") expect(wall.startsWith(timeZone === "Europe/Warsaw" ? "02:" : "01:")).toBe(false);
      }
      const occupied = [{ ...slots[0], id: "dst-booking", status: "CONFIRMED" }];
      const available = computeAvailability(service, sunday, { from: date, to: date, now: new Date("2026-01-01"), appointments: occupied });
      expect(available.some((slot) => slot.startsAt === slots[0].startsAt)).toBe(false);
    }
  });

  it("generates step-based slots and respects breaks", () => {
    const slots = computeAvailability(service, resource, { from: FROM, to: TO, now: NOW });
    // 09:00, 09:15, 09:30, 10:15, 10:30 — the 09:45 and 10:00 slots collide with the break.
    expect(slots).toHaveLength(5);
    expect(slots.every((slot) => slot.blocked === false)).toBe(true);
  });

  it("returns slots sorted ascending with correct UTC instant (CEST = UTC+2)", () => {
    const slots = computeAvailability(service, resource, { from: FROM, to: TO, now: NOW });
    expect(slots[0].startsAt).toBe("2026-07-06T07:00:00.000Z");
    const times = slots.map((slot) => slot.startsAt);
    expect([...times].sort()).toEqual(times);
  });

  it("hides occupied slots by default", () => {
    const appointments = [{
      id: "appt-1",
      resourceId: 1,
      serviceId: 1,
      status: "CONFIRMED",
      startsAt: "2026-07-06T07:00:00.000Z",
      occupancyEndsAt: "2026-07-06T07:40:00.000Z",
    }];
    const slots = computeAvailability(service, resource, { from: FROM, to: TO, now: NOW, appointments });
    expect(slots).toHaveLength(2); // 10:15 and 10:30 survive
  });

  it("keeps occupied slots flagged when includeBlocked is true", () => {
    const appointments = [{
      id: "appt-1",
      resourceId: 1,
      serviceId: 1,
      status: "CONFIRMED",
      startsAt: "2026-07-06T07:00:00.000Z",
      occupancyEndsAt: "2026-07-06T07:40:00.000Z",
    }];
    const slots = computeAvailability(service, resource, { from: FROM, to: TO, now: NOW, appointments, includeBlocked: true });
    expect(slots).toHaveLength(5);
    expect(slots.filter((slot) => slot.blocked)).toHaveLength(3);
  });

  it("ignores the excluded appointment (used during reschedule)", () => {
    const appointments = [{
      id: "appt-1",
      resourceId: 1,
      serviceId: 1,
      status: "CONFIRMED",
      startsAt: "2026-07-06T07:00:00.000Z",
      occupancyEndsAt: "2026-07-06T07:40:00.000Z",
    }];
    const slots = computeAvailability(service, resource, {
      from: FROM, to: TO, now: NOW, appointments, excludeAppointmentId: "appt-1",
    });
    expect(slots).toHaveLength(5);
  });

  it("applies the eveningOnly filter", () => {
    const slots = computeAvailability(service, resource, { from: FROM, to: TO, now: NOW, eveningOnly: true });
    expect(slots).toHaveLength(0); // nothing after 15:00 in this window
  });

  it("skips blackout dates", () => {
    const closed = { ...resource, blackoutDates: ["2026-07-06"] };
    const slots = computeAvailability(service, closed, { from: FROM, to: TO, now: NOW });
    expect(slots).toHaveLength(0);
  });

  it("filters out slots in the past relative to now", () => {
    const slots = computeAvailability(service, resource, {
      from: FROM, to: TO, now: new Date("2026-12-31T00:00:00.000Z"),
    });
    expect(slots).toHaveLength(0);
  });

  it("returns [] for an invalid range", () => {
    expect(computeAvailability(service, resource, { from: "2026-07-10", to: "2026-07-06", now: NOW })).toEqual([]);
    expect(computeAvailability(service, resource, { from: "", to: "", now: NOW })).toEqual([]);
  });
});

describe("isWithinBreak", () => {
  it("detects a slot landing inside a break", () => {
    expect(isWithinBreak(resource, 1, 600, 630)).toBe(true); // 10:00–10:30 hits the 10:00–10:15 break
  });
  it("passes a slot clear of any break", () => {
    expect(isWithinBreak(resource, 1, 540, 570)).toBe(false); // 09:00–09:30
  });
});
