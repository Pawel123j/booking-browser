import { validateData } from "./dataStore.js";

export function createBookingStore({ getStorage, key, makeDefault, onChange = () => {}, onSaved = () => {}, recoveryId = () => crypto.randomUUID() }) {
  let memory;
  let original;
  let observed = false;
  let problem = null;
  const report = () => onChange({ problem, original: typeof original === "string" ? original : null });
  const parse = (raw) => {
    return validateData(JSON.parse(raw));
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
  function save(data, requireDurable = false) {
    data = validateData(data);
    if (!requireDurable) memory = data;
    if (problem) { report(); return false; }
    try {
      const raw = JSON.stringify(data);
      getStorage().setItem(key, raw);
      original = raw;
      memory = data;
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
