"""Fetch only anonymous published results for the first page render.

An unavailable service preserves the last successful snapshot and its original
timestamp. Booking, availability and signed-in information never enter this file.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import time
from urllib.request import Request, urlopen

FIELDS = {'/rating': 'players', '/history': 'evenings', '/seasons': 'seasons', '/tournaments': 'tournaments'}
API = 'https://app.2lamafia.ru/api/public/welcome'
ROOT = Path(__file__).resolve().parents[1]

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    parser.add_argument('--fallback', type=Path, default=ROOT / 'data/public-results.json')
    args = parser.parse_args()
    existing = json.loads(args.fallback.read_text()) if args.fallback.exists() else {}

    def fetch(path):
        try:
            with urlopen(Request(API + path, headers={'Accept': 'application/json'}), timeout=12) as response:
                body = response.read(512 * 1024 + 1)
            if len(body) > 512 * 1024:
                raise ValueError('Public result payload too large')
            data = json.loads(body)
            if not isinstance(data.get(FIELDS[path]), list):
                raise ValueError('Unexpected public result response')
            print(path + ': loaded', flush=True)
            return path, {'savedAt': int(time.time() * 1000), 'data': data}
        except Exception as error:
            print(path + ': retaining previous snapshot (' + type(error).__name__ + ')', flush=True)
            return path, existing.get(path)

    with ThreadPoolExecutor(max_workers=2) as pool:
        data = {path: record for path, record in pool.map(fetch, FIELDS) if record}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')

if __name__ == '__main__':
    main()
