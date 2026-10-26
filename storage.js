// Storage is optional: a failed read/write must never erase the user's copy.
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value) => typeof value === "string";
const integer = (value, min = 0) => Number.isSafeInteger(value) && value >= min;
const date = (value) => text(value) && Number.isFinite(Date.parse(value));
const day = (value) => text(value) && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T12:00:00Z`))
  && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
const clock = (value) => text(value) && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);

function schedule(value) {
  return object(value) && Object.entries(value).every(([weekday, windows]) => /^[0-6]$/.test(weekday)
    && Array.isArray(windows) && windows.every((range) => Array.isArray(range) && range.length === 2
      && clock(range[0]) && (clock(range[1]) || range[1] === "24:00") && range[0] < range[1]));
}

function timezone(value) {
  if (!text(value)) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
}

function unique(items) {
  return new Set(items.map((item) => item.id)).size === items.length;
}

export function validateBookingData(value) {
  if (!object(value) || !["services", "resources", "appointments", "waitlist", "mailbox"].every((key) => Array.isArray(value[key]))) return false;
  const { services, resources, appointments, waitlist, mailbox } = value;
  if (!services.length || !resources.length) return false;
  if (!services.every((s) => object(s) && integer(s.id, 1) && text(s.name) && text(s.category)
    && integer(s.durationMinutes, 1) && s.durationMinutes <= 1440
    && integer(s.slotStepMinutes, 1) && s.slotStepMinutes <= 1440
    && integer(s.bufferAfterMinutes) && s.bufferAfterMinutes <= 1440
    && Number.isFinite(s.price) && s.price >= 0)) return false;
  if (!resources.every((r) => object(r) && integer(r.id, 1) && text(r.name) && text(r.role)
    && text(r.locationName) && timezone(r.timeZone) && schedule(r.weeklyHours)
    && schedule(r.breakHours ?? {}) && Array.isArray(r.blackoutDates) && r.blackoutDates.every(day))) return false;
  const reference = (item) => object(item) && text(item.id) && item.id.length > 0
    && services.some((s) => s.id === item.serviceId) && resources.some((r) => r.id === item.resourceId)
    && text(item.customerName) && text(item.customerEmail) && date(item.createdAt)
    && (item.priority == null || ["normal", "vip", "urgent"].includes(item.priority));
  if (!appointments.every((a) => reference(a) && ["CONFIRMED", "CANCELLED"].includes(a.status)
    && date(a.startsAt) && date(a.endsAt) && date(a.occupancyEndsAt)
    && Date.parse(a.startsAt) < Date.parse(a.endsAt) && Date.parse(a.endsAt) <= Date.parse(a.occupancyEndsAt))) return false;
  if (!waitlist.every((w) => reference(w) && ["WAITING", "PROMOTED"].includes(w.status)
    && day(w.desiredFrom) && day(w.desiredTo) && w.desiredFrom <= w.desiredTo)) return false;
  if (!mailbox.every((m) => object(m) && text(m.id) && text(m.to) && text(m.subject) && text(m.body) && date(m.createdAt))) return false;
  return [services, resources, appointments, waitlist, mailbox].every(unique);
}

export function createBookingStore({ getStorage, key, makeDefault, onChange = () => {}, onSaved = () => {}, recoveryId = () => crypto.randomUUID() }) {
  let memory;
  let original;
  let observed = false;
  let problem = null;
  const report = () => onChange({ problem, original: typeof original === "string" ? original : null });
  const parse = (raw) => {
    const value = JSON.parse(raw);
    if (!validateBookingData(value)) throw new Error("Invalid booking data");
    return value;
  };
  function load() {
    if (problem && memory) return memory;
    let raw;
    try {
      raw = getStorage().getItem(key);
      observed = true;
      original = raw;
    } catch {
      problem = "read";
      memory ??= makeDefault();
      report();
      return memory;
    }
    if (raw === null) {
      memory = makeDefault();
      save(memory);
      return memory;
    }
    try { memory = parse(raw); } catch {
      problem = "invalid";
      memory ??= makeDefault();
    }
    report();
    return memory;
  }
  function save(data) {
    if (!validateBookingData(data)) throw new Error("Invalid booking data");
    memory = data;
    if (problem) { report(); return false; }
    try {
      const raw = JSON.stringify(data);
      getStorage().setItem(key, raw);
      original = raw;
      observed = true;
    } catch {
      problem = "write";
      report();
      return false;
    }
    report();
    // Broadcast is a hint; its failure cannot invalidate a completed disk write.
    try { onSaved(); } catch { /* A closed/unsupported channel is harmless. */ }
    return true;
  }
  function retry() {
    // A denied initial read leaves unknown data behind. Never replace it blindly.
    if (!observed) { problem = "read"; report(); return false; }
    try {
      const storage = getStorage();
      if (storage.getItem(key) !== original) { problem = "conflict"; report(); return false; }
      if (problem === "invalid" && original !== null) {
        // Keep the exact original, even if it is not JSON. Failure aborts recovery.
        const backupKey = `${key}:recovery:${recoveryId()}`;
        if (storage.getItem(backupKey) !== null) throw new Error("Recovery key already exists");
        storage.setItem(backupKey, original);
      }
      const previous = problem;
      problem = null;
      const saved = save(memory);
      if (!saved && previous === "invalid") problem = "invalid";
      report();
      return saved;
    } catch {
      report();
      return false;
    }
  }
  function reload() {
    memory = undefined;
    observed = false;
    problem = null;
    return load();
  }
  return { load, save, retry, reload };
}
