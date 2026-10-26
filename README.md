# BookingFlow Studio

Przeglądarkowe demo systemu rezerwacji wizyt — **bez backendu**, całość trzyma się
w `localStorage`, a przy awarii zapisu działa jawny tryb pamięciowy. Projekt portfolio pokazujący pracę ze stref­ami czasowymi,
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

## Zrzuty ekranu

Zrzuty są robione automatycznie przeglądarką sterowaną skryptem, na aplikacji
serwowanej po HTTP — to stan z tego commita, nie makieta. Rezerwacja na
zrzucie `rezerwacja.png` została faktycznie założona przez interfejs.

### Tygodniowa dostępność
![Dostępność](docs/screenshots/sloty.png)

### Rezerwacja założona przez interfejs
![Rezerwacja](docs/screenshots/rezerwacja.png)

### Panel operacyjny
![Panel operacyjny](docs/screenshots/panel-operacyjny.png)

### Powiadomienia (symulowany outbox)
![Powiadomienia](docs/screenshots/powiadomienia.png)

### Motyw jasny
![Motyw jasny](docs/screenshots/motyw-jasny.png)

### Widok mobilny
![Widok mobilny](docs/screenshots/mobile.png)

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

## Testy i CI

Czysta logika (daty, strefy czasowe, silnik dostępności) jest wydzielona do
modułów bez zależności od DOM i pokryta testami jednostkowymi (Vitest).

```bash
npm ci
npm test          # logika dat/dostępności i rzeczywisty bootstrap w JSDOM
npm audit         # bieżący wynik bazy advisory; nie stała gwarancja
```

`.github/workflows/ci.yml` uruchamia na każdej gałęzi dwa zadania:

| Zadanie | Co robi |
|---|---|
| Testy jednostkowe | `npm ci` → testy Vitest/JSDOM → `npm audit --audit-level=high` |
| Składnia modułów | `node --check` na `app.js`, `availability.js`, `dateUtils.js`, `storage.js` |

Testy `tests/app.test.js` uruchamiają rzeczywisty `app.js` i szablony z `index.html`
w JSDOM. Sprawdzają start, zapis/odczyt, import oraz awarie storage. To regresje
logiki DOM — nie dowód wyglądu ani pełny test prawdziwej przeglądarki. Osobne
Playwright E2E nadal weryfikują ścieżkę rezerwacji i dostępność UI.
Kontrola składni obejmuje dodatkowo wszystkie moduły publikowane przez Pages.

Zachowanie krytyczne (blokada konfliktów) zostało natomiast sprawdzone ręcznie
na działającej aplikacji: rezerwacja slotu 09:00 przy usłudze 30 min z 10 min
bufora zablokowała sloty 09:00, 09:15 i 09:30 — dokładnie tak, jak powinna.


## Struktura

| Plik             | Odpowiedzialność                                              |
| ---------------- | ------------------------------------------------------------ |
| `index.html`     | Szkielet UI + szablony `<template>`                          |
| `styles.css`     | Style, motywy, responsywność, focus/`prefers-reduced-motion` |
| `dateUtils.js`   | Czyste helpery dat i stref czasowych (testowalne)           |
| `availability.js`| Czysty silnik dostępności slotów (testowalny)               |
| `app.js`         | Stan, render i obsługa zdarzeń (warstwa DOM)                |
| `storage.js`     | Walidacja zapisu, tryb pamięciowy i zachowanie oryginału     |
| `tests/`         | Testy jednostkowe Vitest                                     |

## Decyzje projektowe

- **Brak backendu** — celem jest demo logiki front-endu; dane żyją w `localStorage`,
  a maile lądują w symulowanym outboxie.
- **Czysta logika oddzielona od DOM** — `dateUtils.js` i `availability.js` nie dotykają
  `window`/`document`, dzięki czemu silnik slotów można testować w Node.
- **Renderowanie przez `textContent`/`<template>`** zamiast wstrzykiwania HTML, żeby
  zaimportowany JSON nie mógł wprowadzić treści wykonywalnej (brak powierzchni XSS).

## Wdrożenie

`.github/workflows/pages.yml` publikuje aplikację na GitHub Pages po każdym
pushu do `main`. Nie ma kroku budowania — publikowane są wprost pliki, które
pobiera przeglądarka (`index.html`, `styles.css` i cztery moduły). Reszta
repozytorium (`package.json`, testy, konfiguracja) zostaje na miejscu: dla
odwiedzającego nie ma z niej pożytku.

> **Wymaga jednorazowego kroku ręcznego:** w Settings → Pages źródło trzeba
> przestawić na **GitHub Actions**. Tego nie da się zrobić z poziomu kodu.

## Licencja

MIT — patrz [LICENSE](LICENSE).

## Weryfikacja środowiska — 2026-10-17

`npm test`: 23 testy PASS. Nowy test Chromium w `e2e/` sprawdza wybór terminu, rezerwację, wyszukanie po e-mailu, trwałość po odświeżeniu i anulowanie. CI uruchamia go bez backendu. Audyt npm po aktualizacji lockfile nie zgłosił podatności (stan z daty weryfikacji).

To demo lokalne, a nie współdzielony system rezerwacji. E-mail jest filtrem lokalnych danych, nie uwierzytelnieniem. Nie wpisuj rzeczywistych danych klientów do publicznego stanowiska demo. Wdrożenia hostingu nie sprawdzono; aktualizacja i rollback obejmują statyczne pliki, bez usuwania localStorage użytkownika.


### Testy przeglądarkowe

Po zainstalowaniu zależności aplikacji i zbudowaniu frontendu zgodnie z README / workflow `browser.yml` (lub jobem browser w `ci.yml`):

```bash
python -m venv .venv-e2e
# Aktywuj ten venv przed dalszymi poleceniami.
python -m pip install -r e2e/requirements.txt
python -m playwright install chromium
python -m pytest -q e2e
```

Na Linux może być potrzebne `python -m playwright install --with-deps chromium` z uprawnieniami administratora. Alternatywnie `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` wskazuje istniejący Chromium. Testy uruchamiają i zatrzymują własny serwer, używają nowego kontekstu przeglądarki i zapisują logi w ignorowanym `e2e/artifacts/`. Pełny backend musi mieć zainstalowane swoje zależności; `E2E_API_PYTHON` jest opcjonalnym wyborem jego interpretera w AutoDesk/BankGuard. Testy nie uruchamiają wdrożenia.

## Walidacja etapu 2 — 2026-10-18

E2E obejmuje teraz rezerwację, reload, zmianę terminu, eksport JSON, reset własnego stanu testowego, import i anulowanie. Osobny test sprawdza klawiaturę zakładek i przełącznika motywu, układ 390 px oraz axe WCAG 2 A/AA i 2.1 AA w jasnym/ciemnym motywie. `npm ci`, 23 regresje, 2 E2E oraz audit 0 potwierdzono lokalnie. Testy używają izolowanego profilu przeglądarki; nie czyszczą danych użytkownika. Zakres to lokalne demo rezerwacji, bez synchronizacji między urządzeniami.

## Odporność danych i zmiana czasu — 2026-10-25

Uszkodzony JSON, nieobsługiwana struktura i brak dostępu do pamięci przeglądarki
nie powodują już nadpisania wcześniejszych danych seedem ani przerwania startu.
Widoczny panel opisuje tryb pamięciowy. W tym trybie zmiany przetrwają kolejne
operacje UI, ale nie zamknięcie karty; **Eksport JSON** zapisuje bieżącą sesję do
pliku. Import jest walidowany przed zmianą danych i nie usuwa uszkodzonego
oryginału.

- **Pobierz oryginalny zapis** pobiera dokładnie odczytane bajty jako tekst,
  również gdy nie są prawidłowym JSON-em.
- **Ponów zapis danych** wymaga potwierdzenia. Dla uszkodzonego źródła najpierw
  zapisuje dokładną kopię pod oddzielnym kluczem `bookingflow-studio-v1:recovery:*`.
  Nie zastępuje istniejącej kopii; błąd kopii lub zmiana zapisu przez inną kartę
  blokuje nadpisanie. Pobrany eksport pozostaje zalecaną kopią poza przeglądarką.
- **Wczytaj zapis ponownie** wymaga potwierdzenia utraty niezapisanych zmian tej
  sesji. Użyj go po przywróceniu uprawnień; przy nieudanym początkowym odczycie
  aplikacja nie pozwala zapisać danych na nieznanym wcześniejszym zapisie.

Dla `Europe/Warsaw` i `Europe/London` nieistniejące godziny wiosenne nie tworzą
slotów. Przy powtórzonej godzinie jesiennej wybierane jest **pierwsze wystąpienie**;
termin pokazuje offset GMT. Odrzucane są przedziały przecinające zmianę zegara,
jeżeli ich rzeczywisty czas trwania nie odpowiada usłudze. Nie oferujemy dwóch
identycznie opisanych godzin ani wizyt dłuższych/krótszych od deklaracji.

Vitest/JSDOM i audyt zależności wykonuje się na Node 24 (minimum 24.15.0 dla
obecnego jsdom). Wynik obecnego wdrożenia Pages i prawdziwego browser E2E trzeba
potwierdzić osobno; przejście JSDOM nie zastępuje tych bramek.
