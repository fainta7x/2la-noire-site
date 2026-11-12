"""Build self-contained Pages HTML so each document carries its own CSS and JS."""

import argparse
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGES = ('index.html', 'igry/index.html', 'novichkam/index.html', 'pravila/index.html', 'foto/index.html', 'rating/index.html', 'klubnye-igry/index.html', 'sezony/index.html', 'turniry/index.html', 'blog/index.html')
STYLES = ('site.css', 'join.css', 'pages.css')
SCRIPTS = ('welcome.js', 'join.js', 'cms.js', 'account.js', 'gallery.js', 'home.js')
LEGACY = (*STYLES, 'welcome.js', 'join.js', 'cms.js', 'account.js')
PUBLIC = ('CNAME', 'robots.txt', 'sitemap.xml', 'hero-table.jpg', 'yandex_c46be070f2d80f16.html')

STYLESHEET = re.compile(r'<link rel="stylesheet" href="/([\w.-]+\.css)">')
DEFERRED = re.compile(r'[ \t]*<script src="/([\w.-]+\.js)" defer></script>\n?')


def inline_asset(name, allowed, tag):
    if name not in allowed:
        raise ValueError(f'Unexpected local asset: {name}')
    content = (ROOT / name).read_text(encoding='utf-8')
    if re.search(rf'</{tag}\b', content, re.IGNORECASE):
        raise ValueError(f'Closing {tag} tag inside {name}')
    return f'<{tag} data-source="{name}">\n{content.rstrip()}\n</{tag}>'


def build_page(path):
    html = (ROOT / path).read_text(encoding='utf-8')
    route = '/' + path.removesuffix('index.html')
    for name in ('header', 'footer'):
        fragment = (ROOT / 'includes' / f'{name}.html').read_text(encoding='utf-8').strip()
        if name == 'header' and route != '/':
            fragment = fragment.replace(f'href="{route}"', f'href="{route}" aria-current="page"')
        marker = f'<!-- include: {name} -->'
        if html.count(marker) != 1:
            raise ValueError(f'Expected one {name} marker in {path}')
        html = html.replace(marker, fragment)
    html = STYLESHEET.sub(lambda match: inline_asset(match[1], STYLES, 'style'), html)
    scripts = []
    for match in DEFERRED.finditer(html):
        scripts.append(inline_asset(match[1], SCRIPTS, 'script'))
    html = DEFERRED.sub('', html)
    if scripts:
        html = html.replace('</body>', '\n'.join(scripts) + '\n</body>', 1)
    if re.search(r'<(?:link[^>]+rel="stylesheet"|script[^>]+src="[^"]+\.js")', html):
        raise ValueError(f'Unbundled CSS or JavaScript in {path}')
    return html


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    output = parser.parse_args().output
    output.mkdir(parents=True, exist_ok=True)
    for folder in ('img', 'fonts'):
        shutil.copytree(ROOT / folder, output / folder, dirs_exist_ok=True)
    # These URLs remain available for documents opened before the bundled release.
    for filename in PUBLIC:
        shutil.copy2(ROOT / filename, output / filename)
    for filename in LEGACY:
        shutil.copy2(ROOT / 'legacy' / filename, output / filename)
    for filename in PAGES:
        target = output / filename
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(build_page(filename), encoding='utf-8')


if __name__ == '__main__':
    main()
