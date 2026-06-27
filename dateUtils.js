// Pure, framework-free date/time helpers.
// No DOM access here so the logic stays unit-testable in Node.

export function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function daysAgoIso(days) {
  const copy = new Date();
  copy.setDate(copy.getDate() - days);
  return copy.toISOString();
}

export function addMinutesIso(iso, minutes) {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

// Build a YYYY-MM-DD string from the *local* calendar fields.
// Using toISOString() here would shift the day for positive UTC offsets
// (e.g. Europe/Warsaw midnight is the previous day in UTC).
export function toDateInputValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function toMinutes(hhmm) {
  const [hour, minute] = hhmm.split(":").map(Number);
  return hour * 60 + minute;
}

export function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

export function weekdayMap(shortName) {
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[shortName] ?? 0;
}

export function localDatePartsInZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(date);
  const obj = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return {
    year: Number(obj.year),
    month: Number(obj.month),
    day: Number(obj.day),
    weekdayShort: obj.weekday,
  };
}

export function zonedDateToUtcIso({ year, month, day, hour, minute }, timeZone) {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const local = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(utcGuess);
  const got = Object.fromEntries(local.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const gotMinutes = Date.UTC(Number(got.year), Number(got.month) - 1, Number(got.day), Number(got.hour), Number(got.minute));
  const wantMinutes = Date.UTC(year, month - 1, day, hour, minute);
  const diff = wantMinutes - gotMinutes;
  return new Date(utcGuess.getTime() + diff).toISOString();
}

export function nextWeekdayAt(referenceDate, weekday, hour, minute) {
  const date = new Date(referenceDate);
  date.setHours(12, 0, 0, 0);
  const currentWeekday = date.getDay();
  let delta = (weekday - currentWeekday + 7) % 7;
  if (delta === 0) delta = 7;
  date.setDate(date.getDate() + delta);
  const timeZone = "Europe/Warsaw";
  const parts = localDatePartsInZone(date, timeZone);
  const start = zonedDateToUtcIso({ ...parts, hour, minute }, timeZone);
  return { start };
}

export function formatDateRange(startIso, endIso, timeZone = undefined) {
  const formatter = new Intl.DateTimeFormat("pl-PL", {
    timeZone,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${formatter.format(new Date(startIso))} → ${formatter.format(new Date(endIso))}`;
}

export function formatSlotMeta(startIso, timeZone) {
  const date = new Date(startIso);
  return {
    day: new Intl.DateTimeFormat("pl-PL", {
      timeZone,
      weekday: "long",
      day: "2-digit",
      month: "long",
    }).format(date),
    shortDay: new Intl.DateTimeFormat("pl-PL", {
      timeZone,
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
    }).format(date),
    time: new Intl.DateTimeFormat("pl-PL", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
    }).format(date),
  };
}
