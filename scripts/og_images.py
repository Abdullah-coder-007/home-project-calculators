#!/usr/bin/env python3
"""
Makes 1200x630 share images (Google Discover, Pinterest, Facebook, WhatsApp)
for the homepage, every calculator and every blog category.

  python3 scripts/og_images.py

Writes JPEGs to src/assets/og/. Needs Playwright with Chromium. Run it again
after adding a calculator or category; build.py only copies the results.
"""
import base64
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import iso  # noqa: E402

OUT = ROOT / "src/assets/og"
FONTS = ROOT / "scripts/fonts"
CFG = json.loads((ROOT / "site.json").read_text())


def font_face(name, file):
    data = base64.b64encode((FONTS / file).read_bytes()).decode()
    return f"@font-face{{font-family:'{name}';src:url(data:font/ttf;base64,{data}) format('truetype');font-weight:100 900;}}"


CSS = font_face("Brico", "BricolageGrotesque.ttf") + font_face("Jakarta", "PlusJakartaSans.ttf") + """
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;overflow:hidden;font-family:Jakarta,sans-serif;color:#fff;
  background:radial-gradient(520px 360px at 92% 105%,rgba(255,255,255,.28),transparent 70%),
             radial-gradient(400px 300px at 0% 0%,rgba(255,255,255,.22),transparent 70%),
             linear-gradient(125deg,var(--a),var(--b));}
.card{position:absolute;inset:0;display:grid;grid-template-columns:1fr 470px;align-items:center;padding:60px 64px}
.kicker{display:inline-block;font-weight:800;font-size:26px;padding:10px 20px;border-radius:999px;background:rgba(0,0,0,.18);margin-bottom:26px}
h1{font-family:Brico;font-weight:800;font-size:86px;line-height:.98;letter-spacing:-1.5px;text-shadow:0 5px 0 rgba(0,0,0,.14)}
p{font-size:32px;line-height:1.3;margin-top:22px;max-width:620px;opacity:.95;font-weight:600}
.art svg{width:470px;height:470px;filter:drop-shadow(0 30px 26px rgba(0,0,0,.28))}
.art.wide svg{width:520px;height:auto}
.brand{position:absolute;left:64px;bottom:40px;display:flex;align-items:center;gap:14px;font-family:Brico;font-weight:800;font-size:34px}
.mark{width:46px;height:46px;border-radius:13px;background:linear-gradient(135deg,#ffc93c,#ff7a59 55%,#f2367c);box-shadow:0 5px 0 rgba(0,0,0,.25);position:relative}
.mark:after{content:"";position:absolute;left:9px;right:9px;top:13px;height:11px;background:repeating-linear-gradient(90deg,rgba(42,32,0,.7) 0 3px,transparent 3px 7px)}
.blob{position:absolute;border-radius:50%;background:rgba(255,255,255,.13)}
"""


def page(a, b, kicker, title, sub, art, wide=False):
    return f"""<html><head><style>:root{{--a:{a};--b:{b}}}{CSS}</style></head><body>
<div class="blob" style="width:340px;height:340px;right:-90px;top:-140px"></div>
<div class="blob" style="width:180px;height:180px;left:44%;bottom:-100px"></div>
<div class="card"><div><span class="kicker">{kicker}</span><h1>{title}</h1><p>{sub}</p></div>
<div class="art{' wide' if wide else ''}">{art}</div></div>
<div class="brand"><span class="mark"></span>{CFG['name']}</div></body></html>"""


def jobs():
    tools = [json.loads((ROOT / f"src/tools/{s}/meta.json").read_text()) | {"slug": s} for s in CFG["tools"]]
    yield "home", page("#6c4cf5", "#f2367c", f"{len(tools)} free calculators", "Know how much to buy",
                       "Paint, drywall, flooring, concrete, decks, roofs and more", iso.hero_scene(), wide=True)
    for t in tools:
        a, b, _, _ = iso.ACCENTS[t["tool"]]
        yield t["slug"], page(a, b, "Free calculator", t["short"].replace(" calculator", ""), t["what"], iso.tool_icon(t["tool"]))
    for key, label in CFG["categories"]:
        members = [t for t in tools if t.get("category") == key]
        if not members:
            continue
        a, b, _, _ = iso.ACCENTS[members[0]["tool"]]
        yield f"blog-{key}", page(a, b, "Guides", label, "Plans, tips and what to buy for your next project",
                                  iso.tool_icon(members[0]["tool"]))


def main():
    from playwright.sync_api import sync_playwright
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        pg = browser.new_page(viewport={"width": 1200, "height": 630})
        n = 0
        for name, html in jobs():
            pg.set_content(html)
            pg.wait_for_timeout(60)
            pg.screenshot(path=str(OUT / f"{name}.jpg"), type="jpeg", quality=84)
            n += 1
        browser.close()
    print(f"Wrote {n} share images to {OUT.relative_to(ROOT)}/")


if __name__ == "__main__":
    main()
