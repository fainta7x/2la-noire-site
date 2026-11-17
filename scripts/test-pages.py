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
PRICE = 'Первые 2 вечера бесплатно, дальше — 200 ₽ за игру'
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
            self.send_json({'evening': dict(EVENINGS[0], price=PRICE), 'evenings': EVENINGS})
        elif path == '/api/public/welcome/seats':
            if self.path.rsplit('=', 1)[-1] == 'club20':
                self.send_json({'evening_id': None, 'games': [], 'going': 0})
                return
            self.send_json({'evening_id': self.path.rsplit('=', 1)[-1], 'going': 1, 'games': [
                {'number': 1, 'starts_at': EVENINGS[0]['starts_at'], 'target': 9, 'taken': 1, 'people': ['Игрок']},
                {'number': 2, 'starts_at': '2026-11-13T20:00:00+03:00', 'target': 11, 'taken': 3,
                 'people': ['Второй', 'Очень длинный ник игрока', '<b>Ник</b>']},
            ]})
        elif path == '/api/public/welcome/session':
            self.send_json({'signed_in': False})
        elif path == '/api/public/welcome/agenda':
            self.send_json({'evenings': [
                dict(EVENINGS[0], format='NOVICE'),
                dict(EVENINGS[1], format='NOVICE', free_seats=4),
                {'id': 'club20', 'starts_at': '2026-11-20T21:00:00+03:00', 'format': 'CASUAL', 'free_seats': 4},
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
            const navigation = document.querySelector('.site-header .main-nav');
            return {
              loaded: document.fonts.check('700 20px Roboto', 'Спортивная мафия'),
              headline: getComputedStyle(document.querySelector('h1')).fontFamily,
              navigation: getComputedStyle(navigation).fontFamily,
              button: getComputedStyle(document.querySelector('.account a')).fontFamily,
              headerGap: Math.abs(document.querySelector('.site-header .brand').getBoundingClientRect().toJSON().y + document.querySelector('.site-header .brand').getBoundingClientRect().height / 2 -
                                  document.querySelector('.header-actions').getBoundingClientRect().top - document.querySelector('.header-actions').getBoundingClientRect().height / 2)
            };
        }""")
        assert typography['loaded'] and typography['headline'].startswith('Roboto'), (route, width, typography)
        assert typography['headline'] == typography['navigation'] == typography['button'], (route, width, typography)
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
            expect(page.locator('[data-evening-id="e13"] > summary')).to_be_visible()
            expect(page.locator('#join')).to_be_hidden()
        if route == 'rating/':
            expect(page.get_by_role('table', name='Таблица игроков')).to_be_visible()
        if snapshots and width in (390, 1891):
            page.mouse.move(0, 0)
            page.screenshot(path=snapshots / f'{route.strip("/") or "home"}-{width}.jpg',
                            type='jpeg', quality=84, animations='disabled')
        if route:
            continue
        # Every chapter must remain reachable and its photograph readable on phones.
        nav_links = page.locator('.chapter-nav-inner a')
        assert nav_links.count() == 4
        if width <= 760:
            nav_boxes = [nav_links.nth(i).bounding_box() for i in range(4)]
            assert all(b and b['x'] >= -2 and b['x'] + b['width'] <= width + 2 for b in nav_boxes), (width, nav_boxes)
            assert nav_boxes[3]['y'] > nav_boxes[0]['y'], (width, nav_boxes)
        for link in nav_links.all():
            assert page.locator(link.get_attribute('href')).count() == 1
        for photo in page.locator('.story-photo').all():
            photo.scroll_into_view_if_needed()
            image = photo.locator('img')
            image.evaluate('(img) => { img.loading = "eager"; }')
            expect(image).to_have_js_property('complete', True)
            assert image.evaluate('(img) => img.decode().then(() => img.naturalWidth > 0)')
            if width <= 760:
                box = photo.bounding_box()
                assert box and box['width'] >= 200 and 140 <= box['height'] <= max(400, height * .75), (width, box)
        # The story photo checks scroll the page; restore the top for hero assertions.
        page.evaluate("() => { document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, 0); }")
        expect(page.get_by_role('link', name='Узнать об игре', exact=True)).to_be_in_viewport()
        expect(page.get_by_role('link', name='Узнать об игре', exact=True)).to_have_attribute('href', '#intro')
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
        # Copy and photography occupy separate areas: no text over the people.
        assert layout['hero']['top'] >= layout['banner']['top'] - 1
        assert layout['hero']['bottom'] <= layout['banner']['bottom'] + 1
        assert layout['figure']['right'] >= layout['viewport'] - 18
        if width > 760:
            assert layout['hero']['right'] <= layout['figure']['left'] + 1, f'Copy covers photo at {width}: {layout}'
        else:
            assert abs(layout['figure']['left']) <= 1
            assert layout['hero']['bottom'] <= layout['figure']['top'] + 1, f'Mobile copy covers photo at {width}: {layout}'
        if snapshots and width in (390, 1891):
            gallery = page.locator('.home-gallery')
            gallery.scroll_into_view_if_needed()
            gallery.locator('img').evaluate_all('(images) => Promise.all(images.map((img) => img.decode()))')
            gallery.screenshot(path=snapshots / f'home-photos-{width}.jpg', type='jpeg', quality=84)


def check_home_story(browser, page, origin):
    # Old CRM paragraph fields must not overwrite the approved long-form homepage.
    stale = 'Старая редакция из CMS'
    endpoint = '**/api/public/welcome'
    page.route(endpoint, lambda route: route.fulfill(
        status=200, content_type='application/json',
        body=json.dumps({'site': {'hero_lead': stale, 'about': stale, 'newcomers': stale}})))
    try:
        page.set_viewport_size({'width': 390, 'height': 844})
        page.goto(origin, wait_until='networkidle')
        expect(page.locator('.hero-lead')).not_to_contain_text(stale)
        expect(page.locator('main')).not_to_contain_text(stale)
        page.evaluate('document.documentElement.style.scrollBehavior = "auto"')
        page.get_by_role('link', name='Узнать об игре', exact=True).click()
        expect(page.locator('#intro-title')).to_be_in_viewport()
        for image in page.locator('.intro-collage img').all():
            image.evaluate('(img) => { img.loading = "eager"; }')
            expect(image).to_have_js_property('complete', True)
            assert image.evaluate('(img) => img.decode().then(() => img.naturalWidth > 0)')
        assert page.locator('#intro').bounding_box()['y'] < page.locator('.chapter-nav').bounding_box()['y']
        for width in (390, 1440):
            page.set_viewport_size({'width': width, 'height': 900})
            chapter_nav = page.locator('.chapter-nav')
            assert chapter_nav.evaluate('(el) => getComputedStyle(el).position') == 'static'
            document_y = chapter_nav.evaluate('(el) => el.getBoundingClientRect().top + scrollY')
            for link in chapter_nav.locator('a').all():
                link.click()
                heading = page.locator(link.get_attribute('href')).get_by_role('heading').first
                expect(heading).to_be_in_viewport()
                assert abs(chapter_nav.evaluate('(el) => el.getBoundingClientRect().top + scrollY') - document_y) < 2
                header_bottom = page.locator('.site-header').evaluate('(el) => Math.max(0, el.getBoundingClientRect().bottom)')
                assert heading.bounding_box()['y'] >= header_bottom - 2
            assert chapter_nav.bounding_box()['y'] + chapter_nav.bounding_box()['height'] < 0
    finally:
        page.unroute(endpoint)
    # The complete story and both ways to join are available without JavaScript.
    context = browser.new_context(java_script_enabled=False, viewport={'width': 390, 'height': 844})
    try:
        fallback = context.new_page()
        fallback.goto(origin)
        for heading in fallback.locator('main h2').all():
            expect(heading).to_be_visible()
        expect(fallback.get_by_role('link', name='Записаться на первый вечер', exact=True)).to_have_attribute('href', '/igry/#join')
        expect(fallback.locator('.story-join').get_by_role('link', name='Ближайшие турниры', exact=True)).to_have_attribute('href', '/turniry/')
    finally:
        context.close()


def check_account_navigation(browser, origin):
    # Both authenticated states must fit beside the original logo, including at 320px.
    for organizer in (False, True):
        context = browser.new_context(reduced_motion='reduce')
        context.add_init_script(INIT)
        context.route('**/mc.yandex.ru/**', lambda route: route.abort())
        session = {'signed_in': True, 'cabinet_url': 'https://app.2lamafia.ru/player',
                   'organizer': organizer, 'crm_url': 'https://app.2lamafia.ru/admin' if organizer else None}
        context.route('**/api/public/welcome/session', lambda route: route.fulfill(
            status=200, content_type='application/json', body=json.dumps(session)))
        try:
            page = context.new_page()
            for width in (320, 390, 760, 1024, 1241, 1440):
                page.set_viewport_size({'width': width, 'height': 900})
                page.goto(origin + 'igry/', wait_until='domcontentloaded')
                cabinet = page.get_by_role('link', name='Мой кабинет', exact=True)
                expect(cabinet).to_have_attribute('href', session['cabinet_url'])
                page.evaluate('document.fonts.ready')
                expect(page.get_by_role('link', name='CRM', exact=True)).to_have_count(int(organizer))
                assert page.evaluate('document.documentElement.scrollWidth') <= width + 1
                brand = page.locator('.site-header .brand').bounding_box()
                actions = page.locator('.header-actions').bounding_box()
                assert abs(brand['y'] + brand['height'] / 2 - actions['y'] - actions['height'] / 2) < 1
                assert brand['x'] + brand['width'] + 8 <= actions['x']
                assert actions['x'] + actions['width'] <= width
                assert cabinet.bounding_box()['height'] >= 44
            page.evaluate('document.documentElement.style.scrollBehavior = "auto"')
            page.locator('.footer-bottom a').click()
            assert page.evaluate('scrollY') == 0
        finally:
            context.close()


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
    expect(photos.locator('.hero-slide.is-active img')).to_have_attribute('alt', 'Двое игроков внимательно слушают речь за столом')
    expect(second).to_be_focused()
    # This browser asks for reduced motion: the photos must stay where the visitor left them.
    page.wait_for_timeout(7000)
    expect(photos.locator('.hero-slide.is-active img')).to_have_attribute('alt', 'Двое игроков внимательно слушают речь за столом')


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
          const {width, height, left, right} = photo.getBoundingClientRect();
          return {width, height, left, right};
        })""")
        assert len(sizes) >= 6 and all(s['width'] >= 120 and s['height'] >= 120 and s['left'] >= 0 and s['right'] <= width for s in sizes), (width, sizes)
    page.set_viewport_size({'width': 390, 'height': 844})
    first = page.get_by_role('link', name='Двое игроков общаются жестами')
    first.click()
    dialog = page.get_by_role('dialog')
    expect(dialog).to_be_visible()
    # The gallery grows with new evenings: the caption counts the clicked photo and the next one among all of them.
    links = page.locator('#place-photos > .photo')
    total = links.count()
    position = links.evaluate_all("(items, alt) => items.findIndex(item => item.querySelector('img').alt === alt)", 'Двое игроков общаются жестами') + 1
    expect(dialog.locator('figcaption')).to_contain_text(f'{position} из {total}')
    page.keyboard.press('ArrowRight')
    expect(dialog.locator('figcaption')).to_contain_text(f'{position % total + 1} из {total}')
    page.keyboard.press('Escape')
    expect(dialog).to_be_hidden()
    expect(first).to_be_focused()


def check_interior(browser, page, origin):
    page.set_viewport_size({'width': 390, 'height': 844})
    page.goto(origin + 'rating/', wait_until='domcontentloaded')
    search = page.get_by_role('searchbox', name='Найти игрока')
    search.fill('иГрОк 7')
    expect(page.get_by_role('row', name='7 Игрок 7 1593 7')).to_be_visible()
    expect(page.locator('#rating-count')).to_have_text('Найдено: 1 из 7')
    search.fill('Такого ника нет')
    expect(page.locator('#rating-empty')).to_be_visible()
    expect(page.locator('#rating-board')).to_be_hidden()
    search.fill('')
    expect(page.get_by_role('row', name='7 Игрок 7 1593 7')).to_be_hidden()
    page.get_by_role('button', name='Показать всех игроков (7)').click()
    expect(page.get_by_role('row', name='7 Игрок 7 1593 7')).to_be_visible()
    search.fill('Игрок 1')
    search.fill('')
    expect(page.get_by_role('row', name='7 Игрок 7 1593 7')).to_be_visible()

    endpoint = '**/api/public/welcome/rating'
    state = {'fail': True}
    def rating_response(route):
        route.fulfill(status=503 if state['fail'] else 200, content_type='application/json',
                      body=json.dumps({} if state['fail'] else {'players': PLAYERS}))
    page.route(endpoint, rating_response)
    try:
        page.evaluate("localStorage.removeItem('club_public_v1:/rating')")
        page.goto(origin + 'rating/', wait_until='domcontentloaded')
        expect(page.locator('#rating-feedback')).to_contain_text('не загрузилась')
        expect(search).to_be_hidden()
        state['fail'] = False
        page.get_by_role('button', name='Попробовать ещё раз').click()
        expect(page.get_by_role('table', name='Таблица игроков')).to_be_visible()
        expect(search).to_be_visible()
    finally:
        page.unroute(endpoint)
    page.route(endpoint, lambda route: route.fulfill(json={'players': []}))
    try:
        page.evaluate("localStorage.removeItem('club_public_v1:/rating')")
        page.goto(origin + 'rating/', wait_until='domcontentloaded')
        expect(page.locator('#rating-feedback')).to_contain_text('пока нет опубликованных игроков')
        expect(page.locator('#rating-board')).to_be_hidden()
    finally:
        page.unroute(endpoint)
        page.evaluate("localStorage.removeItem('club_public_v1:/rating')")

    page.goto(origin + 'foto/', wait_until='domcontentloaded')
    total = page.locator('#place-photos > .photo').count()
    page.get_by_role('button', name='Турниры', exact=True).click()
    photos = page.locator('#place-photos > .photo:visible')
    tournament_count = photos.count()
    assert 1 < tournament_count < total
    assert photos.evaluate_all('(links) => links.every(link => link.dataset.photoKind === "tournament")')
    second_alt = photos.nth(1).locator('img').get_attribute('alt')
    photos.first.click()
    expect(page.locator('#photo-description')).to_contain_text(f'1 из {tournament_count}')
    page.keyboard.press('ArrowRight')
    expect(page.locator('#photo-dialog img')).to_have_attribute('alt', second_alt)
    page.keyboard.press('Escape')
    expect(photos.first).to_be_focused()
    page.get_by_role('button', name='Все фотографии', exact=True).click()
    expect(photos).to_have_count(total)

    context = browser.new_context(java_script_enabled=False, viewport={'width': 390, 'height': 844})
    try:
        fallback = context.new_page()
        fallback.goto(origin + 'blog/')
        fallback.locator('.journal-entry').first.locator('summary').click()
        expect(fallback.locator('.journal-body').first).to_be_visible()
        fallback.goto(origin + 'pravila/')
        fallback.locator('.inner-index a[href="#rules-roles"]').click()
        expect(fallback.locator('#rules-roles-title')).to_be_in_viewport()
        fallback.goto(origin + 'foto/')
        expect(fallback.locator('#photo-filters')).to_be_hidden()
        expect(fallback.locator('#place-photos .photo').first).to_have_attribute('href', re.compile(r'^/img/'))
    finally:
        context.close()


def check_form(page, origin, server):
    page.goto(origin, wait_until='domcontentloaded')
    page.locator('.main-nav').get_by_role('link', name='Запись на игру', exact=True).click()
    page.locator('[data-evening-id="e20"] > summary').focus()
    page.keyboard.press('Enter')
    page.get_by_label('Имя', exact=True).fill('Тест формы')
    page.get_by_label('Имя пользователя в Telegram').fill('@test_username')
    expect(page.locator('#join-evening').get_by_role('heading')).to_have_text('Пятница, 20 ноября · 19:00')
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


def check_booking(browser, page, origin):
    page.set_viewport_size({'width': 390, 'height': 844})
    page.goto(origin + 'igry/')
    expect(page.locator('#join')).to_be_hidden()
    row = page.locator('[data-evening-id="e13"]')
    summary = row.locator('summary')
    roster = row.locator('[data-roster-evening="e13"]')
    expect(summary).to_contain_text('Записались 1')
    expect(summary).to_contain_text('минимум 8')
    expect(summary).not_to_contain_text('из 9')
    expect(roster).to_be_hidden()
    expect(page.locator('.calendar-event[open]')).to_have_count(0)
    for entry in page.locator('.calendar-event').all():
        assert entry.bounding_box()['height'] <= 145, 'Closed calendar row is too large'
    summary.click()
    expect(roster).to_be_visible()
    expect(roster.locator('.roster-person')).to_have_count(1)
    expect(roster).to_contain_text('Игрок')
    roster.get_by_role('button', name='20:00 · Игра 2').click()
    expect(summary).to_contain_text('Записались 3')
    expect(summary).to_contain_text('минимум 8')
    expect(summary).not_to_contain_text('из 11')
    expect(roster).to_contain_text('от 8 до 10 игроков')
    expect(roster.locator('.roster-person')).to_have_count(3)
    expect(roster).to_contain_text('<b>Ник</b>')
    expect(roster.locator('b')).to_have_count(0)
    expect(row.locator('#join')).to_be_visible()
    expect(page.locator('input[name="evening"]')).to_have_count(0)
    expect(page.locator('#join-evening')).to_contain_text(PRICE)
    page.get_by_label('Имя', exact=True).fill('Тест календаря')
    page.get_by_label('Имя пользователя в Telegram').fill('@calendar_test')
    summary.click()
    expect(page.locator('#join')).to_be_hidden()
    expect(roster).to_be_hidden()
    expect(summary).to_contain_text('Записались 3')
    summary.click()
    expect(roster.locator('.roster-person')).to_have_count(3)
    expect(page.get_by_label('Имя пользователя в Telegram')).to_have_value('@calendar_test')
    page.get_by_role('button', name='Свернуть вечер', exact=True).click()
    expect(row).to_have_js_property('open', False)
    summary.click()
    page.get_by_label('Имя', exact=True).focus()
    page.keyboard.press('Escape')
    expect(row).to_have_js_property('open', False)
    expect(summary).to_be_focused()
    summary.click()
    page.get_by_role('button', name='Выбрать другой вечер').click()
    expect(row).to_have_js_property('open', False)
    expect(summary).to_be_focused()
    summary.click()
    expect(page.get_by_label('Имя пользователя в Telegram')).to_have_value('@calendar_test')

    filters = page.get_by_role('group', name='Формат игры')
    filters.get_by_role('button', name='Клубные', exact=True).click()
    expect(page.locator('.calendar-event')).to_have_count(1)
    expect(page.locator('#join')).to_be_hidden()
    club = page.locator('[data-evening-id="club20"]')
    expect(club.locator('summary')).to_contain_text('Запись в кабинете')
    expect(club.locator('summary')).to_contain_text('Минимум 10 игроков')
    expect(club.locator('summary')).not_to_contain_text('Свободно мест:')
    club.locator('summary').click()
    expect(club.locator('.evening-cabinet-link')).to_have_attribute('href', 'https://app.2lamafia.ru/player')
    expect(club.locator('.evening-cabinet-link')).to_be_visible()
    expect(club).to_contain_text('Состав и запись доступны в личном кабинете')
    expect(club).not_to_contain_text('не загрузился')
    filters.get_by_role('button', name='Для новичков', exact=True).click()
    expect(page.locator('.calendar-event')).to_have_count(2)
    page.get_by_role('button', name='Показать все даты', exact=True).click()
    expect(page.locator('.calendar-event')).to_have_count(3)
    expect(filters.get_by_role('button', name='Для новичков')).to_have_attribute('aria-pressed', 'true')
    page.locator('[data-evening-id="e13"] > summary').click()
    expect(page.get_by_label('Имя пользователя в Telegram')).to_have_value('@calendar_test')
    page.locator('[data-evening-id="e20"] > summary').click()
    expect(page.locator('#join-evening .join-heading')).to_have_text('Пятница, 20 ноября · 19:00')
    expect(page.locator('[data-evening-id="e20"] #join')).to_be_visible()
    expect(page.locator('.calendar-event[open]')).to_have_count(1)
    expect(page.get_by_label('Имя', exact=True)).to_have_value('Тест календаря')
    expect(page.get_by_label('Имя пользователя в Telegram')).to_have_value('@calendar_test')

    # Keep the POST pending to check that calendar clicks cannot change the
    # selected date halfway through a booking. All requests stay on the test server.
    endpoint = '**/api/public/welcome/lead'
    pending = []
    page.route(endpoint, lambda route: pending.append(route))
    try:
        with page.expect_request(endpoint) as sent:
            page.get_by_role('button', name='Записаться на игру').click()
        expect(page.locator('#join-form')).to_have_attribute('aria-busy', 'true')
        assert sent.value.post_data_json['evening_id'] == 'e20'
        page.locator('[data-evening-id="e13"] > summary').click()
        expect(page.locator('#join-evening .join-heading')).to_have_text('Пятница, 20 ноября · 19:00')
        pending.pop(0).fulfill(status=503, content_type='application/json', body='{"error":"Попробуй позже"}')
        expect(page.locator('#join-error')).to_contain_text('Попробуй позже')
        expect(page.get_by_role('button', name='Записаться на игру')).to_be_enabled()
        expect(page.get_by_label('Имя пользователя в Telegram')).to_have_value('@calendar_test')
        # Only the first response needs to stay pending. Let the retry receive
        # its response through the route handler, regardless of browser timing.
        page.unroute(endpoint)
        page.route(endpoint, lambda route: route.fulfill(
            status=200, content_type='application/json', body='{"ok":true,"booked":false}'))
        page.get_by_role('button', name='Записаться на игру').click()
        expect(page.locator('#join-result')).to_contain_text('Заявка получена')
        expect(page.locator('#join-result')).to_contain_text('Место пока не подтверждено')
        expect(page.locator('#join-result')).not_to_contain_text('Ты в списке')
        filters.get_by_role('button', name='Клубные', exact=True).click()
        expect(page.locator('#join')).to_be_hidden()
        filters.get_by_role('button', name='Для новичков', exact=True).click()
        expect(page.locator('#join-result')).to_be_visible()
        expect(page.locator('#join-result')).to_contain_text('Заявка получена')
    finally:
        page.unroute(endpoint)

    welcome_endpoint = '**/api/public/welcome'
    custom = dict(EVENINGS[2], price='450 ₽ за игру')
    page.route(welcome_endpoint, lambda route: route.fulfill(content_type='application/json',
               body=json.dumps({'evening': dict(EVENINGS[0], price=PRICE), 'evenings': EVENINGS[:2] + [custom]})))
    try:
        page.goto(origin + 'igry/?evening=e27')
        expect(page.locator('#join-evening .join-heading')).to_have_text('Пятница, 27 ноября · 19:00')
        expect(page.locator('.calendar-day:has([data-evening-id="e27"]) #join')).to_be_visible()
        expect(page.locator('#join-evening')).to_contain_text('450 ₽ за игру')
    finally:
        page.unroute(welcome_endpoint)

    agenda_endpoint = '**/api/public/welcome/agenda'
    page.route(agenda_endpoint, lambda route: route.abort())
    try:
        page.goto(origin + 'igry/')
        page.get_by_role('button', name='Показать все даты', exact=True).click()
        expect(page.locator('.calendar-event')).to_have_count(3)
        page.locator('[data-evening-id="e27"] > summary').click()
        expect(page.locator('#join-evening .join-heading')).to_have_text('Пятница, 27 ноября · 19:00')
        page.route(welcome_endpoint, lambda route: route.abort())
        try:
            page.goto(origin + 'igry/')
            expect(page.locator('#join-root')).to_contain_text('Расписание сейчас не загрузилось')
            expect(page.locator('#agenda')).not_to_contain_text('Загружаем')
            expect(page.locator('#agenda a')).to_have_attribute('href', 'https://t.me/Chagina7x')
        finally:
            page.unroute(welcome_endpoint)
    finally:
        page.unroute(agenda_endpoint)

    page.goto(origin)
    page.goto(origin + 'igry/#join')
    expect(page.locator('#join')).to_be_visible()
    expect(page.locator('#join-evening .join-heading')).to_have_text('Пятница, 13 ноября · 19:00')
    expect(page.locator('#join-evening .join-heading')).to_be_focused()

    # A missing public roster stays a short action, with no fake empty seats
    # or error cards in the closed schedule. Booking remains available.
    seats_endpoint = '**/api/public/welcome/seats?*'
    page.route(seats_endpoint, lambda route: route.abort())
    try:
        page.goto(origin)
        page.goto(origin + 'igry/')
        failed = page.locator('[data-roster-evening="e13"]')
        expect(failed).to_be_hidden()
        expect(page.locator('#agenda')).not_to_contain_text('Состав сейчас не загрузился')
        page.locator('[data-evening-id="e13"] > summary').click()
        expect(failed).to_contain_text('Список участников можно уточнить у организатора')
        expect(failed.locator('.roster-person')).to_have_count(0)
        expect(page.get_by_label('Имя', exact=True)).to_be_visible()
        page.unroute(seats_endpoint)
        failed.get_by_role('button', name='Обновить список', exact=True).click()
        expect(failed.locator('.roster-person')).to_have_count(1)
        expect(failed).to_contain_text('Игрок')
    finally:
        page.unroute(seats_endpoint)

    context = browser.new_context(java_script_enabled=False, viewport={'width': 390, 'height': 844})
    try:
        fallback = context.new_page()
        fallback.goto(origin + 'igry/')
        expect(fallback.locator('#agenda noscript a').last).to_have_attribute('href', 'https://t.me/Chagina7x')
        expect(fallback.locator('#agenda noscript')).to_be_visible()
        expect(fallback.locator('.js-status').first).to_be_hidden()
    finally:
        context.close()


def check_club_preview(page, origin):
    page.evaluate("Object.keys(localStorage).filter(key => key.startsWith('club_public_v1:')).forEach(key => localStorage.removeItem(key))")
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



def check_guest_booking(browser, origin):
    context = browser.new_context(viewport={'width': 390, 'height': 844}, reduced_motion='reduce')
    context.add_init_script(INIT)
    page = context.new_page()
    state = {'id': 'e13', 'fail': False, 'token': '', 'writes': 0}
    page.route('**/api/public/welcome', lambda route: route.fulfill(json={'booking_management': True, 'evening': dict(EVENINGS[0], price=PRICE), 'evenings': EVENINGS}))
    def lead(route):
        state['token'] = route.request.headers['authorization'].removeprefix('Bearer ')
        route.fulfill(json={'ok': True, 'booked': True, 'management_token': state['token']})
    def booking(route):
        assert route.request.headers['authorization'] == 'Bearer ' + state['token']
        if route.request.method == 'POST':
            state['writes'] += 1
            if state['fail']:
                state['fail'] = False
                route.fulfill(status=500, json={'error': 'Не получилось перенести запись. Попробуй ещё раз.'})
                return
            payload = route.request.post_data_json
            state['id'] = None if payload['action'] == 'cancel' else payload['evening_id']
        event = next((dict(item, status='published') for item in EVENINGS if item['id'] == state['id']), None)
        route.fulfill(json={'ok': True, 'name': '<b>Аня</b>', 'evening': event, 'booked': bool(event), 'can_change': True, 'can_cancel': bool(event), 'games': []})
    page.route('**/api/public/welcome/lead', lead)
    page.route('**/api/public/welcome/booking', booking)
    page.goto(origin + 'igry/')
    page.locator('[data-evening-id="e13"] > summary').click()
    page.locator('#join-name').fill('Аня')
    page.locator('#join-contact').fill('@anna_booking')
    page.locator('#join-form button[type=submit]').click()
    expect(page.locator('#join-result')).to_contain_text('Ты в списке')
    page.locator('#join-result a.primary-button').click()
    expect(page.locator('#booking-management')).to_contain_text('Запись подтверждена')
    expect(page.locator('.booking-manage-details b')).to_have_count(0)
    page.locator('#booking-change').click()
    page.locator('#booking-next-date').select_option('e20')
    state['fail'] = True
    page.locator('#booking-change-form button[type=submit]').click()
    expect(page.locator('.booking-manage-feedback')).to_contain_text('Не получилось перенести')
    assert state['id'] == 'e13'
    expect(page.locator('#booking-next-date')).to_have_value('e20')
    page.locator('#booking-change-form button[type=submit]').click()
    expect(page.locator('.booking-manage-feedback')).to_contain_text('Запись подтверждена')
    assert state['id'] == 'e20'
    page.locator('#booking-cancel').click()
    page.locator('#booking-cancel-no').click()
    assert state['writes'] == 2
    page.locator('#booking-cancel').click()
    page.locator('#booking-cancel-yes').click()
    expect(page.locator('.booking-manage-feedback')).to_contain_text('Запись отменена')
    page.reload()
    page.locator('#booking-management-link').click()
    expect(page.locator('#booking-management')).to_contain_text('Сейчас нет активной записи')
    context.clear_cookies()
    page.evaluate('localStorage.clear()')
    page.goto(origin + 'igry/#booking=' + state['token'])
    expect(page.locator('#booking-management')).to_contain_text('Сейчас нет активной записи')
    assert state['token'] not in page.url
    assert page.evaluate('document.documentElement.scrollWidth') <= 390
    context.close()


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
        check_home_story(browser, page, origin)
        check_account_navigation(browser, origin)
        check_cover_photos(page, origin)
        check_auto_photos(browser, origin)
        check_club_preview(page, origin)
        check_gallery(page, origin)
        check_interior(browser, page, origin)
        check_form(page, origin, server)
        check_booking(browser, page, origin)
        check_guest_booking(browser, origin)
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
