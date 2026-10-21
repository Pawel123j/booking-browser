import re
from pathlib import Path
from playwright.sync_api import expect
from browser_support import browser, static_site, application

REPO = Path(__file__).resolve().parents[1]

def test_booking_create_reschedule_backup_restore_cancel(tmp_path):
    with static_site(REPO) as url,browser() as b:
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
        page.locator('.slot-chip:not([disabled])').nth(1).click()
        page.locator('#bookBtn').click()
        page.locator('#loadMyBookingsBtn').click()
        expect(page.locator('.cancel-btn')).to_have_count(1)
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


def test_accessibility_keyboard_tabs_and_mobile():
    from accessibility import assert_accessible
    with static_site(REPO) as url, browser() as b:
        page = b.new_page(viewport={'width':390, 'height':844})
        page.goto(url)
        assert_accessible(page, REPO, 'booking-light')
        page.locator('#tab-bookings').focus()
        page.keyboard.press('ArrowRight')
        expect(page.locator('#tab-ops')).to_be_focused()
        expect(page.locator('#tab-ops')).to_have_attribute('aria-selected', 'true')
        page.locator('#themeToggleBtn').focus()
        page.keyboard.press('Enter')
        assert_accessible(page, REPO, 'booking-dark')
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
