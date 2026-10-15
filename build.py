#!/usr/bin/env python3
"""
Builds the ProjectMath static site from src/ into docs/ (served by GitHub Pages).

  python3 build.py

Settings live in site.json:
  base_url        the public address, no trailing slash
  custom_domain   e.g. "projectmath.com" once bought (writes docs/CNAME)
  contact_email   shown on the contact, privacy and terms pages
  adsense_client  e.g. "ca-pub-1234567890123456" once AdSense approves you
  *_verification  Google Search Console / Bing Webmaster meta tags

Each calculator is a folder in src/tools/<slug>/ with:
  meta.json   title, description, h1, lede, faq, related
  form.html   the inputs (inside the calculator form)
  guide.html  the how-to article under the calculator
"""
import datetime
import hashlib
import html
import json
import re
import shutil
import sys
from pathlib import Path

import iso

ROOT = Path(__file__).parent
SRC = ROOT / "src"
OUT = ROOT / "docs"
CFG = json.loads((ROOT / "site.json").read_text())
TODAY = datetime.date.today().isoformat()

BASE = CFG["base_url"].rstrip("/")
if CFG.get("custom_domain"):
    BASE = "https://" + CFG["custom_domain"].strip().rstrip("/")

warnings = []


def esc(s):
    return html.escape(str(s), quote=True)


def asset_hash(path):
    return hashlib.sha1(path.read_bytes()).hexdigest()[:10]


def fill(text):
    """Replace {{site.x}} placeholders in page content."""
    email = CFG.get("contact_email") or ""
    email_html = f'<a href="mailto:{esc(email)}">{esc(email)}</a>' if email else "the address on our contact page"
    repl = {
        "site.name": esc(CFG["name"]),
        "site.owner": esc(CFG["owner_name"]),
        "site.email": email_html,
        "site.url": esc(BASE + "/"),
        "today": datetime.date.today().strftime("%B %-d, %Y"),
    }
    return re.sub(r"\{\{\s*([\w.]+)\s*\}\}", lambda m: repl.get(m.group(1), m.group(0)), text)


TOOL_LINKS = []  # (slug, short name, color), filled in main()


def nav_html(prefix, current):
    links = [("", "All calculators"), ("how-we-calculate/", "How we calculate"), ("about/", "About")]
    out = []
    for href, label in links:
        cur = ' aria-current="page"' if href == current else ""
        out.append(f'<a href="{prefix}{href or "./"}"{cur}>{label}</a>')
    return "".join(out)


def page(*, path, title, description, body, schema=None, current=None, noindex=False, prefix=None, accent="violet"):
    depth = path.count("/")  # "" -> 0, "paint-calculator/" -> 1
    if prefix is None:
        prefix = "../" * depth
    canonical = f"{BASE}/{path}"
    css_v = asset_hash(SRC / "assets/css/site.css")
    js_v = "".join(asset_hash(SRC / f"assets/js/{n}.js") for n in ("formulas", "tools", "app"))[:10]

    verif = ""
    if CFG.get("google_site_verification"):
        verif += f'<meta name="google-site-verification" content="{esc(CFG["google_site_verification"])}">\n'
    if CFG.get("bing_site_verification"):
        verif += f'<meta name="msvalidate.01" content="{esc(CFG["bing_site_verification"])}">\n'

    ads = ""
    if CFG.get("adsense_client"):
        client = esc(CFG["adsense_client"])
        ads = (f'<meta name="google-adsense-account" content="{client}">\n'
               "<script>if(!document.documentElement.classList.contains('embed')){var s=document.createElement('script');"
               f"s.async=true;s.src='https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client={client}';"
               "s.crossOrigin='anonymous';document.head.appendChild(s);}</script>\n")

    ld = ""
    for block in schema or []:
        ld += '<script type="application/ld+json">' + json.dumps(block, ensure_ascii=False) + "</script>\n"

    robots = '<meta name="robots" content="noindex">\n' if noindex else ""
    footer_links = "".join(
        f'<a href="{prefix}{p}/">{label}</a>'
        for p, label in [("about", "About"), ("contact", "Contact"), ("how-we-calculate", "How we calculate"),
                         ("privacy-policy", "Privacy policy"), ("terms", "Terms of use")]
    )
    return f"""<!doctype html>
<html lang="en-US">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script>if(/[?&]embed=1(&|$)/.test(location.search))document.documentElement.classList.add('embed');</script>
<title>{esc(title)}</title>
<meta name="description" content="{esc(description)}">
<link rel="canonical" href="{esc(canonical)}">
{robots}<meta property="og:type" content="website">
<meta property="og:site_name" content="{esc(CFG['name'])}">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(description)}">
<meta property="og:url" content="{esc(canonical)}">
<meta name="twitter:card" content="summary">
<meta name="theme-color" content="#6c4cf5">
<link rel="icon" href="{prefix}assets/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="{prefix}assets/css/site.css?v={css_v}">
{verif}{ads}{ld}</head>
<body data-accent="{accent}">
<a class="skip" href="#main">Skip to content</a>
<header class="site-head"><div class="wrap">
<a class="brand" href="{prefix or './'}"><span class="brand-mark" aria-hidden="true"></span>{esc(CFG['name'])}</a>
<button class="menu-btn" type="button" aria-expanded="false" aria-controls="site-menu"><span class="menu-icon" aria-hidden="true"></span>Menu</button>
<nav id="site-menu" class="site-nav" aria-label="Main">{nav_html(prefix, current)}<span class="menu-tools">{"".join(f'<a href="{prefix}{slug}/" data-accent="{color}"><span class="menu-dot" aria-hidden="true"></span>{esc(name)}</a>' for slug, name, color in TOOL_LINKS)}</span></nav>
</div></header>
<main id="main" class="wrap">
{body}
</main>
<footer class="site-foot"><div class="wrap">
<nav aria-label="Site">{footer_links}</nav>
<p>Estimates only. Always check quantities with your supplier and the product label before you buy.</p>
<p>&copy; {datetime.date.today().year} {esc(CFG['name'])}</p>
</div></footer>
<script src="{prefix}assets/js/formulas.js?v={js_v}" defer></script>
<script src="{prefix}assets/js/tools.js?v={js_v}" defer></script>
<script src="{prefix}assets/js/app.js?v={js_v}" defer></script>
</body>
</html>
"""


RESULT_PANEL = """<a class="result-peek" href="#result" hidden><span class="peek-value">0</span> <span class="peek-unit"></span><span class="peek-go">See shopping list</span></a>
<aside class="result" id="result" aria-label="Result">
<div class="result-figure is-empty" aria-live="polite">
<p class="result-label">You need</p>
<div class="result-line"><span class="result-value">0</span><span class="result-unit"></span></div>
<p class="result-sub"></p>
</div>
<div class="result-body">
<div class="shop" hidden>
<h3>Shopping list</h3>
<table class="shop-list">
<thead><tr><th scope="col">Item</th><th scope="col">Qty</th><th scope="col">Price each</th><th scope="col" class="sub">Cost</th></tr></thead>
<tbody></tbody>
<tfoot><tr><th scope="row" colspan="3">Estimated total</th><td class="shop-total">$0.00</td></tr></tfoot>
</table>
<p class="price-hint">Prices are rough US starting points. Type your store's prices to update the total; this device remembers them.</p>
<div class="actions">
<button type="button" class="btn" data-action="print">Print list</button>
<button type="button" class="btn btn-quiet" data-action="copy">Copy list</button>
<button type="button" class="btn btn-quiet" data-action="share">Share this result</button>
</div>
</div>
<ul class="result-notes" hidden></ul>
</div>
</aside>"""


def load_tool(slug):
    d = SRC / "tools" / slug
    meta = json.loads((d / "meta.json").read_text())
    meta["slug"] = slug
    meta["form"] = (d / "form.html").read_text()
    meta["guide"] = fill((d / "guide.html").read_text())
    return meta


def tool_page(t, all_tools):
    path = f"{t['slug']}/"
    url = f"{BASE}/{path}"
    faq_html = "".join(
        f"<details><summary>{esc(q['q'])}</summary><p>{q['a']}</p></details>" for q in t.get("faq", [])
    )
    related = [x for x in all_tools if x["slug"] in t.get("related", [])] or [x for x in all_tools if x["slug"] != t["slug"]][:3]
    related_html = "".join(
        f'<li data-accent="{r["tool"]}"><a href="../{r["slug"]}/"><span class="mini-art">{iso.tool_icon(r["tool"])}</span>'
        f'<span><strong>{esc(r["short"])}</strong><span class="t-what">{esc(r["what"])}</span></span></a></li>' for r in related)
    embed_code = (f'<iframe src="{url}?embed=1" title="{esc(t["h1"])}" width="100%" height="900" '
                  f'style="border:0;max-width:720px" loading="lazy"></iframe>\n'
                  f'<p><a href="{url}">{esc(t["h1"])}</a> by {esc(CFG["name"])}</p>')

    # "On this page" links built from the guide's h2 headings
    toc, used = [], set()

    def add_id(m):
        text = re.sub(r"<[^>]+>", "", m.group(1))
        slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:48]
        while slug in used:
            slug += "-2"
        used.add(slug)
        toc.append((slug, text))
        return f'<h2 id="{slug}">{m.group(1)}</h2>'
    guide_html = re.sub(r"<h2>(.*?)</h2>", add_id, t["guide"])
    toc.append(("questions", "Common questions"))
    toc_html = "".join(f'<li><a href="#{a}">{x}</a></li>' for a, x in toc)

    body = f"""<section class="tool-head">
<div class="tool-head-text">
<p class="crumbs"><a href="../">All calculators</a> / {esc(t['short'])}</p>
<h1>{esc(t['h1'])}</h1>
<p class="lede">{t['lede']}</p>
</div>
<div class="tool-head-art">{iso.tool_icon(t['tool'])}</div>
</section>
<div class="tool-grid">
<form id="calc" class="calc" data-tool="{esc(t['tool'])}" novalidate>
<h2>Your project</h2>
{t['form']}
</form>
{RESULT_PANEL}
</div>
<p class="embed-credit"><a href="{url}" target="_blank" rel="noopener">{esc(t['h1'])}</a> by {esc(CFG['name'])}</p>
<article class="guide">
<nav class="toc" aria-label="On this page"><p class="toc-title">On this page</p><ol>{toc_html}</ol></nav>
{guide_html}
<section class="faq"><h2 id="questions">Common questions</h2>{faq_html}</section>
<section class="related"><h2>Related calculators</h2><ul class="related-list">{related_html}</ul></section>
</article>
<section class="embed-box">
<h2>Add this calculator to your site</h2>
<p>Free for blogs and contractors. Copy the code into any page that accepts HTML.</p>
<label class="field"><span>Embed code</span><textarea id="embed-code" readonly>{esc(embed_code)}</textarea></label>
<button type="button" class="btn btn-quiet" data-action="copy-embed">Copy embed code</button>
</section>"""

    schema = [
        {"@context": "https://schema.org", "@type": "WebApplication", "name": t["h1"], "url": url,
         "description": t["description"], "applicationCategory": "UtilitiesApplication", "operatingSystem": "Any",
         "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"}},
        {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "All calculators", "item": BASE + "/"},
            {"@type": "ListItem", "position": 2, "name": t["short"], "item": url}]},
    ]
    if t.get("faq"):
        schema.append({"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
            {"@type": "Question", "name": q["q"],
             "acceptedAnswer": {"@type": "Answer", "text": re.sub(r"<[^>]+>", "", q["a"])}} for q in t["faq"]]})
    return page(path=path, title=t["title"], description=t["description"], body=body, schema=schema, accent=t["tool"])


def home_page(tools):
    cards = "".join(
        f'<li class="tool-card" data-accent="{t["tool"]}"><a href="{t["slug"]}/">'
        f'<span class="card-art">{iso.tool_icon(t["tool"])}</span>'
        f'<span class="card-body"><span class="t-name">{esc(t["short"])}</span>'
        f'<span class="t-what">{esc(t["what"])}</span>'
        f'<span class="card-go">Open calculator</span></span></a></li>' for t in tools)
    body = f"""<section class="home-hero">
<div class="hero-text">
<h1>Know how much to buy before you drive to the store.</h1>
<p class="lede">Free calculators for paint, concrete, tile, flooring and mulch. Enter your measurements and get exact quantities, a shopping list and a cost estimate you can print.</p>
<div class="hero-actions"><a class="btn" href="paint-calculator/">Start with paint</a><a class="btn btn-ghost" href="#tools">See all calculators</a></div>
</div>
<div class="hero-art-wrap">{iso.hero_scene()}</div>
</section>
<h2 class="section-title" id="tools">Pick your project</h2>
<ul class="tool-cards">{cards}</ul>
<section class="home-notes">
<div class="note" data-accent="tile"><span class="note-dot" aria-hidden="true"></span><h2>Odd-shaped rooms work</h2><p>Add L-shapes, triangles and circles, and subtract islands or built-ins. Most calculators only handle simple rectangles.</p></div>
<div class="note" data-accent="flooring"><span class="note-dot" aria-hidden="true"></span><h2>Waste is built in</h2><p>Every result includes extra for cuts, spills and breakage, using the allowances pros use. You can change it.</p></div>
<div class="note" data-accent="paint"><span class="note-dot" aria-hidden="true"></span><h2>Every formula is public</h2><p>See exactly how each number is worked out on our <a href="how-we-calculate/">How we calculate</a> page.</p></div>
</section>"""
    schema = [{"@context": "https://schema.org", "@type": "WebSite", "name": CFG["name"], "url": BASE + "/",
               "description": CFG["tagline"]}]
    return page(path="", title=f"{CFG['name']}: Home Project Material Calculators",
                description="Free paint, concrete, tile, flooring and mulch calculators. Get exact quantities, a shopping list and a cost estimate for your home project.",
                body=body, schema=schema, current="")


def plain_page(slug):
    raw = (SRC / "pages" / f"{slug}.html").read_text()
    m = re.match(r"\s*<!--\s*(\{.*?\})\s*-->\s*", raw, re.S)
    meta = {k: html.unescape(fill(v)) for k, v in json.loads(m.group(1)).items()}
    content = fill(raw[m.end():])
    body = (f'<section class="tool-head page-head"><div class="tool-head-text">'
            f'<p class="crumbs"><a href="../">All calculators</a> / {esc(meta["h1"])}</p>'
            f'<h1>{esc(meta["h1"])}</h1></div></section>\n<article class="page">\n{content}\n</article>')
    return page(path=f"{slug}/", title=f"{meta['title']} | {CFG['name']}", description=meta["description"],
                body=body, current=f"{slug}/")


def main():
    tools = [load_tool(s) for s in CFG["tools"]]
    TOOL_LINKS[:] = [(t["slug"], t["short"], t["tool"]) for t in tools]
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir()
    shutil.copytree(SRC / "assets", OUT / "assets")

    (OUT / "index.html").write_text(home_page(tools))
    urls = [("", "1.0")]
    for t in tools:
        d = OUT / t["slug"]
        d.mkdir()
        (d / "index.html").write_text(tool_page(t, tools))
        urls.append((t["slug"] + "/", "0.9"))
    for p in CFG["pages"]:
        d = OUT / p
        d.mkdir()
        (d / "index.html").write_text(plain_page(p))
        urls.append((p + "/", "0.3"))

    body404 = '<div class="page"><h1>That page isn\'t here</h1><p>The link may be old or mistyped. Pick a calculator from the <a href="' + BASE + '/">full list</a>.</p></div>'
    # 404 can be served at any depth, so it uses absolute links.
    (OUT / "404.html").write_text(page(path="404.html", title=f"Page not found | {CFG['name']}",
                                       description="Page not found.", body=body404, noindex=True,
                                       prefix=BASE + "/"))

    sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for u, pr in urls:
        sm.append(f"<url><loc>{BASE}/{u}</loc><lastmod>{TODAY}</lastmod><priority>{pr}</priority></url>")
    sm.append("</urlset>")
    (OUT / "sitemap.xml").write_text("\n".join(sm) + "\n")
    (OUT / "robots.txt").write_text(f"User-agent: *\nAllow: /\n\nSitemap: {BASE}/sitemap.xml\n")
    (OUT / ".nojekyll").write_text("")

    if CFG.get("custom_domain"):
        (OUT / "CNAME").write_text(CFG["custom_domain"].strip() + "\n")
    if CFG.get("adsense_client"):
        pub = CFG["adsense_client"].replace("ca-", "")
        (OUT / "ads.txt").write_text(f"google.com, {pub}, DIRECT, f08c47fec0942fa0\n")

    if not CFG.get("contact_email"):
        warnings.append("contact_email is empty: add one before applying to AdSense.")
    for w in warnings:
        print("WARNING:", w, file=sys.stderr)
    print(f"Built {len(urls)} pages into {OUT.relative_to(ROOT)}/ for {BASE}/")


if __name__ == "__main__":
    main()
