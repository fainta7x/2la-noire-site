"""Exercise the built site while the results API is delayed or unavailable."""
from collections import Counter
from functools import partial
from http.server import ThreadingHTTPServer
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import threading
import time

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('checks', ROOT / 'scripts/test-pages.py')
checks = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checks)

HISTORY = {'evenings': [
    {'starts_at': f'2026-11-{day:02d}T19:00:00+03:00', 'format': 'CASUAL', 'games': 3, 'players': 10,
     'image': '/img/favicon.png'} for day in range(13, 6, -1)
]}

def run(browser_type, origin):
    with browser_type.launch() as browser:
        context = browser.new_context(viewport={'width': 390, 'height': 844})
        context.add_init_script(checks.INIT)
        context.route('**/mc.yandex.ru/**', lambda route: route.abort())
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        delayed = []
        page.route('**/api/public/welcome/rating', lambda route: delayed.append(route))
        page.goto(origin + 'rating/', wait_until='domcontentloaded')
        expect(page.locator('#rating-controls')).to_be_visible()
        expect(page.locator('#rating-count')).to_have_text('Всего игроков: 7')
        # A cold visitor can search before ANY rating API response arrives.
        page.get_by_role('button', name='Показать всех игроков (7)').click()
        search = page.get_by_role('searchbox', name='Найти игрока')
        search.fill('Игрок 7')
        expect(page.locator('#rating-count')).to_have_text('Найдено: 1 из 7')
        page.wait_for_function('true')  # Drain pending route callbacks.
        assert len(delayed) == 1
        page.evaluate("window.club.read('/rating'); window.club.read('/rating')")
        assert len(delayed) == 1, 'Concurrent consumers issued duplicate API requests'
        updated = [dict(player, elo=1700 if player['place'] == 7 else player['elo']) for player in checks.PLAYERS]
        delayed.pop().fulfill(json={'players': updated})
        expect(page.get_by_role('row', name='7 Игрок 7 1700 7')).to_be_visible()
        expect(search).to_have_value('Игрок 7')
        search.fill('')
        expect(page.locator('#rating-board tbody tr:visible')).to_have_count(7)
        # Last successful data survives a new document without waiting again.
        page.reload(wait_until='domcontentloaded')
        expect(page.locator('#rating-count')).to_have_text('Всего игроков: 7')
        assert not delayed, 'A fresh browser cache unexpectedly requested the API'
        page.unroute('**/api/public/welcome/rating')

        delayed_history = []
        page.route('**/api/public/welcome/history', lambda route: delayed_history.append(route))
        page.goto(origin + 'klubnye-igry/', wait_until='domcontentloaded')
        expect(page.locator('#evening-history .result-block')).to_have_count(7)
        expect(page.locator('[data-results-for="evening-history"]')).to_be_hidden()
        blocks = page.locator('#evening-history .result-block')
        blocks.first.locator('summary').click()
        blocks.nth(1).locator('summary').click()
        summary = blocks.nth(1).locator('summary').inner_text()
        new_history = {'evenings': [dict(item, games=4) for item in HISTORY['evenings']]}
        assert len(delayed_history) == 1
        delayed_history.pop().fulfill(json=new_history)
        expect(page.locator('#evening-history')).to_contain_text('Игр: 4')
        expect(blocks.first).not_to_have_attribute('open', '')
        expect(blocks.nth(1)).to_have_attribute('open', '')
        expect(page.get_by_text(summary, exact=True)).to_be_focused()
        assert page.evaluate('document.documentElement.scrollWidth') <= 390
        page.unroute('**/api/public/welcome/history')

        # Authentication, availability and custom/authenticated requests are never cached.
        session_requests = []
        page.route('**/api/public/welcome/session', lambda route: (session_requests.append(route.request.headers), route.fulfill(json={'signed_in': False})))
        page.evaluate("async () => { await window.club.read('/session', {credentials:'include'}); await window.club.read('/session', {credentials:'include'}); }")
        assert len(session_requests) == 2
        custom = []
        page.route('**/api/public/welcome/rating', lambda route: (custom.append(1), route.fulfill(json={'players': [{'nickname': 'private-fixture'}]})))
        page.evaluate("window.club.read('/rating', {headers: {'X-Test': 'private-fixture'}})")
        assert len(custom) == 1
        saved = page.evaluate("Object.fromEntries(Object.keys(localStorage).filter(key => key.startsWith('club_public_v1:')).map(key => [key,localStorage.getItem(key)]))")
        assert set(saved) <= {'club_public_v1:/rating', 'club_public_v1:/history', 'club_public_v1:/seasons', 'club_public_v1:/tournaments'}
        assert 'private-fixture' not in json.dumps(saved)
        assert not errors, errors
        context.close()

        # Hover/focus starts a result request before navigation; the destination reuses it.
        context = browser.new_context()
        context.add_init_script(checks.INIT)
        context.route('**/mc.yandex.ru/**', lambda route: route.abort())
        context.route('**/api/public/welcome/seasons', lambda route: route.fulfill(json={'seasons': [{'title': 'Сезон', 'image': '/img/favicon.png'}]}))
        page = context.new_page()
        prefetched = []
        page.route('**/api/public/welcome/rating', lambda route: prefetched.append(route))
        page.goto(origin + 'club/', wait_until='domcontentloaded')
        page.wait_for_function("Boolean(localStorage.getItem('club_public_v1:/seasons'))")
        page.get_by_role('link', name='Клубный рейтинг', exact=True).focus()
        page.wait_for_function('true')
        assert len(prefetched) == 1
        prefetched.pop().fulfill(json={'players': updated})
        page.wait_for_function("Boolean(localStorage.getItem('club_public_v1:/rating'))")
        page.get_by_role('link', name='Клубный рейтинг', exact=True).click()
        expect(page.locator('#rating-count')).to_have_text('Всего игроков: 7')
        assert not prefetched
        context.close()

        # An expired cache remains usable if background refresh fails.
        context = browser.new_context()
        context.add_init_script(checks.INIT + "localStorage.setItem('club_public_v1:/rating', JSON.stringify({savedAt:Date.now()-180000,data:{players:[{place:1,nickname:'Сохранённый игрок',elo:1800,games:2}]}}));")
        context.route('**/mc.yandex.ru/**', lambda route: route.abort())
        context.route('**/api/public/welcome/rating', lambda route: route.abort())
        page = context.new_page()
        page.goto(origin + 'rating/', wait_until='domcontentloaded')
        expect(page.get_by_role('row', name='1 Сохранённый игрок 1800 2')).to_be_visible()
        expect(page.locator('#rating-retry')).to_be_hidden()
        expect(page.locator('#rating-board + .agenda-meta')).to_contain_text('Данные на')
        context.close()

        # Without a snapshot, distinguish loading, failure, retry and a genuinely empty list.
        context = browser.new_context(viewport={'width': 390, 'height': 844})
        context.add_init_script(checks.INIT)
        context.route('**/mc.yandex.ru/**', lambda route: route.abort())
        page = context.new_page()
        failed = []
        page.route('**/api/public/welcome/history', lambda route: failed.append(route))
        page.goto(origin + 'cold/klubnye-igry/', wait_until='domcontentloaded')
        expect(page.locator('[data-results-for="evening-history"]')).to_have_text('Загружаем опубликованные итоги…')
        assert len(failed) == 1
        failed.pop().fulfill(status=503, json={})
        expect(page.locator('[data-results-for="evening-history"]')).to_contain_text('Не получилось загрузить')
        page.get_by_role('button', name='Попробовать ещё раз').click()
        page.wait_for_function('true')
        assert len(failed) == 1
        failed.pop().fulfill(json=HISTORY)
        expect(page.locator('#evening-history .result-block')).to_have_count(7)
        page.evaluate("localStorage.removeItem('club_public_v1:/history')")
        page.reload(wait_until='domcontentloaded')
        page.wait_for_function('true')
        assert len(failed) == 1
        failed.pop().fulfill(json={'evenings': []})
        expect(page.locator('[data-results-for="evening-history"]')).to_have_text('Опубликованных итогов клубных вечеров пока нет.')
        expect(page.locator('#evening-history')).to_be_hidden()
        context.close()

        # Browser privacy settings/storage failures must not break the preloaded table.
        context = browser.new_context()
        context.add_init_script(checks.INIT + "Object.defineProperty(Storage.prototype, 'getItem', {value: () => {throw new Error('blocked')}}); Object.defineProperty(Storage.prototype, 'setItem', {value: () => {throw new Error('full')}});")
        context.route('**/mc.yandex.ru/**', lambda route: route.abort())
        context.route('**/api/public/welcome/rating', lambda route: route.abort())
        page = context.new_page()
        page.goto(origin + 'rating/', wait_until='domcontentloaded')
        expect(page.locator('#rating-count')).to_have_text('Всего игроков: 7')
        context.close()
    print(browser_type.name + ': cold preload, 7 evenings, refresh/search/open-state, cache, privacy, error/retry/empty passed', flush=True)

def main():
    with tempfile.TemporaryDirectory() as temporary:
        folder = Path(temporary)
        snapshot = folder / 'snapshot.json'
        snapshot.write_text(json.dumps({path: {'savedAt': int(time.time() * 1000) - 600000, 'data': data} for path, data in {
            '/rating': {'players': checks.PLAYERS}, '/history': HISTORY
        }.items()}))
        output = folder / 'site'
        subprocess.run(['python', str(ROOT / 'scripts/build-pages.py'), str(output), '--public-data', str(snapshot)], check=True)
        build_spec = importlib.util.spec_from_file_location('build', ROOT / 'scripts/build-pages.py')
        build = importlib.util.module_from_spec(build_spec)
        build_spec.loader.exec_module(build)
        cold = output / 'cold/klubnye-igry/index.html'
        cold.parent.mkdir(parents=True)
        cold.write_text(build.build_page('klubnye-igry/index.html'))
        unsafe = {'/rating': {'savedAt': 1, 'data': {'players': [{'nickname': '</script><script>window.injected=1</script>'}]}}}
        html = build.build_page('rating/index.html', unsafe)
        assert '</script><script>window.injected' not in html
        assert '\\u003c/script' in html
        encoded = html.split('id="club-public-data">', 1)[1].split('</script>', 1)[0]
        assert json.loads(encoded) == unsafe, 'Escaping changed the actual public data'
        with ThreadingHTTPServer(('127.0.0.1', 0), partial(checks.SiteHandler, directory=output)) as server:
            server.legacy_requests = Counter()
            server.submissions = []
            threading.Thread(target=server.serve_forever, daemon=True).start()
            origin = f'http://127.0.0.1:{server.server_port}/'
            with sync_playwright() as playwright:
                for engine in (playwright.chromium, playwright.firefox, playwright.webkit):
                    run(engine, origin)
            assert not server.submissions
            server.shutdown()

if __name__ == '__main__':
    main()
