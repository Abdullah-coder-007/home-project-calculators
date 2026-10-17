"""Renders src/assets/favicon.svg as a 512x512 PNG logo (used in Organization structured data).
Run once after changing the favicon: python3 scripts/logo.py"""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
svg = (ROOT / "src/assets/favicon.svg").read_text()
html = f"""<html><body style="margin:0;background:#fff;width:512px;height:512px;display:grid;place-items:center">
<div style="width:440px;height:440px">{svg.replace('<svg ', '<svg width="440" height="440" ', 1)}</div></body></html>"""
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 512, "height": 512})
    pg.set_content(html)
    pg.screenshot(path=str(ROOT / "src/assets/logo.png"))
    b.close()
print("wrote src/assets/logo.png")
