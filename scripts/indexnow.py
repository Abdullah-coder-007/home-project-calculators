"""Tells IndexNow search engines (Bing, Yandex, Seznam, Naver; Bing also feeds DuckDuckGo,
Yahoo and ChatGPT search) which pages are new or changed, so they recrawl within hours.

  python3 scripts/indexnow.py OLD_SITEMAP NEW_SITEMAP   # only new or changed pages
  python3 scripts/indexnow.py --all NEW_SITEMAP         # every page

Run by .github/workflows/indexnow.yml after each push to main. The key file
docs/<indexnow_key>.txt (written by build.py) proves we own calcupine.com.
"""
import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CFG = json.loads((ROOT / "site.json").read_text())


def entries(path):
    if not path or not Path(path).exists():
        return {}
    xml = Path(path).read_text()
    return {m.group(1): m.group(2) for m in re.finditer(r"<loc>([^<]+)</loc><lastmod>([^<]+)</lastmod>", xml)}


def main():
    args = sys.argv[1:]
    if args and args[0] == "--all":
        urls = list(entries(args[1]))
    else:
        old, new = entries(args[0]), entries(args[1])
        urls = [u for u, d in new.items() if old.get(u) != d]
    key = CFG.get("indexnow_key")
    if not urls or not key:
        print("Nothing to submit")
        return
    base = CFG["base_url"].rstrip("/")
    body = json.dumps({"host": base.split("//")[1], "key": key, "keyLocation": f"{base}/{key}.txt",
                       "urlList": urls[:10000]}).encode()
    req = urllib.request.Request("https://api.indexnow.org/indexnow", data=body,
                                 headers={"Content-Type": "application/json; charset=utf-8"})
    with urllib.request.urlopen(req, timeout=30) as r:
        print(f"IndexNow answered {r.status} for {len(urls)} URLs")
    for u in urls:
        print(" ", u)


if __name__ == "__main__":
    main()
