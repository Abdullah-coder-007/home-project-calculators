#!/usr/bin/env python3
"""
Builds the Calcupine static site from src/ into docs/ (served by Cloudflare).

  python3 build.py

Settings live in site.json:
  base_url        the public address, no trailing slash
  custom_domain   e.g. "projectmath.com" once bought (writes docs/CNAME)
  contact_email   shown on the contact, privacy and terms pages
  adsense_client  e.g. "ca-pub-1234567890123456" once AdSense approves you
  ga4_id          Google Analytics 4 measurement ID, e.g. "G-XXXXXXXXXX"
  *_verification  Google Search Console / Bing Webmaster meta tags

Each calculator is a folder in src/tools/<slug>/ with:
  meta.json   title, description, h1, lede, faq, related
  form.html   the inputs (inside the calculator form)
  guide.html  the how-to article under the calculator
"""
import datetime
import hashlib
import os
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

# STAGING=1 python3 build.py -> a private preview: hidden from search engines,
# no analytics or ads, and a banner on every page.
STAGING = os.environ.get("STAGING") == "1"
LAB = STAGING   # features still being tested (camera measuring, color visualizer) show on staging only
# While the app is in testing, staging links to the latest test build on GitHub.
APP_TEST_URL = "https://github.com/Abdullah-coder-007/home-project-calculators/releases/tag/app-latest"
if STAGING:
    CFG["ga4_id"] = ""
    CFG["adsense_client"] = ""


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
BLOG_POSTS = []  # filled in main() from content/blog/


def nav_html(prefix, current):
    links = [("", "All calculators")] + ([("blog/", "Guides")] if BLOG_POSTS else []) + [("how-we-calculate/", "How we calculate"), ("about/", "About")]
    out = []
    for href, label in links:
        cur = ' aria-current="page"' if href == current else ""
        out.append(f'<a href="{prefix}{href or "./"}"{cur}>{label}</a>')
    return "".join(out)


# Countries where visitors must opt in before analytics or ad cookies are set
# (EEA, UK, Switzerland). Google applies these defaults by the visitor's location.
CONSENT_REGIONS = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV",
                   "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO", "GB", "CH"]


def ga4_head():
    """Google Analytics 4 with Consent Mode v2. Off on embedded calculators."""
    gid = CFG.get("ga4_id")
    if not gid:
        return ""
    gid = esc(gid)
    regions = json.dumps(CONSENT_REGIONS)
    return ("<script>(function(){if(document.documentElement.classList.contains('embed'))return;"
            "window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;"
            "var no={ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied'};"
            f"gtag('consent','default',Object.assign({{region:{regions},wait_for_update:500}},no));"
            "gtag('consent','default',{ad_storage:'granted',ad_user_data:'granted',ad_personalization:'granted',analytics_storage:'granted'});"
            "var c=null;try{c=localStorage.getItem('pm:consent');}catch(e){}"
            "if(c==='granted')gtag('consent','update',{ad_storage:'granted',ad_user_data:'granted',ad_personalization:'granted',analytics_storage:'granted'});"
            "else if(c==='denied')gtag('consent','update',no);"
            f"gtag('js',new Date());gtag('config','{gid}');"
            f"var s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id={gid}';"
            "document.head.appendChild(s);})();</script>\n")


def page(*, path, title, description, body, schema=None, current=None, noindex=False, prefix=None, accent="violet",
         image="home", og_type="website", extra_head=""):
    depth = path.count("/")  # "" -> 0, "paint-calculator/" -> 1
    if prefix is None:
        prefix = "../" * depth
    canonical = f"{BASE}/{path}"
    css_v = asset_hash(SRC / "assets/css/site.css")
    js_v = "".join(asset_hash(SRC / f"assets/js/{n}.js") for n in ("formulas", "tools", "app", "measure"))[:10]
    measure_script = f'<script src="{prefix}assets/js/measure.js?v={js_v}" defer></script>\n' if LAB else ""

    verif = ""
    if CFG.get("google_site_verification"):
        verif += f'<meta name="google-site-verification" content="{esc(CFG["google_site_verification"])}">\n'
    if CFG.get("bing_site_verification"):
        verif += f'<meta name="msvalidate.01" content="{esc(CFG["bing_site_verification"])}">\n'
    if CFG.get("pinterest_domain_verify"):
        verif += f'<meta name="p:domain_verify" content="{esc(CFG["pinterest_domain_verify"])}">\n'

    ads = ""
    if CFG.get("adsense_client"):
        client = esc(CFG["adsense_client"])
        ads = (f'<meta name="google-adsense-account" content="{client}">\n'
               "<script>if(!document.documentElement.classList.contains('embed')){var s=document.createElement('script');"
               f"s.async=true;s.src='https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client={client}';"
               "s.crossOrigin='anonymous';document.head.appendChild(s);}</script>\n")

    analytics = ga4_head()
    app_url = CFG.get("measure_app_url") or (APP_TEST_URL if STAGING else "")
    measure_app = f' data-measure-app="{esc(app_url)}"' if app_url else ""

    ld = ""
    for block in schema or []:
        ld += '<script type="application/ld+json">' + json.dumps(block, ensure_ascii=False) + "</script>\n"

    # max-image-preview:large lets Google Discover show the big share image.
    robots = ('<meta name="robots" content="noindex">\n' if (noindex or STAGING)
              else '<meta name="robots" content="index, follow, max-image-preview:large">\n')
    og_image = image if image.startswith("http") else f"{BASE}/assets/og/{image}.jpg"
    footer_links = "".join(
        f'<a href="{prefix}{p}/">{label}</a>'
        for p, label in [("about", "About"), ("contact", "Contact"), ("how-we-calculate", "How we calculate"),
                         ("privacy-policy", "Privacy policy"), ("terms", "Terms of use")]
    ) + ('<button type="button" class="cookie-link" data-cookie-settings>Cookie choices</button>' if CFG.get("ga4_id") else "")
    return f"""<!doctype html>
<html lang="en-US">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script>if(/[?&]embed=1(&|$)/.test(location.search))document.documentElement.classList.add('embed');</script>
<title>{esc(title)}</title>
<meta name="description" content="{esc(description)}">
<link rel="canonical" href="{esc(canonical)}">
{robots}<meta property="og:type" content="{og_type}">
<meta property="og:site_name" content="{esc(CFG['name'])}">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(description)}">
<meta property="og:url" content="{esc(canonical)}">
<meta property="og:image" content="{esc(og_image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="{esc(og_image)}">
{extra_head}
<meta name="theme-color" content="#6c4cf5">
<link rel="icon" href="{prefix}assets/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"></noscript>
<link rel="stylesheet" href="{prefix}assets/css/site.css?v={css_v}">
<link rel="stylesheet" href="{prefix}assets/css/accents.css?v={css_v}">
{verif}{analytics}{ads}{ld}</head>
<body data-accent="{accent}"{measure_app}>
{'<div class="staging-bar">Staging preview: not the live site</div>' if STAGING else ''}<a class="skip" href="#main">Skip to content</a>
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
{measure_script}</body>
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
    meta["form"] = with_diagrams((d / "form.html").read_text())
    extra = d / "extra.html"
    meta["extra"] = extra.read_text() if extra.exists() else ""
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

    # Guide: the first section shows; the rest fold away (still on the page for search engines).
    used = set()

    def heading_id(text):
        slug = re.sub(r"[^a-z0-9]+", "-", re.sub(r"<[^>]+>", "", text).lower()).strip("-")[:48]
        while slug in used:
            slug += "-2"
        used.add(slug)
        return slug
    parts = re.split(r"<h2>(.*?)</h2>", t["guide"])
    guide_html = parts[0]
    for n in range(1, len(parts), 2):
        h, content = parts[n], parts[n + 1]
        if n == 1:
            # keep the short intro and formula; fold sub-parts like "Worked example"
            sub = re.split(r"<h3>(.*?)</h3>", content)
            content = sub[0] + "".join(
                f'<details class="fold"><summary><h3>{sub[k]}</h3></summary><div class="fold-body">{sub[k + 1]}</div></details>'
                for k in range(1, len(sub), 2))
            guide_html += f'<h2 id="{heading_id(h)}">{h}</h2>{content}'
        else:
            guide_html += (f'<details class="fold" id="{heading_id(h)}"><summary><h3>{h}</h3></summary>'
                           f'<div class="fold-body">{content}</div></details>')
    lede = re.sub(r"\s*The example[^.;]*[.;][^.]*\.?$", "", t["lede"]).strip()
    has_lengths = re.search(r'class="unit">(ft|in|sq ft)<', t['form'])
    measure_note = ('' if LAB or not has_lengths else
                    '<p class="measure-note">Need help measuring? Try your phone\u2019s AR measure app, then type the numbers in.</p>')
    extra = t.get("extra", "").replace("{{v}}", asset_hash(SRC / "assets/js/visualizer.js") if (SRC / "assets/js/visualizer.js").exists() else "") if LAB else ""

    body = f"""<section class="tool-head">
<div class="tool-head-text">
<p class="crumbs"><a href="../">All calculators</a> / {esc(t['short'])}</p>
<h1>{esc(t['h1'])}</h1>
<p class="lede">{lede}</p>
</div>
<div class="tool-head-art">{iso.tool_icon(t['tool'])}</div>
</section>
<div class="tool-grid">
<form id="calc" class="calc" data-tool="{esc(t['tool'])}" novalidate>
{UNITS_TOGGLE if has_lengths else ''}<h2>Your project</h2>
{measure_note}{t['form']}
</form>
{RESULT_PANEL}
</div>
{extra}
<p class="embed-credit"><a href="{url}" target="_blank" rel="noopener">{esc(t['h1'])}</a> by {esc(CFG['name'])}</p>
<article class="guide guide-compact">
{guide_html}
<section class="faq"><h2 id="questions">Common questions</h2>{faq_html}</section>
{guides_for(t["slug"], "../")}
<section class="related"><h2>Related calculators</h2><ul class="related-list">{related_html}</ul></section>
{author_line("../")}
</article>
<details class="embed-box fold">
<summary><h3>Add this calculator to your site</h3></summary>
<div class="fold-body">
<p>Free for blogs and contractors. Copy the code into any page that accepts HTML.</p>
<label class="field"><span>Embed code</span><textarea id="embed-code" readonly>{esc(embed_code)}</textarea></label>
<button type="button" class="btn btn-quiet" data-action="copy-embed">Copy embed code</button>
</div>
</details>"""

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
    return page(path=path, title=t["title"], description=t["description"], body=body, schema=schema, accent=t["tool"],
                image=t["slug"])


def home_page(tools):
    def card(t):
        return (f'<li class="tool-card" data-accent="{t["tool"]}"><a href="{t["slug"]}/">'
                f'<span class="card-art">{iso.tool_icon(t["tool"])}</span>'
                f'<span class="card-body"><span class="t-name">{esc(t["short"])}</span>'
                f'<span class="t-what">{esc(t["what"])}</span>'
                f'<span class="card-go">Open calculator</span></span></a></li>')
    groups = ""
    for key, label in CFG["categories"]:
        members = [t for t in tools if t.get("category") == key]
        if members:
            groups += f'<section class="tool-group"><h2 class="section-title" id="{key}">{esc(label)}</h2><ul class="tool-cards">{"".join(card(t) for t in members)}</ul></section>'
    jump = "".join(f'<a href="#{k}">{esc(l)}</a>' for k, l in CFG["categories"])
    why = [
        ("paint", "Calculator first, no clutter", "The calculator is the first thing on every page. No pop-ups, no autoplay video, no sign-up."),
        ("concrete", "Answers in store units", "Gallons and quarts, bags, boxes, sheets and bundles: the units you actually buy, not just square feet."),
        ("tile", "Real rooms, not just rectangles", "Add L-shapes, circles and triangles, and subtract islands or built-ins. Feet and inches, no converting."),
        ("flooring", "Waste is built in", "Each result adds the extra the trades plan for, and rounds up after the waste, so you don't run short."),
        ("mulch", "A shopping list you can print", "Quantities, editable prices and a total. Print it, copy it to your phone, or share a link to your exact result."),
        ("roofing", "Every formula is public", "We show how each number is worked out, test each calculator against worked examples, and link our sources."),
    ]
    why_html = "".join(
        f'<div class="note" data-accent="{a}"><span class="note-dot" aria-hidden="true"></span><h3>{esc(h)}</h3><p>{esc(p)}</p></div>'
        for a, h, p in why)
    body = f"""<section class="home-hero">
<div class="hero-text">
<h1>Know how much to buy before you drive to the store.</h1>
<p class="lede">{len(tools)} free calculators for paint, drywall, flooring, concrete, decks, fences, roofs and more. Enter your measurements and get exact quantities, a shopping list and a cost estimate you can print.</p>
<div class="hero-actions"><a class="btn" href="paint-calculator/">Start with paint</a><a class="btn btn-ghost" href="#walls">See all calculators</a></div>
</div>
<div class="hero-art-wrap">{iso.hero_scene()}</div>
</section>
<nav class="jump" aria-label="Calculator groups">{jump}</nav>
{groups}
{latest_guides_html("")}
<section class="why">
<h2 class="section-title">Why Calcupine</h2>
<p class="lede why-lede">Built to fix what people dislike about big calculator sites: clutter, confusing results and answers you can't check.</p>
<div class="home-notes">{why_html}</div>
</section>"""
    schema = [{"@context": "https://schema.org", "@type": "WebSite", "name": CFG["name"], "url": BASE + "/",
               "description": CFG["tagline"]},
              {"@context": "https://schema.org", "@type": "ItemList", "itemListElement": [
                  {"@type": "ListItem", "position": n + 1, "name": t["short"], "url": f"{BASE}/{t['slug']}/"} for n, t in enumerate(tools)]}]
    return page(path="", title=f"{CFG['name']}: Free Home Project Calculators",
                description=f"{len(tools)} free calculators for paint, drywall, flooring, tile, concrete, pavers, fences, decks, roofing, stairs and lawns. Exact quantities, shopping lists and costs.",
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


TOOLS_BY_SLUG = {}


UNITS_TOGGLE = ('<div class="units-toggle" role="group" aria-label="Units"><span class="units-label">Units</span>'
                '<button type="button" data-units="imperial" aria-pressed="true">ft &amp; in</button>'
                '<button type="button" data-units="metric" aria-pressed="false">m &amp; cm</button></div>')


def author_box(prefix):
    """Who wrote the guide on a calculator page, and how the numbers are checked."""
    name = CFG.get("guide_author") or CFG["owner_name"]
    bio = ((CFG.get("authors") or {}).get(name) or {}).get("bio") or CFG.get("owner_bio") or ""
    return (f'<section class="author-box"><span class="author-mark" aria-hidden="true"></span><div>'
            f'<p class="author-name">Guide by {esc(name)} \u00b7 Updated {datetime.date.today().strftime("%B %-d, %Y")}</p>'
            f'<p>{esc(bio)}</p>'
            f'<p>Every formula on this page is tested against hand-worked examples before it goes live. '
            f'<a href="{prefix}how-we-calculate/">How we calculate</a> \u00b7 <a href="{prefix}contact/">Report a mistake</a></p></div></section>')


MEASURE_TIPS = {
    "room": [("\u2194", "Length", "the longest wall, corner to corner"), ("\u2194", "Width", "the other wall, corner to corner"), ("\u2195", "Height", "floor to ceiling")],
    "slab": [("\u2194", "Length", "one edge, end to end"), ("\u2194", "Width", "the other edge, end to end"), ("\u2195", "Thickness", "how deep the concrete will be")],
    "footing": [("\u2194", "Total length", "add up every run of the footing or wall"), ("\u2194", "Width", "side to side"), ("\u2195", "Depth", "top to bottom")],
    "round": [("\u2194", "Diameter", "straight across the hole or form"), ("\u2195", "Depth", "top to bottom"), ("#", "Number", "how many holes or columns")],
    "square": [("\u2194", "Width", "one side of the column"), ("\u2195", "Height", "bottom to top"), ("#", "Number", "how many columns")],
    "steps": [("\u2195", "Rise", "height of one step"), ("\u2194", "Run", "depth of one step, front to back"), ("\u2194", "Width", "side to side")],
    "curb": [("\u2194", "Length", "along the curb"), ("\u2195", "Curb", "width and height of the raised part"), ("\u2194", "Gutter", "width and thickness of the flat pan")],
    "stairs": [("\u2195", "Total rise", "floor to the finished floor above"), ("\u2194", "Tread", "depth of each step"), ("\u2194", "Width", "side to side")],
    "roof": [("\u2194", "Length and width", "outside walls of the house"), ("\u2194", "Overhang", "how far the roof sticks out past the walls"), ("\u2197", "Pitch", "inches of rise per 12 inches across")],
}


def with_diagrams(html_text):
    """Replace <!-- diagram: name --> with three short "what to measure" lines."""
    def repl(m):
        tips = MEASURE_TIPS.get(m.group(1))
        if not tips:
            warnings.append(f"missing measuring tips {m.group(1)}")
            return ""
        items = "".join(f'<li><span class="mt-ico" aria-hidden="true">{i}</span><strong>{esc(a)}</strong> {esc(b)}</li>' for i, a, b in tips)
        return f'<ul class="measure-tips" aria-label="What to measure">{items}</ul>'
    return re.sub(r"<!--\s*diagram:\s*([\w-]+)\s*-->", repl, html_text)

def author_line(prefix):
    """One short line on calculator pages: who wrote it, when, and how to check it."""
    name = CFG.get("guide_author") or CFG["owner_name"]
    return (f'<p class="author-line">Guide by <strong>{esc(name)}</strong> \u00b7 Updated {datetime.date.today().strftime("%B %-d, %Y")} \u00b7 '
            f'Formulas tested against worked examples \u00b7 <a href="{prefix}how-we-calculate/">How we calculate</a> \u00b7 '
            f'<a href="{prefix}contact/">Report a mistake</a></p>')


def post_card(post, prefix):
    thumb = post["image_url"].replace("w=1600&h=900", "w=640&h=360")
    return (f'<li class="post-card" data-accent="{post["accent"]}"><a href="{prefix}{post["path"]}">'
            f'<span class="post-img"><img src="{esc(thumb)}" alt="" width="1200" height="630" loading="lazy"></span>'
            f'<span class="post-body"><span class="post-cat">{esc(post["category_label"])}</span>'
            f'<span class="post-title">{esc(post["title"])}</span>'
            f'<span class="post-desc">{esc(post["description"])}</span>'
            f'<span class="post-date">{post["date_human"]}</span></span></a></li>')


def latest_guides_html(prefix, limit=6):
    if not BLOG_POSTS:
        return ""
    cards = "".join(post_card(p, prefix) for p in BLOG_POSTS[:limit])
    return (f'<section class="latest"><h2 class="section-title">Latest guides</h2><ul class="post-cards">{cards}</ul>'
            f'<p class="more-link"><a class="btn btn-ghost" href="{prefix}blog/">All guides</a></p></section>')


def guides_for(tool_slug, prefix):
    posts = [p for p in BLOG_POSTS if tool_slug in p["calculators"]][:3]
    if not posts:
        return ""
    items = "".join(f'<li><a href="{prefix}{p["path"]}">{esc(p["title"])}</a> <span class="post-date">{p["date_human"]}</span></li>' for p in posts)
    return f'<section class="related"><h2>Guides for this project</h2><ul class="guide-links">{items}</ul></section>'


import blog  # noqa: E402


def main():
    tools = [load_tool(s) for s in CFG["tools"]]
    TOOL_LINKS[:] = [(t["slug"], t["short"], t["tool"]) for t in tools]
    TOOLS_BY_SLUG.update({t["slug"]: t for t in tools})
    def accent_for(cat):
        first = next((t for t in tools if t.get("category") == cat), None)
        return first["tool"] if first else "violet"
    BLOG_POSTS[:] = blog.load_posts(CFG, BASE, accent_for)
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir()
    shutil.copytree(SRC / "assets", OUT / "assets")
    (OUT / "assets/css/accents.css").write_text(iso.accents_css())

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

    urls += blog.build(OUT, tools, {"posts": BLOG_POSTS, "cfg": CFG, "base": BASE, "page": page,
                                    "post_card": post_card, "iso": iso, "tools_by_slug": TOOLS_BY_SLUG})

    body404 = '<div class="page"><h1>That page isn\'t here</h1><p>The link may be old or mistyped. Pick a calculator from the <a href="' + BASE + '/">full list</a>.</p></div>'
    # 404 can be served at any depth, so it uses absolute links.
    (OUT / "404.html").write_text(page(path="404.html", title=f"Page not found | {CFG['name']}",
                                       description="Page not found.", body=body404, noindex=True,
                                       prefix=BASE + "/"))

    sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for entry in urls:
        u, pr = entry[0], entry[1]
        lastmod = entry[2] if len(entry) > 2 else TODAY
        sm.append(f"<url><loc>{BASE}/{u}</loc><lastmod>{lastmod}</lastmod><priority>{pr}</priority></url>")
    sm.append("</urlset>")
    (OUT / "sitemap.xml").write_text("\n".join(sm) + "\n")
    (OUT / "robots.txt").write_text("User-agent: *\nDisallow: /\n" if STAGING else
                                    f"User-agent: *\nAllow: /\n\nSitemap: {BASE}/sitemap.xml\n")
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
