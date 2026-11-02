import { describe, expect, it } from "vitest";
import { validateData } from "../dataStore.js";

const validData = {
  services: [{ id: 1, name: "Consultation", category: "Health", durationMinutes: 30, slotStepMinutes: 15, bufferAfterMinutes: 0, price: 50 }],
  resources: [{ id: 2, name: "Anna", role: "Specialist", locationName: "Warsaw", notes: "", timeZone: "Europe/Warsaw", weeklyHours: { 1: [["09:00", "12:00"]] }, breakHours: {}, blackoutDates: [] }],
  appointments: [],
  waitlist: [],
  mailbox: [],
};

describe("validateData", () => {
  it("returns a detached versioned snapshot and accepts legacy exports", () => {
    const result = validateData(validData);
    expect(result.schemaVersion).toBe(1);
    expect(result.services).toEqual(validData.services);
    expect(result.services).not.toBe(validData.services);
  });

  it.each([
    [{ ...validData, services: [null] }],
    [{ ...validData, schemaVersion: 9 }],
    [{ ...validData, resources: [{ ...validData.resources[0], timeZone: "Mars/Olympus" }] }],
    [{ ...validData, resources: [{ ...validData.resources[0], blackoutDates: ["2026-02-31"] }] }],
    [{ ...validData, appointments: [{ id: "orphan", serviceId: 99, resourceId: 2, customerName: "", customerEmail: "", phone: "", notesCustomer: "", priority: "normal", createdAt: "2026-10-29T10:00:00Z" }] }],
  ])("rejects malformed or orphaned imported state", (data) => {
    expect(() => validateData(data)).toThrow();
  });
});
