# BookingFlow Studio

Przeglądarkowe demo systemu rezerwacji wizyt — **bez backendu**, całość trzyma się
w `localStorage`. Projekt portfolio pokazujący pracę ze stref­ami czasowymi,
generowaniem slotów, blokadą konfliktów i prostą warstwą „operacyjną".

## Funkcje

- **Generowanie slotów** na podstawie godzin pracy specjalisty, przerw, kroku
  czasowego usługi i bufora po wizycie.
- **Strefy czasowe** liczone przez `Intl.DateTimeFormat` (specjaliści w `Europe/Warsaw`
  i `Europe/London`, klient widzi własną strefę).
- **Blokada konfliktów** — zajęte terminy są pokazywane jako wyszarzone i nieklikalne.
- **Rezerwacja, przełożenie i anulowanie** wizyt z symulacją maili (outbox).
- **Lista oczekujących** z auto-promocją na pierwszy zwolniony slot.
- **Panel operacyjny** — obłożenie specjalistów, popularność usług, przychód demo.
- **Eksport / import JSON**, reset danych, motyw jasny/ciemny, sync między kartami
  przez `BroadcastChannel`.

## Uruchomienie

Aplikacja używa modułów ES (`<script type="module">`), więc trzeba ją serwować
po HTTP (otwarcie `index.html` przez `file://` zablokuje import modułów).

```bash
# dowolny statyczny serwer, np.:
npx serve .
# albo
python3 -m http.server 8000
```

Następnie otwórz `http://localhost:8000`.

## Testy

Czysta logika (daty, strefy czasowe, silnik dostępności) jest wydzielona do
modułów bez zależności od DOM i pokryta testami jednostkowymi (Vitest).

```bash
npm install
npm test
```

## Struktura

| Plik             | Odpowiedzialność                                              |
| ---------------- | ------------------------------------------------------------ |
| `index.html`     | Szkielet UI + szablony `<template>`                          |
| `styles.css`     | Style, motywy, responsywność, focus/`prefers-reduced-motion` |
| `dateUtils.js`   | Czyste helpery dat i stref czasowych (testowalne)           |
| `availability.js`| Czysty silnik dostępności slotów (testowalny)               |
| `app.js`         | Stan, render i obsługa zdarzeń (warstwa DOM)                |
| `tests/`         | Testy jednostkowe Vitest                                     |

## Decyzje projektowe

- **Brak backendu** — celem jest demo logiki front-endu; dane żyją w `localStorage`,
  a maile lądują w symulowanym outboxie.
- **Czysta logika oddzielona od DOM** — `dateUtils.js` i `availability.js` nie dotykają
  `window`/`document`, dzięki czemu silnik slotów można testować w Node.
- **Renderowanie przez `textContent`/`<template>`** zamiast wstrzykiwania HTML, żeby
  zaimportowany JSON nie mógł wprowadzić treści wykonywalnej (brak powierzchni XSS).
