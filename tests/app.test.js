// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const html = readFileSync("index.html", "utf8");
const KEY = "bookingflow-studio-v1";
const localStorageDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
const start = () => import("../app.js");
const warning = () => document.getElementById("storageWarning");
const click = (id) => document.getElementById(id).click();
const loadSlots = () => click("loadSlotsBtn");
const importFile = (content) => {
  const input = document.getElementById("importFileInput");
  Object.defineProperty(input, "files", { configurable: true, value: [new window.File([content], "backup.json", { type: "application/json" })] });
  input.dispatchEvent(new window.Event("change", { bubbles: true }));
};

beforeEach(() => {
  vi.resetModules();
  window.localStorage.clear();
  document.body.innerHTML = new DOMParser().parseFromString(html, "text/html").body.innerHTML;
  vi.stubGlobal("confirm", vi.fn(() => true));
  // Each test models a fresh browser page. Node's BroadcastChannel would keep
  // old, re-imported app instances alive after replacing document.body.
  vi.stubGlobal("BroadcastChannel", class {
    postMessage() {}
    addEventListener() {}
    close() {}
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Object.defineProperty(window, "localStorage", localStorageDescriptor);
});

describe("actual application bootstrap and persistence", () => {
  it("persists a healthy new session and preserves a waitlist entry after reload", async () => {
    await start();
    expect(warning().hidden).toBe(true);
    const before = JSON.parse(localStorage.getItem(KEY));
    click("waitlistBtn");
    const saved = localStorage.getItem(KEY);
    expect(JSON.parse(saved).waitlist).toHaveLength(before.waitlist.length + 1);
    vi.resetModules();
    document.body.innerHTML = new DOMParser().parseFromString(html, "text/html").body.innerHTML;
    await start();
    expect(warning().hidden).toBe(true);
    expect(localStorage.getItem(KEY)).toBe(saved);
    expect(document.getElementById("waitlistContainer").textContent).toContain("Paweł Kowalski");
  });

  it.each(["{invalid", "null", "{}", "[]", '"text"'])('preserves invalid source %s through bootstrap and user edits', async (raw) => {
    localStorage.setItem(KEY, raw);
    await start();
    expect(warning().hidden).toBe(false);
    expect(warning().textContent).toContain("Oryginał pozostał nienaruszony");
    click("waitlistBtn");
    loadSlots();
    expect(localStorage.getItem(KEY)).toBe(raw);
    expect(document.getElementById("waitlistContainer").textContent).toContain("Paweł Kowalski");
    expect(document.getElementById("bookingStatus").textContent).toContain("pamięci");
  });

  it("rejects invalid nested rows instead of crashing the renderer", async () => {
    await start();
    const data = JSON.parse(localStorage.getItem(KEY));
    data.services[0].slotStepMinutes = 0;
    data.mailbox[0].createdAt = "invalid-date";
    const raw = JSON.stringify(data);
    localStorage.setItem(KEY, raw);
    loadSlots();
    expect(warning().hidden).toBe(false);
    expect(localStorage.getItem(KEY)).toBe(raw);
  });

  it("handles denied storage getter and keeps session changes across rerenders", async () => {
    Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new DOMException("Denied", "SecurityError"); } });
    await start();
    click("waitlistBtn");
    loadSlots();
    expect(warning().textContent).toContain("Nie można odczytać");
    expect(document.getElementById("waitlistContainer").textContent).toContain("Paweł Kowalski");
    expect(document.getElementById("retryStorageBtn").disabled).toBe(true);
    click("themeToggleBtn");
    expect(document.getElementById("bookingStatus").textContent).toContain("zapis ustawień jest niedostępny");
  });

  it("handles quota failure and retries without losing the session", async () => {
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Quota", "QuotaExceededError"); });
    await start();
    click("waitlistBtn");
    loadSlots();
    expect(warning().textContent).toContain("Nie udało się zapisać");
    expect(document.getElementById("waitlistContainer").textContent).toContain("Paweł Kowalski");
    set.mockRestore();
    click("retryStorageBtn");
    expect(warning().hidden).toBe(true);
    expect(JSON.parse(localStorage.getItem(KEY)).waitlist.some((w) => w.customerName === "Paweł Kowalski")).toBe(true);
  });

  it("retains a byte-exact recovery copy before explicit replacement of corrupt storage", async () => {
    const raw = "{ user data that must survive";
    localStorage.setItem(KEY, raw);
    await start();
    click("waitlistBtn");
    click("retryStorageBtn");
    expect(warning().hidden).toBe(true);
    const backupKey = Object.keys(localStorage).find((key) => key.startsWith(`${KEY}:recovery:`));
    expect(localStorage.getItem(backupKey)).toBe(raw);
    expect(JSON.parse(localStorage.getItem(KEY)).waitlist.some((w) => w.customerName === "Paweł Kowalski")).toBe(true);
  });

  it("does not overwrite corrupt storage when backing it up fails", async () => {
    const raw = "{invalid";
    localStorage.setItem(KEY, raw);
    await start();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Quota", "QuotaExceededError"); });
    click("retryStorageBtn");
    expect(localStorage.getItem(KEY)).toBe(raw);
    expect(warning().hidden).toBe(false);
  });

  it("refuses to overwrite another tab's changed source during recovery", async () => {
    localStorage.setItem(KEY, "{invalid");
    await start();
    localStorage.setItem(KEY, "different-source");
    click("retryStorageBtn");
    expect(localStorage.getItem(KEY)).toBe("different-source");
    expect(warning().textContent).toContain("Inna karta zmieniła zapis");
    expect(document.getElementById("retryStorageBtn").disabled).toBe(true);
  });

  it("preserves a previous successful save after a later quota failure", async () => {
    await start();
    const original = localStorage.getItem(KEY);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Quota", "QuotaExceededError"); });
    click("waitlistBtn");
    loadSlots();
    expect(localStorage.getItem(KEY)).toBe(original);
    expect(warning().textContent).toContain("Nie udało się zapisać");
    expect(document.getElementById("waitlistContainer").textContent).toContain("Paweł Kowalski");
  });

  it("validates imports before replacing a healthy saved dataset", async () => {
    await start();
    const original = localStorage.getItem(KEY);
    importFile('{"data":{"appointments":[null]}}');
    await vi.waitFor(() => expect(document.getElementById("bookingStatus").textContent).toContain("Nie udało się wczytać"));
    expect(localStorage.getItem(KEY)).toBe(original);
    const valid = JSON.parse(original);
    valid.waitlist = [];
    importFile(JSON.stringify({ data: valid }));
    await vi.waitFor(() => expect(JSON.parse(localStorage.getItem(KEY)).waitlist).toEqual([]));
    expect(warning().hidden).toBe(true);
  });

  it("imports into memory without overwriting the original corrupt source", async () => {
    await start();
    const valid = JSON.parse(localStorage.getItem(KEY));
    localStorage.setItem(KEY, "{invalid");
    loadSlots();
    valid.waitlist[0].customerName = "Recovered client";
    importFile(JSON.stringify({ data: valid }));
    await vi.waitFor(() => expect(document.getElementById("waitlistContainer").textContent).toContain("Recovered client"));
    expect(localStorage.getItem(KEY)).toBe("{invalid");
    expect(document.getElementById("bookingStatus").textContent).toContain("pamięci");
  });

  it("does not replace an existing recovery backup", async () => {
    localStorage.setItem(KEY, "{invalid");
    await start();
    localStorage.setItem(`${KEY}:recovery:collision`, "previous backup");
    vi.spyOn(window.crypto, "randomUUID").mockReturnValue("collision");
    click("retryStorageBtn");
    expect(localStorage.getItem(KEY)).toBe("{invalid");
    expect(localStorage.getItem(`${KEY}:recovery:collision`)).toBe("previous backup");
    expect(warning().hidden).toBe(false);
  });
});
