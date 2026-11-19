import re
import subprocess
import pytest
from pathlib import Path
from playwright.sync_api import expect
from browser_support import browser, static_site, application

REPO = Path(__file__).resolve().parents[1]

@pytest.fixture(scope="session", autouse=True)
def published_artifact():
    subprocess.run(["npm", "run", "build"], cwd=REPO, check=True)


def test_booking_create_reschedule_backup_restore_cancel(tmp_path):
    with static_site(REPO / "_site") as url,browser() as b:
        page=b.new_page(viewport={'width':1280,'height':900})
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(url)
        page.locator('.slot-chip:not([disabled])').first.click()
        page.locator('#nameInput').fill('Browser Customer')
        page.locator('#emailInput').fill('browser@example.test')
        page.locator('#phoneInput').fill('+48500600700')
        page.get_by_role('button',name='Zapisz rezerwację',exact=True).click()
        page.locator('#lookupEmailInput').fill('browser@example.test')
        page.locator('#loadMyBookingsBtn').click()
        expect(page.locator('.cancel-btn')).to_have_count(1)
        page.reload()
        page.locator('#lookupEmailInput').fill('browser@example.test')
        page.locator('#loadMyBookingsBtn').click()
        expect(page.locator('.cancel-btn')).to_have_count(1)
        page.on('dialog',lambda d:d.accept())
        page.locator('.reschedule-btn').click()
        page.locator('.day-column:not(.inactive-day) .slot-chip:not([disabled])').nth(1).click()
        page.locator('#bookBtn').click()
        page.locator('#loadMyBookingsBtn').click()
        expect(page.locator('.cancel-btn')).to_have_count(1)
        page.get_by_text('Narzędzia danych', exact=True).click()
        before_invalid_import = page.evaluate("localStorage.getItem('bookingflow-studio-v1')")
        invalid = tmp_path / 'invalid-booking.json'
        invalid.write_text('{"services":[null]}')
        page.locator('#importFileInput').set_input_files(invalid)
        expect(page.locator('#bookingStatus')).to_contain_text('Import odrzucony')
        assert page.evaluate("localStorage.getItem('bookingflow-studio-v1')") == before_invalid_import
        with page.expect_download() as backup:
            page.locator('#exportDataBtn').click()
        export = tmp_path / 'bookings.json'
        backup.value.save_as(export)
        page.locator('#resetDataBtn').click()
        page.locator('#lookupEmailInput').fill('browser@example.test')
        page.locator('#loadMyBookingsBtn').click()
        expect(page.locator('.cancel-btn')).to_have_count(0)
        page.locator('#importFileInput').set_input_files(export)
        page.locator('#lookupEmailInput').fill('browser@example.test')
        page.locator('#loadMyBookingsBtn').click()
        expect(page.locator('.cancel-btn')).to_have_count(1)
        page.locator('.cancel-btn').click()
        expect(page.locator('.cancel-btn:not([disabled])')).to_have_count(0)
        assert not errors,errors


def test_storage_quota_keeps_booking_usable_in_memory():
    with static_site(REPO / "_site") as url, browser() as b:
        page=b.new_page(viewport={'width':390,'height':844})
        page.add_init_script("""(() => { const original = Storage.prototype.setItem; window.__restoreSetItem = () => { Storage.prototype.setItem = original; }; Storage.prototype.setItem = function(key, value) { if (key === 'bookingflow-studio-v1') throw new DOMException('Full', 'QuotaExceededError'); return original.call(this, key, value); }; })();""")
        page.goto(url)
        page.locator('.slot-chip:not([disabled])').first.click()
        page.locator('#nameInput').fill('Memory Customer')
        page.locator('#emailInput').fill('memory@example.test')
        page.locator('#phoneInput').fill('+48500600700')
        page.get_by_role('button',name='Zapisz rezerwację',exact=True).click()
        expect(page.locator('#storageStatus')).to_contain_text('Nie zapisano zmian')
        page.evaluate("window.__restoreSetItem()")
        page.get_by_role('button',name='Ponów zapis',exact=True).click()
        expect(page.locator('#storageStatus')).to_have_text('')
        assert page.evaluate("JSON.parse(localStorage.getItem('bookingflow-studio-v1')).appointments.some(item => item.customerEmail === 'memory@example.test')")


def test_accessibility_keyboard_tabs_and_mobile():
    from accessibility import assert_accessible
    with static_site(REPO / "_site") as url, browser() as b:
        page = b.new_page(viewport={'width':390, 'height':844})
        page.goto(url)
        page.screenshot(path=str(REPO / 'docs' / 'screenshots' / 'mobile.png'))
        assert_accessible(page, REPO, 'booking-light')
        page.locator('#tab-bookings').focus()
        page.keyboard.press('ArrowRight')
        expect(page.locator('#tab-ops')).to_be_focused()
        expect(page.locator('#tab-ops')).to_have_attribute('aria-selected', 'true')
        page.locator('#themeToggleBtn').focus()
        page.keyboard.press('Enter')
        assert_accessible(page, REPO, 'booking-dark')
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
