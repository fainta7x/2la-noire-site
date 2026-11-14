"""Check the actual Pages build at narrow, breakpoint, and wide viewports."""

import argparse
import json
import re
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
    'club/': 'Клуб 2LA noire',
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
        elif path == '/api/public/welcome/agenda':
            self.send_json({'evenings': [
                dict(EVENINGS[0], format='NOVICE'),
                {'starts_at': '2026-11-20T21:00:00+03:00', 'format': 'CASUAL', 'free_seats': 4},
            ]})
        elif path == '/api/public/welcome/history':
            self.send_json({'evenings': [
                {'starts_at': '2026-11-07T21:00:00+03:00', 'games': 3, 'players': 10, 'format': 'CASUAL',
                 'image': '/img/favicon.png'},
            ]})
        elif path == '/api/public/welcome/seasons':
            self.send_json({'seasons': []})
        elif path == '/api/public/welcome/tournaments':
            self.send_json({'tournaments': [
                {'title': 'Кубок клуба', 'date': '2026-11-07T08:00:00Z', 'image': '/img/favicon.png',
                 'standings': [{'place': 1, 'name': 'Игрок 1'}]},
            ]})
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

        # A page can have zero horizontal scroll while its headings/cards are clipped
        # by overflow:hidden/clip parents. Check actual content geometry as well.
        if width <= 440:
            mobile_rects = page.evaluate("""() => {
                const selectors = [
                    '.section h2', '.page-opening h1', '.primary-button',
                    '.secondary-button', '.club-grid article', '.club-path-grid article'
                ];
                return selectors.flatMap(selector =>
                    [...document.querySelectorAll(selector)].filter(el => {
                        const style = getComputedStyle(el);
                        return style.display !== 'none' && style.visibility !== 'hidden';
                    }).map(el => {
                        const r = el.getBoundingClientRect();
                        return {selector, text: (el.textContent || '').trim().slice(0, 50),
                                left: r.left, right: r.right, width: r.width};
                    })
                );
            }""")
            clipped = [r for r in mobile_rects
                       if r['width'] > 0 and (r['left'] < -2 or r['right'] > width + 2)]
            assert not clipped, f'Clipped mobile content at /{route}, {width}: {clipped}'
        if route == '' and width <= 760:
            gallery_items = page.locator('.editorial-gallery .photo-preview')
            if gallery_items.count() >= 3:
                boxes = [gallery_items.nth(i).bounding_box() for i in range(3)]
                assert all(b and b['width'] >= 120 for b in boxes), (width, boxes)
                assert all(b['x'] >= -2 and b['x'] + b['width'] <= width + 2 for b in boxes), (width, boxes)
                assert boxes[1]['x'] >= boxes[0]['x'] + boxes[0]['width'] - 2 or (
                    boxes[1]['y'] >= boxes[0]['y'] + boxes[0]['height'] - 2), (width, boxes)
        assert page.locator('.skip-link').bounding_box()['y'] < 0, f'Skip link visible at /{route}, {width}'
        if route in ('klubnye-igry/', 'rating/', 'sezony/', 'turniry/'):
            expect(page.locator('.main-nav [aria-current="location"]')).to_have_attribute('href', '/club/')
        elif route:
            expect(page.locator('.main-nav [aria-current="page"]')).to_have_attribute('href', '/' + route)
        if route == 'club/':
            expect(page.locator('.club-grid a.text-link:not(.club-preview a)')).to_have_count(4)
            for destination in ('klubnye-igry', 'rating', 'sezony', 'turniry'):
                expect(page.locator(f'.club-grid a.text-link[href="/{destination}/"]:not(.club-preview a)')).to_be_visible()
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
        # Screenshot-based regression: mobile story photos must be visible
        # alongside their own stage and the chapter navigation must fit.
        if width <= 760:
            nav_links = page.locator('.chapter-nav-inner a')
            assert nav_links.count() == 5
            nav_boxes = [nav_links.nth(i).bounding_box() for i in range(5)]
            assert all(b and b['x'] >= -2 and b['x'] + b['width'] <= width + 2 for b in nav_boxes), (width, nav_boxes)
            assert nav_boxes[4]['y'] > nav_boxes[0]['y'], (width, nav_boxes)
            journey = page.locator('[data-journey] article')
            assert journey.count() == 3
            for i in range(3):
                photo = journey.nth(i).locator('.journey-mobile-photo')
                assert photo.is_visible(), (width, i)
                box = photo.bounding_box()
                assert box and box['height'] >= 140 and box['width'] >= 200, (width, i, box)
                photo.scroll_into_view_if_needed()  # trigger actual lazy-loading before decode
                image = photo.locator('img')
                image.evaluate("(img) => { img.loading = 'eager'; }")
                expect(image).to_have_js_property('complete', True)
                assert image.evaluate('(img) => img.naturalWidth > 0'), (width, i)
            assert not page.locator('[data-journey-visual]').is_visible(), width
            club_img = page.locator('.place-story > img')
            club_box = club_img.bounding_box()
            assert club_box and 200 <= club_box['height'] <= 361, (width, club_box)
        elif width >= 901:
            assert page.locator('[data-journey-visual]').is_visible(), width
            assert not page.locator('.journey-mobile-photo').first.is_visible(), width
        # The mobile photo checks scroll the page; restore the top for hero assertions.
        page.evaluate("() => { document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, 0); }")
        expect(page.get_by_role('link', name='Узнать об игре', exact=True)).to_be_in_viewport()
        expect(page.get_by_role('link', name='Узнать об игре', exact=True)).to_have_attribute('href', '#about')
        cover = page.get_by_role('region', name='Фотографии клуба').get_by_role('img', name='Игроки в масках за столом 2LA noire')
        expect(cover).to_be_visible()
        assert cover.evaluate('(img) => img.decode().then(() => img.naturalWidth > 0)'), f'Cover missing at {width}'
        layout = page.evaluate("""() => {
            const rect = (s) => document.querySelector(s).getBoundingClientRect().toJSON();
            const range = document.createRange();
            range.selectNodeContents(document.querySelector('.hero h1'));
            return {
              hero: rect('.hero-copy'), figure: rect('.hero-visual'), banner: rect('.hero'), title: range.getBoundingClientRect().toJSON(),
              viewport: window.innerWidth,
              background: getComputedStyle(document.querySelector('.hero-visual')).backgroundImage,
              old: getComputedStyle(document.body).getPropertyValue('--old-site')
            };
        }""")
        assert not layout['old'] and 'hero-table' not in layout['background']
        assert layout['title']['left'] >= layout['hero']['left'] - 1, f'Headline overflow at {width}: {layout}'
        assert layout['title']['right'] <= layout['hero']['right'] + 1, f'Headline overflow at {width}: {layout}'
        # The photo is a full-width banner behind the copy, not a framed card.
        assert abs(layout['figure']['left']) <= 1 and layout['figure']['right'] >= layout['viewport'] - 18, f'Hero photo is not full width at {width}: {layout}'
        assert layout['hero']['top'] >= layout['figure']['top'] and layout['hero']['bottom'] <= layout['figure']['bottom'], f'Hero copy outside photo at {width}'
        copy_center = (layout['hero']['left'] + layout['hero']['right']) / 2
        photo_center = (layout['figure']['left'] + layout['figure']['right']) / 2
        assert abs(copy_center - photo_center) <= 12, f'Hero misaligned at {width}: {layout}'
        if snapshots and width in (390, 1891):
            gallery = page.locator('.home-gallery')
            gallery.scroll_into_view_if_needed()
            gallery.locator('img').evaluate_all('(images) => Promise.all(images.map((img) => img.decode()))')
            gallery.screenshot(path=snapshots / f'home-photos-{width}.jpg', type='jpeg', quality=84)


def check_cover_photos(page, origin):
    page.set_viewport_size({'width': 390, 'height': 844})
    page.goto(origin, wait_until='domcontentloaded')
    photos = page.get_by_role('region', name='Фотографии клуба')
    dots = page.get_by_role('group', name='Смена фото')
    expect(photos.locator('.hero-slide.is-active')).to_have_count(1)
    expect(dots.get_by_role('button', name='Фото 1 из 4')).to_have_attribute('aria-current', 'true')
    second = dots.get_by_role('button', name='Фото 2 из 4')
    second.focus()
    page.keyboard.press('Enter')
    expect(second).to_have_attribute('aria-current', 'true')
    expect(photos.locator('.hero-slide.is-active img')).to_have_attribute('alt', 'Игроки слушают речь за столом')
    expect(second).to_be_focused()
    # This browser asks for reduced motion: the photos must stay where the visitor left them.
    page.wait_for_timeout(7000)
    expect(photos.locator('.hero-slide.is-active img')).to_have_attribute('alt', 'Игроки слушают речь за столом')


def check_auto_photos(browser, origin):
    context = browser.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='no-preference')
    context.add_init_script(INIT)
    page = context.new_page()
    page.goto(origin, wait_until='domcontentloaded')
    photos = page.get_by_role('region', name='Фотографии клуба')
    expect(photos.locator('.hero-slide.is-active img')).to_have_attribute('alt', 'Игроки в масках за столом 2LA noire')
    # The photos change by themselves (the interval is a few seconds).
    expect(photos.locator('.hero-slide.is-active img')).not_to_have_attribute('alt', 'Игроки в масках за столом 2LA noire', timeout=9000)
    context.close()


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
        assert len(sizes) >= 6 and all(abs(w - sizes[0][0]) < 1 and abs(h - sizes[0][1]) < 1 for w, h in sizes), (width, sizes)
    page.set_viewport_size({'width': 390, 'height': 844})
    first = page.get_by_role('link', name='Двое игроков общаются жестами')
    first.click()
    dialog = page.get_by_role('dialog')
    expect(dialog).to_be_visible()
    expect(dialog.locator('figcaption')).to_contain_text('1 из 6')
    page.keyboard.press('ArrowRight')
    expect(dialog.locator('figcaption')).to_contain_text('2 из 6')
    page.keyboard.press('Escape')
    expect(dialog).to_be_hidden()
    expect(first).to_be_focused()


def check_form(page, origin, server):
    page.goto(origin, wait_until='domcontentloaded')
    page.locator('.main-nav').get_by_role('link', name='Запись на игру', exact=True).click()
    page.get_by_label('Имя', exact=True).fill('Тест формы')
    page.get_by_label('Имя пользователя в Telegram').fill('@test_username')
    page.get_by_role('radio', name='Пятница, 20 ноября').focus()
    page.keyboard.press('Space')
    expect(page.locator('#join-evening').get_by_role('heading', name='Пятница, 20 ноября', exact=True)).to_be_visible()
    page.get_by_role('radio', name='Телефон').focus()
    page.keyboard.press('Space')
    expect(page.get_by_label('Номер телефона')).to_be_visible()
    page.get_by_role('radio', name='Telegram', exact=True).focus()
    page.keyboard.press('Space')
    expect(page.get_by_label('Имя пользователя в Telegram')).to_have_value('@test_username')
    page.get_by_role('button', name='Записаться на игру').click()
    expect(page.locator('#join-result')).to_contain_text('Ты в списке · Пятница, 20 ноября')
    assert server.submissions[-1]['evening_id'] == 'e20'
    page.get_by_role('navigation', name='Основная навигация').get_by_role('link', name='Клуб', exact=True).click()
    page.get_by_role('link', name='Клубный рейтинг', exact=True).click()
    expect(page.get_by_role('row', name='7 Игрок 7 1593 7')).to_be_hidden()
    page.get_by_role('button', name='Показать всех игроков (7)').click()
    expect(page.get_by_role('row', name='7 Игрок 7 1593 7')).to_be_visible()


def check_club_preview(page, origin):
    page.set_viewport_size({'width': 390, 'height': 844})
    page.route('**/api/public/welcome/**', lambda route: route.abort())
    try:
        page.goto(origin + 'club/')
        thumbnails = page.locator('.club-preview img')
        expect(thumbnails).to_have_count(3)
        assert thumbnails.evaluate_all("""async images => {
            await Promise.all(images.map(image => image.decode()));
            return images.every(image => image.naturalWidth === 640 &&
                image.naturalHeight === 640 && image.getBoundingClientRect().width >= 250);
        }""")
    finally:
        page.unroute('**/api/public/welcome/**')

    def serve_preview(route):
        # Serve an actual 640px result thumbnail, not an icon: image.decode()
        # should exercise the same format used by the public preview.
        result_image = Path(__file__).resolve().parents[1] / 'img' / 'club-results' / 'history-cbcb7301-8580-423a-bb5a-3d1733d7fbea.webp'
        route.fulfill(path=result_image, content_type='image/webp')

    image_url = 'https://app.2lamafia.ru/img/favicon.png'
    page.route(image_url, serve_preview)
    try:
        page.goto(origin + 'club/')
        for selector in ('#club-evening', '#club-tournament'):
            preview = page.locator(selector)
            expect(preview.locator('a.result-picture')).to_have_attribute('href', image_url)
            image = preview.locator('img')
            expect(image).to_be_visible()
            # The result picture loads lazily: bring it into view and wait until it has loaded before decoding
            # (a lazy picture that is still off screen makes decode() fail in some browsers).
            image.scroll_into_view_if_needed()
            page.wait_for_function(
                "(selector) => { const img = document.querySelector(selector + ' img'); return Boolean(img && img.complete && img.naturalWidth > 0); }",
                arg=selector, timeout=10000)
            assert image.evaluate('(img) => img.decode().then(() => img.naturalWidth > 0)')
        expect(page.locator('#club-rating svg')).to_have_attribute('aria-label', re.compile('Игрок 1 — 1599 Elo'))
        expect(page.locator('#club-rating .result-picture')).to_have_attribute('href', '/rating/')
    finally:
        page.unroute(image_url, serve_preview)



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
        check_auto_photos(browser, origin)
        check_club_preview(page, origin)
        check_gallery(page, origin)
        check_form(page, origin, server)
        assert before == server.legacy_requests, 'New release requested an old asset after warming the cache'
        assert not errors, errors
    print(f'{browser_type.name}: {len(VIEWPORTS)} sizes × {len(PAGES)} pages, fresh and old cache, gallery, sign-up, rating', flush=True)


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
