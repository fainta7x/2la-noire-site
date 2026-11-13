"""Check the actual Pages build at narrow, breakpoint, and wide viewports."""

import argparse
import json
import threading
from collections import Counter
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import expect, sync_playwright

VIEWPORTS = [
    (320, 568), (340, 640), (341, 640), (375, 667), (390, 844),
    (440, 812), (441, 812), (720, 900), (721, 900), (760, 900),
    (761, 900), (900, 900), (901, 900), (1024, 768), (1080, 900), (1081, 900), (1440, 900),
    (1891, 933), (1920, 1080), (2560, 1440),
]
PAGES = {
    'klubnye-igry/': 'Регулярные игры',
    'sezony/': 'Рейтинговые сезоны',
    'turniry/': 'Турниры',
    'blog/': 'Блог клуба',

    '': 'Спортивная мафия в Туле',
    'igry/': 'Расписание и запись',
    'novichkam/': 'Твой первый вечер',
    'pravila/': 'Правила спортивной мафии',
    'foto/': 'Фото с игр',
    'rating/': 'Клубный рейтинг',
}
LEGACY = {
    '/site.css': 'body { --old-site: yes; }',
    '/join.css': 'body { --old-join: yes; }',
    '/pages.css': 'body { --old-rules: yes; }',
    '/account.js': "document.body.dataset.oldAccount = 'yes';",
}
VENUE = {'name': 'Суп с котом', 'address': 'Пушкинский проезд, 4А'}
EVENINGS = [
    {'id': f'e{day}', 'starts_at': f'2026-11-{day}T19:00:00+03:00',
     'schedule': 'Правила в 18:30, первая игра в 19:00', 'venue': VENUE}
    for day in (13, 20, 27)
]
PLAYERS = [
    {'nickname': f'Игрок {i}', 'place': i, 'elo': 1600 - i, 'games': i}
    for i in range(1, 8)
]

INIT = """
(() => {
  const fetchOriginal = window.fetch.bind(window);
  const app = 'https://app.2lamafia.ru';
  window.fetch = (url, options) => {
    if (typeof url === 'string' && url.startsWith(app + '/api/public/welcome')) {
      return fetchOriginal(url.slice(app.length), options);
    }
    return fetchOriginal(url, options);
  };
  // Analytics should not affect the test or register visits.
  window.ym = () => {};
})();
"""


class SiteHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def send_body(self, body, mime, cache='no-store'):
        self.send_response(200)
        self.send_header('Content-Type', mime)
        self.send_header('Cache-Control', cache)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_json(self, data):
        self.send_body(json.dumps(data).encode(), 'application/json')

    def do_GET(self):
        path = urlsplit(self.path).path
        if path in LEGACY:
            self.server.legacy_requests[path] += 1
            self.send_body(LEGACY[path].encode(), 'text/css' if path.endswith('.css') else 'text/javascript',
                           'public, max-age=86400')
        elif path == '/_test/previous/':
            self.send_body(
                b'<!doctype html><link rel="stylesheet" href="/site.css">'
                b'<link rel="stylesheet" href="/join.css"><link rel="stylesheet" href="/pages.css">'
                b'<body>Previous release<script src="/account.js"></script></body>',
                'text/html')
        elif path == '/api/public/welcome':
            self.send_json({'evening': EVENINGS[0], 'evenings': EVENINGS})
        elif path == '/api/public/welcome/seats':
            self.send_json({'evening_id': self.path.rsplit('=', 1)[-1], 'going': 1, 'games': [
                {'number': 1, 'starts_at': EVENINGS[0]['starts_at'], 'target': 10, 'taken': 1, 'people': ['Игрок']}
            ]})
        elif path == '/api/public/welcome/session':
            self.send_json({'signed_in': False})
        elif path == '/api/public/welcome/rating':
            self.send_json({'players': PLAYERS})
        else:
            super().do_GET()

    def do_POST(self):
        payload = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        if self.path == '/api/public/welcome/lead':
            self.server.submissions.append(payload)
            self.send_json({'ok': True, 'booked': True})
        else:
            self.send_json({'ok': True})


def check_layout(page, origin, width, height, snapshots=None):
    page.set_viewport_size({'width': width, 'height': height})
    for route, title in PAGES.items():
        response = page.goto(origin + route, wait_until='domcontentloaded')
        assert response.ok or response.status == 304, f'{route} returned {response.status}'
        expect(page.get_by_role('heading', level=1, name=title, exact=True)).to_be_visible()
        expect(page.get_by_role('link', name='Войти', exact=True)).to_have_count(1)
        typography = page.evaluate("""async () => {
            await document.fonts.ready;
            const brand = document.querySelector('.site-header .brand-name');
            return {
              loaded: document.fonts.check('700 20px Roboto', 'Спортивная мафия'),
              headline: getComputedStyle(document.querySelector('h1')).fontFamily,
              brand: getComputedStyle(brand).fontFamily,
              button: getComputedStyle(document.querySelector('.account a')).fontFamily,
              headerGap: Math.abs(document.querySelector('.site-header .brand').getBoundingClientRect().toJSON().y + document.querySelector('.site-header .brand').getBoundingClientRect().height / 2 -
                                  document.querySelector('.header-actions').getBoundingClientRect().top - document.querySelector('.header-actions').getBoundingClientRect().height / 2)
            };
        }""")
        assert typography['loaded'] and typography['headline'].startswith('Roboto'), (route, width, typography)
        assert typography['headline'] == typography['brand'] == typography['button'], (route, width, typography)
        assert typography['headerGap'] <= 1, f'Header alignment at /{route}, {width}: {typography}'
        assert page.evaluate('document.documentElement.scrollWidth') <= width + 1, f'Horizontal overflow at /{route}, {width}'
        assert page.locator('.skip-link').bounding_box()['y'] < 0, f'Skip link visible at /{route}, {width}'
        if route:
            expect(page.locator('.main-nav [aria-current="page"]')).to_have_attribute('href', '/' + route)
        if route == 'igry/':
            expect(page.get_by_role('radio', name='Пятница, 13 ноября')).to_be_visible()
        if route == 'rating/':
            expect(page.get_by_role('table', name='Таблица игроков')).to_be_visible()
        if snapshots and width in (390, 1891):
            page.mouse.move(0, 0)
            page.screenshot(path=snapshots / f'{route.strip("/") or "home"}-{width}.jpg',
                            type='jpeg', quality=84, animations='disabled')
        if route:
            continue
        expect(page.get_by_role('link', name='Записаться на игру', exact=True)).to_be_in_viewport()
        expect(page.get_by_role('link', name='Записаться на игру', exact=True)).to_have_attribute('href', '/igry/#join')
        cover = page.get_by_role('region', name='Фотографии клуба').get_by_role('img', name='Игроки в масках за столом 2LA noire')
        expect(cover).to_be_visible()
        assert cover.evaluate('(img) => img.decode().then(() => img.naturalWidth > 0)'), f'Cover missing at {width}'
        layout = page.evaluate("""() => {
            const rect = (s) => document.querySelector(s).getBoundingClientRect().toJSON();
            const range = document.createRange();
            range.selectNodeContents(document.querySelector('.hero h1'));
            return {
              hero: rect('.hero-copy'), figure: rect('.hero-visual'), title: range.getBoundingClientRect().toJSON(),
              background: getComputedStyle(document.querySelector('.hero-visual')).backgroundImage,
              old: getComputedStyle(document.body).getPropertyValue('--old-site')
            };
        }""")
        assert not layout['old'] and 'hero-table' not in layout['background']
        assert layout['title']['left'] >= layout['hero']['left'] - 1, f'Headline overflow at {width}: {layout}'
        assert layout['title']['right'] <= layout['hero']['right'] + 1, f'Headline overflow at {width}: {layout}'
        assert layout['hero']['top'] >= layout['figure']['top'] and layout['hero']['bottom'] <= layout['figure']['bottom'], f'Hero copy outside photo at {width}'
        copy_center = (layout['hero']['left'] + layout['hero']['right']) / 2
        photo_center = (layout['figure']['left'] + layout['figure']['right']) / 2
        assert abs(copy_center - photo_center) <= 1, f'Hero misaligned at {width}: {layout}'
        if snapshots and width in (390, 1891):
            gallery = page.locator('.home-gallery')
            gallery.scroll_into_view_if_needed()
            gallery.locator('img').evaluate_all('(images) => Promise.all(images.map((img) => img.decode()))')
            gallery.screenshot(path=snapshots / f'home-photos-{width}.jpg', type='jpeg', quality=84)


def check_cover_photos(page, origin):
    page.set_viewport_size({'width': 390, 'height': 844})
    page.goto(origin, wait_until='domcontentloaded')
    photos = page.get_by_role('region', name='Фотографии клуба')
    count = photos.locator('.hero-photo-count')
    next_photo = photos.get_by_role('button', name='Следующий кадр')
    expect(count).to_have_text('1 / 4')
    next_photo.focus()
    page.keyboard.press('Enter')
    expect(count).to_have_text('2 / 4')
    expect(photos.get_by_role('img', name='Игроки слушают речь за столом')).to_be_visible()
    expect(next_photo).to_be_focused()
    photos.get_by_role('button', name='Предыдущий кадр').click()
    photos.get_by_role('button', name='Предыдущий кадр').click()
    expect(count).to_have_text('4 / 4')
    expect(photos.locator('.hero-slide:visible')).to_have_count(1)
    assert photos.locator('.hero-slide:visible img').evaluate('(img) => getComputedStyle(img).animationName') == 'none'


def check_gallery(page, origin):
    page.set_viewport_size({'width': 390, 'height': 844})
    page.goto(origin, wait_until='domcontentloaded')
    page.get_by_role('link', name='Фото', exact=True).click()
    for width in (390, 1440):
        page.set_viewport_size({'width': width, 'height': 900})
        sizes = page.locator('#place-photos > .photo').evaluate_all("""photos => photos.map(photo => {
          const {width, height} = photo.getBoundingClientRect();
          return [width, height];
        })""")
        assert len(sizes) >= 19 and all(size == sizes[0] for size in sizes), (width, sizes)
    page.set_viewport_size({'width': 390, 'height': 844})
    first = page.get_by_role('link', name='Игроки слушают речь за столом')
    first.click()
    dialog = page.get_by_role('dialog')
    expect(dialog).to_be_visible()
    expect(dialog.locator('figcaption')).to_contain_text('1 из 19')
    page.keyboard.press('ArrowRight')
    expect(dialog.locator('figcaption')).to_contain_text('2 из 19')
    page.keyboard.press('Escape')
    expect(dialog).to_be_hidden()
    expect(first).to_be_focused()


def check_form(page, origin, server):
    page.goto(origin, wait_until='domcontentloaded')
    page.get_by_role('link', name='Записаться на игру', exact=True).click()
    page.get_by_label('Имя', exact=True).fill('Тест формы')
    page.get_by_label('Имя пользователя в Telegram').fill('@test_username')
    page.get_by_role('radio', name='Пятница, 20 ноября').focus()
    page.keyboard.press('Space')
    expect(page.get_by_role('heading', name='Пятница, 20 ноября')).to_be_visible()
    page.get_by_role('radio', name='Телефон').focus()
    page.keyboard.press('Space')
    expect(page.get_by_label('Номер телефона')).to_be_visible()
    page.get_by_role('radio', name='Telegram', exact=True).focus()
    page.keyboard.press('Space')
    expect(page.get_by_label('Имя пользователя в Telegram')).to_have_value('@test_username')
    page.get_by_role('button', name='Записаться на игру').click()
    expect(page.locator('#join-result')).to_contain_text('Ты в списке · Пятница, 20 ноября')
    assert server.submissions[-1]['evening_id'] == 'e20'
    page.get_by_role('link', name='Рейтинг', exact=True).click()
    expect(page.get_by_role('row', name='7 Игрок 7 1593 7')).to_be_hidden()
    page.get_by_role('button', name='Показать всех игроков (7)').click()
    expect(page.get_by_role('row', name='7 Игрок 7 1593 7')).to_be_visible()


def check_browser(browser_type, origin, server, snapshots=None):
    with browser_type.launch() as browser:
        context = browser.new_context(viewport={'width': 1891, 'height': 933}, reduced_motion='reduce')
        context.add_init_script(INIT)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))

        before = server.legacy_requests.copy()
        for width, height in VIEWPORTS:
            check_layout(page, origin, width, height)
        assert before == server.legacy_requests, 'Fresh visitor fetched an unversioned CSS or JS file'

        page.goto(origin + '_test/previous/')
        assert page.evaluate("getComputedStyle(document.body).getPropertyValue('--old-site')").strip() == 'yes'
        assert page.locator('body').get_attribute('data-old-account') == 'yes'
        assert all(server.legacy_requests[path] > before[path] for path in LEGACY), 'Failed to prime old assets'
        before = server.legacy_requests.copy()

        for width, height in VIEWPORTS:
            check_layout(page, origin, width, height, snapshots)
        check_cover_photos(page, origin)
        check_gallery(page, origin)
        check_form(page, origin, server)
        assert before == server.legacy_requests, 'New release requested an old asset after warming the cache'
        assert not errors, errors
    print(f'{browser_type.name}: {len(VIEWPORTS)} sizes × 6 pages, fresh and old cache, gallery, sign-up, rating', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('site', type=Path)
    parser.add_argument('--snapshots', type=Path)
    args = parser.parse_args()
    with ThreadingHTTPServer(('127.0.0.1', 0), partial(SiteHandler, directory=args.site)) as server:
        server.legacy_requests = Counter()
        server.submissions = []
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with sync_playwright() as playwright:
                origin = f'http://127.0.0.1:{server.server_port}/'
                if args.snapshots:
                    args.snapshots.mkdir(parents=True, exist_ok=True)
                for name in ('chromium', 'firefox', 'webkit'):
                    check_browser(getattr(playwright, name), origin, server, args.snapshots if name == 'chromium' else None)
        finally:
            server.shutdown()
            thread.join()


if __name__ == '__main__':
    main()
