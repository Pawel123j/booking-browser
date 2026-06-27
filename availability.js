// Pure availability engine. Given a service, a resource and an explicit
// set of options, it returns the bookable (and optionally blocked) slots.
// It does NOT read the DOM or any global state, which keeps it testable
// and free of the fragile "swap the input values and restore them" trick.

import {
  toMinutes,
  overlaps,
  weekdayMap,
  localDatePartsInZone,
  zonedDateToUtcIso,
  addMinutesIso,
} from "./dateUtils.js";

export function isMorning(hour) {
  return hour < 12;
}

export function isEvening(hour) {
  return hour >= 15;
}

export function isWithinBreak(resource, weekday, slotStartMinute, slotEndMinute) {
  const breaks = resource.breakHours?.[weekday] || [];
  return breaks.some(([start, end]) => overlaps(slotStartMinute, slotEndMinute, toMinutes(start), toMinutes(end)));
}

/**
 * @param {object} service
 * @param {object} resource
 * @param {object} options
 * @param {string} options.from              - "YYYY-MM-DD"
 * @param {string} options.to                - "YYYY-MM-DD"
 * @param {Date}   [options.now]             - reference "now" (defaults to current time)
 * @param {Array}  [options.appointments]    - existing appointments to check conflicts against
 * @param {boolean}[options.morningOnly]
 * @param {boolean}[options.eveningOnly]
 * @param {string} [options.excludeAppointmentId] - ignore this appointment when checking conflicts
 * @param {boolean}[options.includeBlocked]  - when true, occupied slots are returned with blocked:true
 * @returns {Array} sorted slots, each with a `blocked` flag
 */
export function computeAvailability(service, resource, options = {}) {
  const {
    from,
    to,
    now = new Date(),
    appointments = [],
    morningOnly = false,
    eveningOnly = false,
    excludeAppointmentId = null,
    includeBlocked = false,
  } = options;

  if (!service || !resource || !from || !to) return [];

  const fromDate = new Date(`${from}T12:00:00`);
  const toDate = new Date(`${to}T12:00:00`);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate > toDate) return [];

  const results = [];
  for (let cursor = new Date(fromDate); cursor <= toDate; cursor.setDate(cursor.getDate() + 1)) {
    const parts = localDatePartsInZone(cursor, resource.timeZone);
    const weekday = weekdayMap(parts.weekdayShort);
    const localDateString = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
    if ((resource.blackoutDates || []).includes(localDateString)) continue;

    const windows = resource.weeklyHours?.[weekday] || [];
    for (const [startStr, endStr] of windows) {
      const dayStartMinute = toMinutes(startStr);
      const dayEndMinute = toMinutes(endStr);
      for (let slotStartMinute = dayStartMinute; slotStartMinute + service.durationMinutes <= dayEndMinute; slotStartMinute += service.slotStepMinutes) {
        const slotEndMinute = slotStartMinute + service.durationMinutes;
        if (isWithinBreak(resource, weekday, slotStartMinute, slotEndMinute)) continue;

        const startHour = Math.floor(slotStartMinute / 60);
        const startMinute = slotStartMinute % 60;
        const endHour = Math.floor(slotEndMinute / 60);
        const endMinute = slotEndMinute % 60;

        if (morningOnly && !isMorning(startHour)) continue;
        if (eveningOnly && !isEvening(startHour)) continue;

        const startsAt = zonedDateToUtcIso({ ...parts, hour: startHour, minute: startMinute }, resource.timeZone);
        const endsAt = zonedDateToUtcIso({ ...parts, hour: endHour, minute: endMinute }, resource.timeZone);
        const occupancyEndsAt = addMinutesIso(endsAt, service.bufferAfterMinutes);

        if (new Date(startsAt) < now) continue;

        const blocked = appointments.some((appointment) => {
          if (appointment.resourceId !== resource.id || appointment.status !== "CONFIRMED") return false;
          if (excludeAppointmentId && appointment.id === excludeAppointmentId) return false;
          return overlaps(
            new Date(startsAt).getTime(),
            new Date(occupancyEndsAt).getTime(),
            new Date(appointment.startsAt).getTime(),
            new Date(appointment.occupancyEndsAt).getTime(),
          );
        });

        if (blocked && !includeBlocked) continue;

        results.push({
          resourceId: resource.id,
          serviceId: service.id,
          startsAt,
          endsAt,
          occupancyEndsAt,
          localDateString,
          timeZone: resource.timeZone,
          blocked,
        });
      }
    }
  }

  return results.sort((left, right) => new Date(left.startsAt) - new Date(right.startsAt));
}
