import {
  addDays,
  addMinutesIso,
  daysAgoIso,
  nextWeekdayAt,
  toDateInputValue,
  localDatePartsInZone,
  overlaps,
  formatDateRange,
  formatSlotMeta,
} from "./dateUtils.js";
import { computeAvailability } from "./availability.js";

const STORAGE_KEY = "bookingflow-studio-v1";
const THEME_KEY = "bookingflow-studio-theme";
const SYNC_CHANNEL_NAME = "bookingflow-studio-sync";
const channel = "BroadcastChannel" in window ? new BroadcastChannel(SYNC_CHANNEL_NAME) : null;

const seed = {
  services: [
    { id: 1, name: "Konsultacja standard", durationMinutes: 30, bufferAfterMinutes: 10, slotStepMinutes: 15, price: 149, category: "Konsultacja" },
    { id: 2, name: "Wizyta premium", durationMinutes: 60, bufferAfterMinutes: 15, slotStepMinutes: 15, price: 259, category: "Premium" },
    { id: 3, name: "Kontrola express", durationMinutes: 15, bufferAfterMinutes: 5, slotStepMinutes: 15, price: 89, category: "Express" },
    { id: 4, name: "Konsultacja online", durationMinutes: 45, bufferAfterMinutes: 10, slotStepMinutes: 15, price: 199, category: "Online" },
  ],
  resources: [
    {
      id: 1,
      name: "Anna Kowalska",
      role: "Senior konsultant",
      locationName: "Kraków Centrum",
      timeZone: "Europe/Warsaw",
      notes: "Najmocniejsza pod wizyty premium i stałych klientów.",
      weeklyHours: { 1:[ ["09:00","17:00"] ], 2:[ ["09:00","17:00"] ], 3:[ ["09:00","17:00"] ], 4:[ ["09:00","17:00"] ], 5:[ ["09:00","15:00"] ] },
      breakHours: { 1:[ ["12:30","13:00"] ], 2:[ ["12:30","13:00"] ], 3:[ ["12:30","13:00"] ], 4:[ ["12:30","13:00"] ], 5:[ ["12:00","12:30"] ] },
      blackoutDates: [],
    },
    {
      id: 2,
      name: "Piotr Nowak",
      role: "Ekspert ekspresowy",
      locationName: "Kraków Podgórze",
      timeZone: "Europe/Warsaw",
      notes: "Szybkie sloty, dużo miejsca rano.",
      weeklyHours: { 1:[ ["08:00","16:00"] ], 2:[ ["08:00","16:00"] ], 3:[ ["10:00","18:00"] ], 4:[ ["10:00","18:00"] ], 5:[ ["08:00","14:00"] ] },
      breakHours: { 1:[ ["11:30","12:00"] ], 2:[ ["11:30","12:00"] ], 3:[ ["14:00","14:30"] ], 4:[ ["14:00","14:30"] ], 5:[ ["11:00","11:30"] ] },
      blackoutDates: [],
    },
    {
      id: 3,
      name: "Marta Zielińska",
      role: "Remote online specialist",
      locationName: "Zdalnie / London",
      timeZone: "Europe/London",
      notes: "Dobre demo pod strefy czasowe i wizyty online.",
      weeklyHours: { 1:[ ["09:00","16:00"] ], 2:[ ["09:00","16:00"] ], 3:[ ["09:00","16:00"] ], 4:[ ["09:00","16:00"] ] },
      breakHours: { 1:[ ["12:00","12:30"] ], 2:[ ["12:00","12:30"] ], 3:[ ["12:00","12:30"] ], 4:[ ["12:00","12:30"] ] },
      blackoutDates: [],
    },
  ],
  appointments: [],
  waitlist: [],
  mailbox: [],
};

const state = {
  services: [],
  resources: [],
  appointments: [],
  waitlist: [],
  mailbox: [],
  selectedServiceId: 1,
  selectedResourceId: 1,
  availability: [],
  selectedSlot: null,
  bookingFilter: "all",
  rescheduleAppointmentId: null,
  activeTab: "bookings",
};

const els = {
  statsGrid: document.getElementById("statsGrid"),
  serviceCards: document.getElementById("serviceCards"),
  resourceCards: document.getElementById("resourceCards"),
  clientTimeZoneBadge: document.getElementById("clientTimeZoneBadge"),
  fromInput: document.getElementById("fromInput"),
  toInput: document.getElementById("toInput"),
  showMorningOnly: document.getElementById("showMorningOnly"),
  showEveningOnly: document.getElementById("showEveningOnly"),
  loadSlotsBtn: document.getElementById("loadSlotsBtn"),
  availabilityMeta: document.getElementById("availabilityMeta"),
  availabilityBoard: document.getElementById("availabilityBoard"),
  selectedSlotLabel: document.getElementById("selectedSlotLabel"),
  selectedSlotSubtext: document.getElementById("selectedSlotSubtext"),
  bookingModeBadge: document.getElementById("bookingModeBadge"),
  bookingForm: document.getElementById("bookingForm"),
  nameInput: document.getElementById("nameInput"),
  emailInput: document.getElementById("emailInput"),
  phoneInput: document.getElementById("phoneInput"),
  prioritySelect: document.getElementById("prioritySelect"),
  notesInput: document.getElementById("notesInput"),
  bookBtn: document.getElementById("bookBtn"),
  waitlistBtn: document.getElementById("waitlistBtn"),
  clearModeBtn: document.getElementById("clearModeBtn"),
  bookingStatus: document.getElementById("bookingStatus"),
  lookupEmailInput: document.getElementById("lookupEmailInput"),
  loadMyBookingsBtn: document.getElementById("loadMyBookingsBtn"),
  appointmentsContainer: document.getElementById("appointmentsContainer"),
  waitlistContainer: document.getElementById("waitlistContainer"),
  opsSummary: document.getElementById("opsSummary"),
  resourceLoadBoard: document.getElementById("resourceLoadBoard"),
  servicePopularity: document.getElementById("servicePopularity"),
  mailboxContainer: document.getElementById("mailboxContainer"),
  themeToggleBtn: document.getElementById("themeToggleBtn"),
  resetDataBtn: document.getElementById("resetDataBtn"),
  exportDataBtn: document.getElementById("exportDataBtn"),
  importDataBtn: document.getElementById("importDataBtn"),
  importFileInput: document.getElementById("importFileInput"),
  rangePills: [...document.querySelectorAll(".range-pill")],
  tabButtons: [...document.querySelectorAll(".tab-btn")],
  tabPanels: [...document.querySelectorAll(".tab-panel")],
  bookingFilterSegment: document.getElementById("bookingFilterSegment"),
  filterButtons: [...document.querySelectorAll(".seg-btn")],
};

// Small DOM helper so dynamic content goes through textContent (no innerHTML
// with user/imported data => no XSS surface).
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function structuredSeed() {
  return JSON.parse(JSON.stringify(seed));
}

function persist(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  channel?.postMessage({ type: "sync" });
}

function buildSeedWithDemoData() {
  const demo = structuredSeed();
  const now = new Date();
  const a1 = nextWeekdayAt(now, 2, 10, 0);
  const a2 = nextWeekdayAt(now, 3, 13, 30);
  const a3 = nextWeekdayAt(now, 4, 9, 0);
  demo.appointments = [
    makeAppointment({
      id: crypto.randomUUID(),
      resourceId: 1,
      serviceId: 2,
      startsAt: a1.start,
      endsAt: addMinutesIso(a1.start, 60),
      occupancyEndsAt: addMinutesIso(a1.start, 75),
      customerName: "Jan Klient",
      customerEmail: "jan@example.com",
      phone: "+48 500 111 222",
      notesCustomer: "Preferuje spokojny pokój.",
      priority: "vip",
      status: "CONFIRMED",
      createdAt: daysAgoIso(2),
    }, demo),
    makeAppointment({
      id: crypto.randomUUID(),
      resourceId: 2,
      serviceId: 3,
      startsAt: a2.start,
      endsAt: addMinutesIso(a2.start, 15),
      occupancyEndsAt: addMinutesIso(a2.start, 20),
      customerName: "Maja Test",
      customerEmail: "maja@example.com",
      phone: "+48 500 222 333",
      notesCustomer: "Tylko szybka kontrola.",
      priority: "normal",
      status: "CONFIRMED",
      createdAt: daysAgoIso(1),
    }, demo),
    makeAppointment({
      id: crypto.randomUUID(),
      resourceId: 3,
      serviceId: 4,
      startsAt: a3.start,
      endsAt: addMinutesIso(a3.start, 45),
      occupancyEndsAt: addMinutesIso(a3.start, 55),
      customerName: "Ola Remote",
      customerEmail: "ola@example.com",
      phone: "+48 500 444 555",
      notesCustomer: "Proszę link do spotkania wcześniej.",
      priority: "urgent",
      status: "CANCELLED",
      cancelledAt: daysAgoIso(1),
      createdAt: daysAgoIso(3),
    }, demo),
  ];
  demo.waitlist = [
    {
      id: crypto.randomUUID(),
      resourceId: 1,
      serviceId: 2,
      customerName: "Basia Kolejka",
      customerEmail: "basia@example.com",
      phone: "+48 500 777 888",
      notesCustomer: "Najlepiej po 16:00.",
      priority: "vip",
      desiredFrom: toDateInputValue(new Date()),
      desiredTo: toDateInputValue(addDays(new Date(), 10)),
      status: "WAITING",
      createdAt: new Date().toISOString(),
    },
  ];
  demo.mailbox = [
    {
      id: crypto.randomUUID(),
      to: "jan@example.com",
      subject: "Potwierdzenie rezerwacji",
      body: "Cześć Jan,\n\nTo jest przykładowe potwierdzenie rezerwacji z demo danych.",
      createdAt: daysAgoIso(2),
    },
  ];
  return demo;
}

function normalizeData(parsed) {
  return {
    services: Array.isArray(parsed.services) && parsed.services.length ? parsed.services : structuredSeed().services,
    resources: Array.isArray(parsed.resources) && parsed.resources.length ? parsed.resources : structuredSeed().resources,
    appointments: Array.isArray(parsed.appointments) ? parsed.appointments : [],
    waitlist: Array.isArray(parsed.waitlist) ? parsed.waitlist : [],
    mailbox: Array.isArray(parsed.mailbox) ? parsed.mailbox : [],
  };
}

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const demo = buildSeedWithDemoData();
    persist(demo);
    return demo;
  }
  try {
    return normalizeData(JSON.parse(raw));
  } catch {
    const demo = buildSeedWithDemoData();
    persist(demo);
    return demo;
  }
}

function refreshStateFromStorage() {
  const data = loadData();
  state.services = data.services;
  state.resources = data.resources;
  state.appointments = data.appointments;
  state.waitlist = data.waitlist;
  state.mailbox = data.mailbox;
  if (!state.services.some((service) => service.id === state.selectedServiceId)) {
    state.selectedServiceId = state.services[0]?.id ?? null;
  }
  if (!state.resources.some((resource) => resource.id === state.selectedResourceId)) {
    state.selectedResourceId = state.resources[0]?.id ?? null;
  }
}

function saveState() {
  persist({
    services: state.services,
    resources: state.resources,
    appointments: state.appointments,
    waitlist: state.waitlist,
    mailbox: state.mailbox,
  });
}

function setDefaultDates(days = 7) {
  const now = new Date();
  const end = addDays(now, days - 1);
  els.fromInput.value = toDateInputValue(now);
  els.toInput.value = toDateInputValue(end);
}

function setTheme(theme) {
  const isLight = theme === "light";
  document.body.classList.toggle("light", isLight);
  localStorage.setItem(THEME_KEY, isLight ? "light" : "dark");
}

function bootTheme() {
  setTheme(localStorage.getItem(THEME_KEY) || "dark");
}

function getSelectedService() {
  return state.services.find((service) => service.id === state.selectedServiceId);
}

function getSelectedResource() {
  return state.resources.find((resource) => resource.id === state.selectedResourceId);
}

function makeAppointment(base, dataset = state) {
  const resource = dataset.resources.find((item) => item.id === base.resourceId);
  const service = dataset.services.find((item) => item.id === base.serviceId);
  return {
    ...base,
    referenceCode: base.referenceCode || makeReferenceCode(),
    resourceName: resource?.name || "Nieznany specjalista",
    serviceName: service?.name || "Nieznana usługa",
    clientTimeZone: base.clientTimeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    updatedAt: new Date().toISOString(),
  };
}

function makeReferenceCode() {
  return `BK-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${String(Date.now()).slice(-4)}`;
}

function announce(message, kind = "muted") {
  els.bookingStatus.textContent = message;
  els.bookingStatus.className = `status-line ${kind}`;
}

function renderServiceCards() {
  els.serviceCards.innerHTML = "";
  const template = document.getElementById("serviceCardTemplate");
  state.services.forEach((service) => {
    const node = template.content.firstElementChild.cloneNode(true);
    const active = service.id === state.selectedServiceId;
    node.classList.toggle("active", active);
    node.setAttribute("aria-pressed", String(active));
    const meta = el("span", "meta-row");
    meta.append(
      el("span", "choice-chip", `${service.price} zł`),
      el("span", "choice-chip", `krok ${service.slotStepMinutes} min`),
    );
    node.append(
      el("span", "title", service.name),
      el("span", "desc", `${service.category} • ${service.durationMinutes} min • po wizycie ${service.bufferAfterMinutes} min bufora`),
      meta,
    );
    node.addEventListener("click", () => {
      state.selectedServiceId = service.id;
      state.selectedSlot = null;
      if (state.rescheduleAppointmentId) syncFormForReschedule();
      rerenderAll();
    });
    els.serviceCards.appendChild(node);
  });
}

function renderResourceCards() {
  els.resourceCards.innerHTML = "";
  const template = document.getElementById("resourceCardTemplate");
  state.resources.forEach((resource) => {
    const node = template.content.firstElementChild.cloneNode(true);
    const active = resource.id === state.selectedResourceId;
    node.classList.toggle("active", active);
    node.setAttribute("aria-pressed", String(active));
    const meta = el("span", "meta-row");
    meta.append(
      el("span", "choice-chip", resource.timeZone),
      el("span", "choice-chip", resource.notes),
    );
    node.append(
      el("span", "title", resource.name),
      el("span", "desc", `${resource.role} • ${resource.locationName}`),
      meta,
    );
    node.addEventListener("click", () => {
      state.selectedResourceId = resource.id;
      state.selectedSlot = null;
      if (state.rescheduleAppointmentId) syncFormForReschedule();
      rerenderAll();
    });
    els.resourceCards.appendChild(node);
  });
}

function renderStats() {
  const stats = [
    {
      label: "Nadchodzące wizyty",
      value: String(state.appointments.filter((appointment) => appointment.status === "CONFIRMED" && new Date(appointment.startsAt) > new Date()).length),
      help: "Potwierdzone w całym demo",
    },
    {
      label: "Dzisiejsze terminy",
      value: String(countTodayAppointments()),
      help: "Do szybkiego ogarnięcia obłożenia",
    },
    {
      label: "Lista oczekujących",
      value: String(state.waitlist.filter((item) => item.status === "WAITING").length),
      help: "Klienci czekający na miejsce",
    },
    {
      label: "Anulacje",
      value: String(state.appointments.filter((appointment) => appointment.status === "CANCELLED").length),
      help: "Historia odwołanych wizyt",
    },
  ];

  els.statsGrid.innerHTML = "";
  const template = document.getElementById("statTemplate");
  stats.forEach((stat) => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.querySelector(".stat-label").textContent = stat.label;
    node.querySelector(".stat-value").textContent = stat.value;
    node.querySelector(".stat-help").textContent = stat.help;
    els.statsGrid.appendChild(node);
  });
}

function countTodayAppointments() {
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return state.appointments.filter((appointment) => {
    if (appointment.status !== "CONFIRMED") return false;
    const start = new Date(appointment.startsAt);
    const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
    return key === todayKey;
  }).length;
}

function renderAvailability() {
  const resource = getSelectedResource();
  const service = getSelectedService();
  els.availabilityBoard.innerHTML = "";

  if (!resource || !service) {
    els.availabilityBoard.appendChild(emptyState("Brakuje specjalisty albo usługi."));
    return;
  }

  const from = new Date(`${els.fromInput.value}T12:00:00`);
  const to = new Date(`${els.toInput.value}T12:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    els.availabilityBoard.appendChild(emptyState("Zakres dat jest niepoprawny."));
    return;
  }

  const grouped = new Map();
  state.availability.forEach((slot) => {
    const list = grouped.get(slot.localDateString) || [];
    list.push(slot);
    grouped.set(slot.localDateString, list);
  });

  const template = document.getElementById("dayColumnTemplate");
  const slotTemplate = document.getElementById("slotTemplate");
  for (let cursor = new Date(from); cursor <= to; cursor.setDate(cursor.getDate() + 1)) {
    const parts = localDatePartsInZone(cursor, resource.timeZone);
    const dayKey = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
    const column = template.content.firstElementChild.cloneNode(true);
    column.querySelector(".day-title").textContent = new Intl.DateTimeFormat("pl-PL", {
      timeZone: resource.timeZone,
      weekday: "long",
      day: "2-digit",
      month: "long",
    }).format(cursor);
    const slots = grouped.get(dayKey) || [];
    const freeCount = slots.filter((slot) => !slot.blocked).length;
    column.querySelector(".day-meta").textContent = `${freeCount} wolnych slotów`;
    const daySlots = column.querySelector(".day-slots");

    if (!slots.length) {
      daySlots.appendChild(emptyState("Brak dostępności albo wszystko zajęte."));
    } else {
      slots.forEach((slot) => {
        const chip = slotTemplate.content.firstElementChild.cloneNode(true);
        const meta = formatSlotMeta(slot.startsAt, resource.timeZone);
        chip.append(
          el("span", "slot-time", meta.time),
          el("span", "slot-meta", `${service.durationMinutes} min`),
        );
        if (slot.blocked) {
          chip.classList.add("blocked");
          chip.disabled = true;
          chip.setAttribute("aria-disabled", "true");
          chip.title = "Termin zajęty";
        } else {
          const selected = state.selectedSlot?.startsAt === slot.startsAt && state.selectedSlot?.resourceId === slot.resourceId;
          chip.classList.toggle("selected", selected);
          chip.setAttribute("aria-pressed", String(selected));
          chip.addEventListener("click", () => selectSlot(slot));
        }
        daySlots.appendChild(chip);
      });
    }
    els.availabilityBoard.appendChild(column);
  }
}

function emptyState(message) {
  return el("div", "empty-state", message);
}

function selectSlot(slot) {
  if (slot.blocked) return;
  state.selectedSlot = slot;
  const resource = getSelectedResource();
  els.selectedSlotLabel.textContent = formatDateRange(slot.startsAt, slot.endsAt, resource?.timeZone);
  els.selectedSlotSubtext.textContent = `Specjalista: ${resource?.name || "-"} • strefa: ${resource?.timeZone || "-"}`;
  renderAvailability();
}

function rerenderAll() {
  refreshStateFromStorage();
  els.clientTimeZoneBadge.textContent = `Twoja strefa: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`;
  renderServiceCards();
  renderResourceCards();
  state.availability = computeAvailability(getSelectedService(), getSelectedResource(), {
    from: els.fromInput.value,
    to: els.toInput.value,
    appointments: state.appointments,
    morningOnly: els.showMorningOnly.checked,
    eveningOnly: els.showEveningOnly.checked,
    excludeAppointmentId: state.rescheduleAppointmentId,
    includeBlocked: true,
  });
  const service = getSelectedService();
  const resource = getSelectedResource();
  els.availabilityMeta.textContent = resource && service
    ? `${resource.name} • ${resource.locationName} • ${resource.timeZone} • ${service.durationMinutes} min`
    : "";
  renderStats();
  renderAvailability();
  renderBookings();
  renderWaitlist();
  renderMailbox();
  renderOpsPanel();
  updateModeBadge();
  syncTabVisibility();
}

function validateBookingForm() {
  const customerName = els.nameInput.value.trim();
  const customerEmail = els.emailInput.value.trim().toLowerCase();
  if (!customerName || !customerEmail) {
    announce("Podaj imię i e-mail.", "muted");
    return null;
  }
  if (!/^\S+@\S+\.\S+$/.test(customerEmail)) {
    announce("E-mail wygląda podejrzanie — popraw go.", "muted");
    return null;
  }
  return {
    customerName,
    customerEmail,
    phone: els.phoneInput.value.trim(),
    notesCustomer: els.notesInput.value.trim(),
    priority: els.prioritySelect.value,
  };
}

function createBooking() {
  if (!state.selectedSlot) {
    announce("Wybierz termin z prawej strony.", "muted");
    return;
  }

  const payload = validateBookingForm();
  if (!payload) return;

  els.bookBtn.disabled = true;
  refreshStateFromStorage();

  const service = getSelectedService();
  const resource = getSelectedResource();
  const latestConflict = state.appointments.some((appointment) => {
    if (appointment.resourceId !== resource.id || appointment.status !== "CONFIRMED") return false;
    return overlaps(
      new Date(state.selectedSlot.startsAt).getTime(),
      new Date(state.selectedSlot.occupancyEndsAt).getTime(),
      new Date(appointment.startsAt).getTime(),
      new Date(appointment.occupancyEndsAt).getTime(),
    );
  });

  if (latestConflict) {
    state.selectedSlot = null;
    els.selectedSlotLabel.textContent = "brak";
    els.selectedSlotSubtext.textContent = "Ten termin właśnie zniknął. Kliknij nowy slot.";
    announce("Ktoś zgarnął ten termin przed Tobą. Odświeżyłem dostępność.", "muted");
    els.bookBtn.disabled = false;
    rerenderAll();
    return;
  }

  const appointment = makeAppointment({
    id: crypto.randomUUID(),
    resourceId: resource.id,
    serviceId: service.id,
    startsAt: state.selectedSlot.startsAt,
    endsAt: state.selectedSlot.endsAt,
    occupancyEndsAt: state.selectedSlot.occupancyEndsAt,
    ...payload,
    status: "CONFIRMED",
    createdAt: new Date().toISOString(),
  });

  state.appointments.push(appointment);
  queueMail({
    to: appointment.customerEmail,
    subject: "Potwierdzenie rezerwacji",
    body: [
      `Cześć ${appointment.customerName},`,
      "",
      "Twoja rezerwacja została potwierdzona.",
      `Usługa: ${appointment.serviceName}`,
      `Specjalista: ${appointment.resourceName}`,
      `Termin: ${formatDateRange(appointment.startsAt, appointment.endsAt, resource.timeZone)}`,
      `Strefa klienta: ${appointment.clientTimeZone}`,
      `Kod rezerwacji: ${appointment.referenceCode}`,
    ].join("\n"),
  });

  saveState();
  els.lookupEmailInput.value = appointment.customerEmail;
  clearSelectionAfterBooking();
  announce(`Gotowe — rezerwacja ${appointment.referenceCode} siedzi w systemie.`, "badge success");
  els.bookBtn.disabled = false;
  rerenderAll();
  setActiveTab("bookings");
}

function rescheduleAppointment() {
  if (!state.rescheduleAppointmentId) return;
  if (!state.selectedSlot) {
    announce("Wybierz nowy termin do przełożenia wizyty.", "muted");
    return;
  }
  const payload = validateBookingForm();
  if (!payload) return;

  refreshStateFromStorage();
  const target = state.appointments.find((appointment) => appointment.id === state.rescheduleAppointmentId);
  if (!target || target.status !== "CONFIRMED") {
    announce("Nie udało się znaleźć aktywnej rezerwacji do przełożenia.", "muted");
    clearRescheduleMode();
    rerenderAll();
    return;
  }

  const resource = getSelectedResource();
  const service = getSelectedService();
  const conflict = state.appointments.some((appointment) => {
    if (appointment.id === target.id || appointment.resourceId !== resource.id || appointment.status !== "CONFIRMED") return false;
    return overlaps(
      new Date(state.selectedSlot.startsAt).getTime(),
      new Date(state.selectedSlot.occupancyEndsAt).getTime(),
      new Date(appointment.startsAt).getTime(),
      new Date(appointment.occupancyEndsAt).getTime(),
    );
  });
  if (conflict) {
    announce("Nowy slot już jest zajęty. Wybierz inny.", "muted");
    rerenderAll();
    return;
  }

  Object.assign(target, makeAppointment({
    ...target,
    resourceId: resource.id,
    serviceId: service.id,
    resourceName: resource.name,
    serviceName: service.name,
    startsAt: state.selectedSlot.startsAt,
    endsAt: state.selectedSlot.endsAt,
    occupancyEndsAt: state.selectedSlot.occupancyEndsAt,
    ...payload,
    rescheduledAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));

  queueMail({
    to: target.customerEmail,
    subject: "Zmiana terminu wizyty",
    body: [
      `Cześć ${target.customerName},`,
      "",
      "Twoja rezerwacja została przełożona.",
      `Nowy termin: ${formatDateRange(target.startsAt, target.endsAt, resource.timeZone)}`,
      `Usługa: ${target.serviceName}`,
      `Specjalista: ${target.resourceName}`,
      `Kod rezerwacji: ${target.referenceCode}`,
    ].join("\n"),
  });

  saveState();
  const targetEmail = target.customerEmail;
  clearRescheduleMode();
  els.lookupEmailInput.value = targetEmail;
  announce(`Wizyta ${target.referenceCode} została przełożona.`, "badge success");
  rerenderAll();
}

function handlePrimaryAction() {
  if (state.rescheduleAppointmentId) {
    rescheduleAppointment();
  } else {
    createBooking();
  }
}

function clearSelectionAfterBooking() {
  state.selectedSlot = null;
  els.selectedSlotLabel.textContent = "brak";
  els.selectedSlotSubtext.textContent = "Wybierz slot z widoku po prawej.";
  els.notesInput.value = "";
}

function startRescheduleMode(appointmentId) {
  refreshStateFromStorage();
  const appointment = state.appointments.find((item) => item.id === appointmentId);
  if (!appointment || appointment.status !== "CONFIRMED") return;

  state.rescheduleAppointmentId = appointment.id;
  state.selectedServiceId = appointment.serviceId;
  state.selectedResourceId = appointment.resourceId;
  els.nameInput.value = appointment.customerName;
  els.emailInput.value = appointment.customerEmail;
  els.phoneInput.value = appointment.phone || "";
  els.prioritySelect.value = appointment.priority || "normal";
  els.notesInput.value = appointment.notesCustomer || "";
  els.lookupEmailInput.value = appointment.customerEmail;

  const appointmentStart = new Date(appointment.startsAt);
  els.fromInput.value = toDateInputValue(appointmentStart);
  els.toInput.value = toDateInputValue(addDays(appointmentStart, 7));
  state.selectedSlot = null;
  announce(`Tryb przełożenia aktywny dla ${appointment.referenceCode}.`, "badge success");
  setActiveTab("bookings");
  rerenderAll();
}

function syncFormForReschedule() {
  if (!state.rescheduleAppointmentId) return;
  const appointment = state.appointments.find((item) => item.id === state.rescheduleAppointmentId);
  if (!appointment) return;
  els.nameInput.value = appointment.customerName;
  els.emailInput.value = appointment.customerEmail;
}

function clearRescheduleMode() {
  state.rescheduleAppointmentId = null;
  state.selectedSlot = null;
  els.selectedSlotLabel.textContent = "brak";
  els.selectedSlotSubtext.textContent = "Wybierz slot z widoku po prawej.";
}

function updateModeBadge() {
  if (state.rescheduleAppointmentId) {
    els.bookingModeBadge.textContent = "Tryb przełożenia";
    els.bookBtn.textContent = "Zapisz nowy termin";
    els.clearModeBtn.classList.remove("hidden");
  } else {
    els.bookingModeBadge.textContent = "Nowa rezerwacja";
    els.bookBtn.textContent = "Zapisz rezerwację";
    els.clearModeBtn.classList.add("hidden");
  }
}

function cancelAppointment(appointmentId) {
  refreshStateFromStorage();
  const appointment = state.appointments.find((item) => item.id === appointmentId);
  if (!appointment || appointment.status === "CANCELLED") return;
  appointment.status = "CANCELLED";
  appointment.cancelledAt = new Date().toISOString();
  appointment.updatedAt = new Date().toISOString();
  queueMail({
    to: appointment.customerEmail,
    subject: "Anulowanie rezerwacji",
    body: [
      `Cześć ${appointment.customerName},`,
      "",
      "Twoja rezerwacja została anulowana.",
      `Usługa: ${appointment.serviceName}`,
      `Specjalista: ${appointment.resourceName}`,
      `Termin: ${formatDateRange(appointment.startsAt, appointment.endsAt)}`,
      `Kod rezerwacji: ${appointment.referenceCode}`,
    ].join("\n"),
  });
  saveState();
  tryPromoteWaitlist(appointment.resourceId, appointment.serviceId);
  if (state.rescheduleAppointmentId === appointment.id) clearRescheduleMode();
  announce(`Anulowano ${appointment.referenceCode}.`, "muted");
  rerenderAll();
}

function queueMail({ to, subject, body }) {
  state.mailbox.push({
    id: crypto.randomUUID(),
    to,
    subject,
    body,
    createdAt: new Date().toISOString(),
  });
}

function addToWaitlist() {
  const payload = validateBookingForm();
  if (!payload) return;
  const service = getSelectedService();
  const resource = getSelectedResource();
  const desiredFrom = els.fromInput.value;
  const desiredTo = els.toInput.value;
  if (!service || !resource || !desiredFrom || !desiredTo) {
    announce("Najpierw ustaw zakres dat i wybierz specjalistę.", "muted");
    return;
  }
  refreshStateFromStorage();
  state.waitlist.push({
    id: crypto.randomUUID(),
    serviceId: service.id,
    resourceId: resource.id,
    ...payload,
    desiredFrom,
    desiredTo,
    status: "WAITING",
    createdAt: new Date().toISOString(),
  });
  queueMail({
    to: payload.customerEmail,
    subject: "Dodanie do listy oczekujących",
    body: [
      `Cześć ${payload.customerName},`,
      "",
      "Dodałem Cię do listy oczekujących.",
      `Usługa: ${service.name}`,
      `Specjalista: ${resource.name}`,
      `Zakres: ${desiredFrom} → ${desiredTo}`,
    ].join("\n"),
  });
  saveState();
  els.lookupEmailInput.value = payload.customerEmail;
  announce("Dodałem klienta do listy oczekujących.", "badge success");
  rerenderAll();
}

function tryPromoteWaitlist(resourceId, serviceId) {
  const waiting = state.waitlist
    .filter((item) => item.status === "WAITING" && item.resourceId === resourceId && item.serviceId === serviceId)
    .sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt));

  for (const entry of waiting) {
    const service = state.services.find((item) => item.id === entry.serviceId);
    const resource = state.resources.find((item) => item.id === entry.resourceId);
    if (!service || !resource) continue;

    const freeSlots = computeAvailability(service, resource, {
      from: entry.desiredFrom,
      to: entry.desiredTo,
      appointments: state.appointments,
    });

    const chosen = freeSlots[0];
    if (!chosen) continue;

    state.appointments.push(makeAppointment({
      id: crypto.randomUUID(),
      resourceId: resource.id,
      serviceId: service.id,
      startsAt: chosen.startsAt,
      endsAt: chosen.endsAt,
      occupancyEndsAt: chosen.occupancyEndsAt,
      customerName: entry.customerName,
      customerEmail: entry.customerEmail,
      phone: entry.phone,
      notesCustomer: `${entry.notesCustomer || ""}\n[auto-promocja z waitlisty]`.trim(),
      priority: entry.priority,
      status: "CONFIRMED",
      createdAt: new Date().toISOString(),
    }));
    entry.status = "PROMOTED";
    entry.promotedAt = new Date().toISOString();
    queueMail({
      to: entry.customerEmail,
      subject: "Zwolnił się termin z listy oczekujących",
      body: [
        `Cześć ${entry.customerName},`,
        "",
        "Wskoczyłeś z listy oczekujących na wolny slot.",
        `Nowy termin: ${formatDateRange(chosen.startsAt, chosen.endsAt, resource.timeZone)}`,
        `Specjalista: ${resource.name}`,
        `Usługa: ${service.name}`,
      ].join("\n"),
    });
    saveState();
    break;
  }
}

function currentCustomerAppointments() {
  const email = els.lookupEmailInput.value.trim().toLowerCase();
  if (!email) return [];
  let items = state.appointments.filter((appointment) => appointment.customerEmail.toLowerCase() === email);
  if (state.bookingFilter === "upcoming") {
    items = items.filter((appointment) => appointment.status === "CONFIRMED" && new Date(appointment.startsAt) >= new Date());
  }
  if (state.bookingFilter === "cancelled") {
    items = items.filter((appointment) => appointment.status === "CANCELLED");
  }
  return items.sort((left, right) => new Date(right.startsAt) - new Date(left.startsAt));
}

function renderBookings() {
  const items = currentCustomerAppointments();
  els.appointmentsContainer.innerHTML = "";
  if (!els.lookupEmailInput.value.trim()) {
    els.appointmentsContainer.appendChild(emptyState("Wpisz e-mail i kliknij pobierz, żeby zobaczyć swoje rezerwacje."));
    return;
  }
  if (!items.length) {
    els.appointmentsContainer.appendChild(emptyState("Brak pasujących rezerwacji dla tego filtra."));
    return;
  }

  const template = document.getElementById("bookingTemplate");
  items.forEach((item) => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.querySelector(".appointment-title").textContent = `${item.serviceName} — ${item.resourceName}`;
    node.querySelector(".appointment-ref").textContent = item.referenceCode;
    node.querySelector(".appointment-meta").textContent = formatDateRange(item.startsAt, item.endsAt);
    node.querySelector(".appointment-extra").textContent = `${item.priority?.toUpperCase() || "NORMAL"} • ${item.phone || "brak telefonu"} • klient TZ ${item.clientTimeZone}`;
    node.querySelector(".appointment-notes").textContent = item.notesCustomer || "Brak notatki.";
    const status = node.querySelector(".appointment-status");
    status.textContent = item.status;
    status.classList.add(item.status.toLowerCase());

    const rescheduleBtn = node.querySelector(".reschedule-btn");
    const cancelBtn = node.querySelector(".cancel-btn");
    if (item.status !== "CONFIRMED") {
      rescheduleBtn.disabled = true;
      cancelBtn.disabled = true;
      cancelBtn.textContent = "Zamknięte";
    } else {
      rescheduleBtn.addEventListener("click", () => startRescheduleMode(item.id));
      cancelBtn.addEventListener("click", () => cancelAppointment(item.id));
    }
    els.appointmentsContainer.appendChild(node);
  });
}

function renderWaitlist() {
  els.waitlistContainer.innerHTML = "";
  const lookup = els.lookupEmailInput.value.trim().toLowerCase();
  let items = state.waitlist;
  if (lookup) items = items.filter((item) => item.customerEmail.toLowerCase() === lookup);
  if (!items.length) {
    els.waitlistContainer.appendChild(emptyState("Brak wpisów na liście oczekujących."));
    return;
  }
  const template = document.getElementById("waitlistTemplate");
  [...items].sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt)).forEach((item) => {
    const node = template.content.firstElementChild.cloneNode(true);
    const service = state.services.find((serviceItem) => serviceItem.id === item.serviceId);
    const resource = state.resources.find((resourceItem) => resourceItem.id === item.resourceId);
    node.querySelector(".appointment-title").textContent = `${service?.name || "Usługa"} — ${resource?.name || "Specjalista"}`;
    node.querySelector(".appointment-meta").textContent = `Zakres: ${item.desiredFrom} → ${item.desiredTo}`;
    node.querySelector(".appointment-notes").textContent = `${item.customerName} • ${item.priority?.toUpperCase() || "NORMAL"} • ${item.notesCustomer || "Brak notatki"}`;
    const status = node.querySelector(".appointment-status");
    status.textContent = item.status;
    status.classList.add("pending");
    els.waitlistContainer.appendChild(node);
  });
}

function renderMailbox() {
  els.mailboxContainer.innerHTML = "";
  if (!state.mailbox.length) {
    els.mailboxContainer.appendChild(emptyState("Jeszcze nic nie wpadło do outboxa."));
    return;
  }
  const template = document.getElementById("mailTemplate");
  [...state.mailbox].reverse().forEach((mail) => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.querySelector(".mail-subject").textContent = mail.subject;
    node.querySelector(".mail-to").textContent = `Do: ${mail.to}`;
    node.querySelector(".mail-time").textContent = new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(mail.createdAt));
    node.querySelector(".mail-body").textContent = mail.body;
    els.mailboxContainer.appendChild(node);
  });
}

function renderOpsPanel() {
  renderOpsSummary();
  renderResourceLoadBoard();
  renderServicePopularity();
}

function renderOpsSummary() {
  const upcoming = state.appointments.filter((appointment) => appointment.status === "CONFIRMED" && new Date(appointment.startsAt) > new Date());
  const today = countTodayAppointments();
  const totalRevenue = upcoming.reduce((sum, appointment) => {
    const service = state.services.find((item) => item.id === appointment.serviceId);
    return sum + (service?.price || 0);
  }, 0);
  const urgent = upcoming.filter((appointment) => appointment.priority === "urgent").length;
  const tiles = [
    ["Na dziś", today, "aktywnych terminów"],
    ["Przychód demo", `${totalRevenue} zł`, "z nadchodzących wizyt"],
    ["Pilne wizyty", urgent, "oznaczone jako urgent"],
    ["Aktywni specjaliści", state.resources.length, "w grafiku"],
  ];
  els.opsSummary.innerHTML = "";
  tiles.forEach(([label, value, help]) => {
    const tile = el("article", "ops-tile");
    tile.append(
      el("span", "muted", label),
      el("strong", null, String(value)),
      el("p", "muted small", help),
    );
    els.opsSummary.appendChild(tile);
  });
}

function renderResourceLoadBoard() {
  els.resourceLoadBoard.innerHTML = "";
  const service = getSelectedService();
  state.resources.forEach((resource) => {
    const free = computeAvailability(service, resource, {
      from: els.fromInput.value,
      to: els.toInput.value,
      appointments: state.appointments,
    }).length;
    const booked = state.appointments.filter((appointment) => appointment.resourceId === resource.id && appointment.status === "CONFIRMED").length;
    const total = free + booked;
    const fillPercent = total ? Math.round((booked / total) * 100) : 0;

    const row = el("article", "load-row");
    const main = el("div", "load-main");
    main.append(
      el("strong", null, resource.name),
      el("p", "muted small", `${resource.role} • ${resource.timeZone} • ${booked} aktywnych wizyt`),
    );
    const track = el("div", "load-bar-track");
    const fill = el("div", "load-bar-fill");
    fill.style.width = `${fillPercent}%`;
    track.appendChild(fill);
    main.appendChild(track);

    const side = el("div");
    side.append(el("strong", null, `${fillPercent}%`), el("p", "muted small", "obłożenia"));

    row.append(main, side);
    els.resourceLoadBoard.appendChild(row);
  });
}

function renderServicePopularity() {
  els.servicePopularity.innerHTML = "";
  const counts = state.services.map((service) => ({
    service,
    count: state.appointments.filter((appointment) => appointment.serviceId === service.id && appointment.status === "CONFIRMED").length,
  }));
  const max = Math.max(1, ...counts.map((item) => item.count));
  counts.forEach(({ service, count }) => {
    const row = el("div", "bar-item");
    const track = el("div", "bar-track");
    const fill = el("div", "bar-fill");
    fill.style.width = `${Math.round((count / max) * 100)}%`;
    track.appendChild(fill);
    row.append(el("strong", null, service.name), track, el("span", "muted", String(count)));
    els.servicePopularity.appendChild(row);
  });
}

function setActiveTab(tab) {
  state.activeTab = tab;
  syncTabVisibility();
}

function syncTabVisibility() {
  els.tabButtons.forEach((button) => {
    const active = button.dataset.tab === state.activeTab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  });
  els.tabPanels.forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === state.activeTab));
}

function loadMyBookings() {
  if (!els.lookupEmailInput.value.trim()) {
    announce("Wpisz e-mail, żeby pobrać wizyty.", "muted");
    renderBookings();
    renderWaitlist();
    return;
  }
  announce("Pobrałem rezerwacje dla podanego adresu.", "muted");
  renderBookings();
  renderWaitlist();
}

function exportData() {
  const payload = {
    exportedAt: new Date().toISOString(),
    data: {
      services: state.services,
      resources: state.resources,
      appointments: state.appointments,
      waitlist: state.waitlist,
      mailbox: state.mailbox,
    },
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `bookingflow-export-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      const source = parsed && typeof parsed === "object" && parsed.data ? parsed.data : parsed;
      if (!source || typeof source !== "object") throw new Error("Nieprawidłowa struktura");
      persist(normalizeData(source));
      clearRescheduleMode();
      announce("Zaimportowałem dane z pliku JSON.", "badge success");
      rerenderAll();
    } catch {
      announce("Nie udało się wczytać pliku — to nie jest poprawny JSON eksportu.", "muted");
    }
  };
  reader.onerror = () => announce("Nie udało się odczytać pliku.", "muted");
  reader.readAsText(file);
}

function resetAllData() {
  if (!confirm("Na pewno chcesz zresetować całe demo?")) return;
  const demo = buildSeedWithDemoData();
  persist(demo);
  clearRescheduleMode();
  announce("Demo zresetowane.", "muted");
  rerenderAll();
}

function bindEvents() {
  els.loadSlotsBtn.addEventListener("click", () => {
    state.selectedSlot = null;
    announce("Przeliczyłem dostępność.", "muted");
    rerenderAll();
  });
  els.bookingForm.addEventListener("submit", (event) => {
    event.preventDefault();
    handlePrimaryAction();
  });
  els.waitlistBtn.addEventListener("click", addToWaitlist);
  els.clearModeBtn.addEventListener("click", () => {
    clearRescheduleMode();
    announce("Wyszedłem z trybu przełożenia.", "muted");
    rerenderAll();
  });
  els.loadMyBookingsBtn.addEventListener("click", loadMyBookings);
  els.themeToggleBtn.addEventListener("click", () => setTheme(document.body.classList.contains("light") ? "dark" : "light"));
  els.resetDataBtn.addEventListener("click", resetAllData);
  els.exportDataBtn.addEventListener("click", exportData);
  els.importDataBtn.addEventListener("click", () => els.importFileInput.click());
  els.importFileInput.addEventListener("change", (event) => {
    const [file] = event.target.files;
    if (file) importData(file);
    event.target.value = "";
  });
  els.rangePills.forEach((button) => {
    button.addEventListener("click", () => {
      els.rangePills.forEach((item) => {
        item.classList.remove("active");
        item.setAttribute("aria-pressed", "false");
      });
      button.classList.add("active");
      button.setAttribute("aria-pressed", "true");
      setDefaultDates(Number(button.dataset.range || 7));
      rerenderAll();
    });
  });
  els.filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.bookingFilter = button.dataset.filter;
      els.filterButtons.forEach((item) => {
        const active = item === button;
        item.classList.toggle("active", active);
        item.setAttribute("aria-pressed", String(active));
      });
      renderBookings();
    });
  });
  els.tabButtons.forEach((button, index) => {
    button.addEventListener("click", () => setActiveTab(button.dataset.tab));
    button.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const next = els.tabButtons[(index + direction + els.tabButtons.length) % els.tabButtons.length];
      next.focus();
      setActiveTab(next.dataset.tab);
    });
  });
  [els.fromInput, els.toInput, els.showMorningOnly, els.showEveningOnly].forEach((element) => {
    element.addEventListener("change", () => {
      if (els.showMorningOnly.checked && els.showEveningOnly.checked) {
        if (element === els.showMorningOnly) els.showEveningOnly.checked = false;
        if (element === els.showEveningOnly) els.showMorningOnly.checked = false;
      }
      rerenderAll();
    });
  });
  channel?.addEventListener("message", () => {
    refreshStateFromStorage();
    rerenderAll();
  });
}

function bootstrap() {
  bootTheme();
  refreshStateFromStorage();
  setDefaultDates(7);
  bindEvents();
  els.emailInput.value = "pawel@example.com";
  els.nameInput.value = "Paweł Kowalski";
  announce("Aplikacja gotowa. Wybierz usługę i kliknij slot.", "muted");
  rerenderAll();
}

bootstrap();
