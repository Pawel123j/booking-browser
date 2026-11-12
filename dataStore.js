const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value) => typeof value === "string";
const id = (value) => (typeof value === "string" && value.length > 0) || (Number.isSafeInteger(value) && value > 0);
const date = (value) => text(value) && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const instant = (value) => text(value) && /^\d{4}-\d{2}-\d{2}T/.test(value) && date(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
const zone = (value) => { try { return text(value) && !!new Intl.DateTimeFormat("pl", { timeZone: value }); } catch { return false; } };
function requireValid(condition, label) { if (!condition) throw new Error(`Nieprawidłowe dane: ${label}.`); }
function records(value, label) {
  requireValid(Array.isArray(value) && value.length <= 10000, label);
  const seen = new Set();
  for (const item of value) {
    requireValid(object(item) && id(item.id) && !seen.has(item.id), `${label}: rekord lub ID`);
    seen.add(item.id);
  }
  return value;
}
const clock = (value) => text(value) && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
function hours(value) {
  return object(value) && Object.entries(value).every(([day, windows]) => /^[0-6]$/.test(day) && Array.isArray(windows) && windows.every(pair => Array.isArray(pair) && pair.length === 2 && clock(pair[0]) && (clock(pair[1]) || pair[1] === "24:00") && pair[0] < pair[1]));
}
/** Validate first, then return a detached versioned snapshot. Legacy unversioned exports are supported. */
export function validateData(input) {
  requireValid(object(input), "eksport");
  requireValid(input.schemaVersion === undefined || input.schemaVersion === 1, "wersja schematu");
  const source = input.data ?? input;
  requireValid(object(source) && (source.schemaVersion === undefined || source.schemaVersion === 1), "wersja danych");
  const services = records(source.services, "usługi");
  const resources = records(source.resources, "specjaliści");
  requireValid(services.length && resources.length, "puste usługi lub specjaliści");
  for (const s of services) requireValid(Number.isSafeInteger(s.id) && s.id > 0 && text(s.name) && s.name.trim() && text(s.category) && [s.durationMinutes, s.slotStepMinutes].every(v => Number.isInteger(v) && v > 0 && v <= 1440) && Number.isInteger(s.bufferAfterMinutes) && s.bufferAfterMinutes >= 0 && s.bufferAfterMinutes <= 1440 && Number.isFinite(s.price) && s.price >= 0, "usługa");
  for (const r of resources) requireValid(Number.isSafeInteger(r.id) && r.id > 0 && [r.name, r.role, r.locationName, r.notes].every(text) && zone(r.timeZone) && hours(r.weeklyHours) && hours(r.breakHours) && Array.isArray(r.blackoutDates) && r.blackoutDates.every(date), "specjalista / godziny");
  const appointments = records(source.appointments, "rezerwacje");
  const waitlist = records(source.waitlist, "kolejka");
  const mailbox = records(source.mailbox, "poczta");
  for (const item of [...appointments, ...waitlist]) {
    requireValid(services.some(s => s.id === item.serviceId) && resources.some(r => r.id === item.resourceId), "nieistniejąca usługa lub specjalista");
    requireValid([item.customerName, item.customerEmail, item.phone, item.notesCustomer].every(text) && ["normal", "vip", "urgent"].includes(item.priority) && instant(item.createdAt), "dane klienta");
  }
  for (const a of appointments) requireValid([a.startsAt, a.endsAt, a.occupancyEndsAt].every(instant) && Date.parse(a.startsAt) < Date.parse(a.endsAt) && Date.parse(a.endsAt) <= Date.parse(a.occupancyEndsAt) && ["CONFIRMED", "CANCELLED"].includes(a.status) && [a.referenceCode, a.resourceName, a.serviceName].every(text) && zone(a.clientTimeZone) && (a.cancelledAt === undefined || instant(a.cancelledAt)), "termin rezerwacji");
  for (const w of waitlist) requireValid(date(w.desiredFrom) && date(w.desiredTo) && w.desiredFrom <= w.desiredTo && ["WAITING", "PROMOTED"].includes(w.status), "zakres kolejki");
  for (const m of mailbox) requireValid([m.to, m.subject, m.body].every(text) && instant(m.createdAt), "wiadomość");
  return JSON.parse(JSON.stringify({ schemaVersion: 1, services, resources, appointments, waitlist, mailbox }));
}
