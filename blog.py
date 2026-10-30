"""
Blog ("Guides") for Calcupine.

Posts are Markdown files in content/blog/<category>/<slug>.md, where <category>
is one of the keys in site.json "categories" (walls, floors, concrete, outdoor,
structure). Each file starts with front matter:

    ---
    title: How to paint a room in a weekend
    description: One sentence that sells the click (shown in Google and Discover).
    date: 2026-11-02
    updated: 2026-11-10            # optional
    author: Abdullah               # optional, defaults to site.json owner_name
    image: paint-room.jpg          # optional, 1200x630+ file in content/blog/images/,
                                   # or a full https:// address (e.g. an Unsplash photo)
    image_alt: A freshly painted blue bedroom   # required when image is set
    image_credit: Jane Doe on Unsplash          # optional, shown under the photo
    image_credit_url: https://unsplash.com/photos/...
    calculators: [paint-calculator, drywall-calculator]   # optional
    draft: true                    # optional, skips the post
    ---

    Markdown body. ## Headings, lists, tables and ![alt](images/photo.jpg) work.

Nothing under /blog/ is built until at least one post exists, so Google never
sees empty pages.
"""
import datetime
import html
import math
import re
import shutil
from pathlib import Path

import markdown
import yaml

ROOT = Path(__file__).parent
CONTENT = ROOT / "content/blog"


def esc(s):
    return html.escape(str(s), quote=True)


def _human(d):
    return d.strftime("%B %-d, %Y")


def load_posts(cfg, base, accents_for_category):
    """Read every post, newest first. accents_for_category(key) -> color key."""
    labels = dict(cfg["categories"])
    posts = []
    if not CONTENT.exists():
        return posts
    for f in sorted(CONTENT.glob("*/*.md")):
        cat = f.parent.name
        if cat not in labels:
            raise SystemExit(f"{f}: folder '{cat}' is not a category in site.json")
        raw = f.read_text()
        m = re.match(r"^---\s*\n(.*?)\n---\s*\n", raw, re.S)
        if not m:
            raise SystemExit(f"{f}: missing front matter between --- lines")
        meta = yaml.safe_load(m.group(1)) or {}
        if meta.get("draft"):
            continue
        for key in ("title", "description", "date"):
            if not meta.get(key):
                raise SystemExit(f"{f}: front matter needs '{key}'")
        date = meta["date"] if isinstance(meta["date"], datetime.date) else datetime.date.fromisoformat(str(meta["date"]))
        upd = meta.get("updated") or date
        upd = upd if isinstance(upd, datetime.date) else datetime.date.fromisoformat(str(upd))
        slug = meta.get("slug") or f.stem
        body_md = raw[m.end():]
        words = len(re.findall(r"\w+", body_md))
        image = meta.get("image")
        if image and not meta.get("image_alt"):
            raise SystemExit(f"{f}: 'image_alt' is required when 'image' is set")
        path = f"blog/{cat}/{slug}/"
        posts.append({
            "file": f, "category": cat, "category_label": labels[cat], "slug": slug, "path": path,
            "title": meta["title"], "description": meta["description"],
            # Optional shorter versions for search results (titles ~60, descriptions ~155 characters).
            "seo_title": meta.get("seo_title") or meta["title"],
            "seo_description": meta.get("seo_description") or meta["description"],
            "date": date, "updated": upd, "date_human": _human(date), "updated_human": _human(upd),
            "author": meta.get("author") or cfg["owner_name"],
            "calculators": meta.get("calculators") or [],
            "image": image, "image_alt": meta.get("image_alt", ""),
            "image_credit": meta.get("image_credit", ""), "image_credit_url": meta.get("image_credit_url", ""),
            "image_url": (image if image and image.startswith("http") else
                          f"{base}/assets/blog/{image}" if image else f"{base}/assets/og/blog-{cat}.jpg"),
            "accent": accents_for_category(cat),
            "minutes": max(1, math.ceil(words / 220)),
            "markdown": body_md,
        })
    posts.sort(key=lambda p: (p["date"], p["title"]), reverse=True)
    return posts


def _render_md(text, prefix):
    out = markdown.markdown(text, extensions=["tables", "sane_lists", "attr_list", "toc"],
                            extension_configs={"toc": {"permalink": False}})
    # images/foo.jpg in posts -> the published assets/blog/ folder
    out = re.sub(r'src="images/', f'src="{prefix}assets/blog/', out)
    # Site links written as /paint-calculator/ work at any address (live site or staging).
    out = re.sub(r'href="/(?!/)', f'href="{prefix}', out)
    out = re.sub(r"<img ", '<img loading="lazy" ', out)
    out = out.replace("<table>", '<div class="table-wrap"><table>').replace("</table>", "</table></div>")
    return out


def build(out_dir, tools, ctx):
    """Write blog pages. ctx carries page(), post_card(), cfg, base, iso, tools_by_slug."""
    posts = ctx["posts"]
    if not posts:
        return []
    cfg, base, page, post_card, iso = ctx["cfg"], ctx["base"], ctx["page"], ctx["post_card"], ctx["iso"]
    by_slug = ctx["tools_by_slug"]
    urls = []

    # Images used by posts
    src_imgs = CONTENT / "images"
    if src_imgs.exists():
        shutil.copytree(src_imgs, out_dir / "assets/blog", dirs_exist_ok=True)

    publisher = ctx.get("org_ref") or {"@type": "Organization", "name": cfg["name"], "url": base + "/"}
    author_path = ctx.get("author_path")
    hubs = ctx.get("hubs") or {}
    default_bio = cfg.get("owner_bio") or (f"{cfg['owner_name']} runs {cfg['name']} and checks every calculator "
                                           "against worked examples before it goes live.")
    authors = cfg.get("authors") or {}

    def calc_cards(slugs, prefix):
        items = []
        for s in slugs:
            t = by_slug.get(s)
            if not t:
                continue
            items.append(f'<li data-accent="{t["tool"]}"><a href="{prefix}{s}/"><span class="mini-art">{iso.tool_icon(t["tool"])}</span>'
                         f'<span><strong>{esc(t["short"])}</strong><span class="t-what">{esc(t["what"])}</span></span></a></li>')
        return "".join(items)

    def author_url(name):
        return author_path(name) if author_path and name in authors else "about/"

    # ---- Posts ----
    for p in posts:
        prefix = "../../../"
        cat_tools = [t["slug"] for t in tools if t.get("category") == p["category"]]
        calcs = p["calculators"] or cat_tools[:3]
        more = [q for q in posts if q["category"] == p["category"] and q is not p][:3]
        bio = (authors.get(p["author"]) or {}).get("bio") or default_bio
        credit = ""
        if p["image_credit"]:
            who = esc(p["image_credit"])
            if p["image_credit_url"]:
                who = f'<a href="{esc(p["image_credit_url"])}" rel="noopener">{who}</a>'
            credit = f'<figcaption>Photo: {who}</figcaption>'
        src = p["image_url"] if (p["image"] or "").startswith("http") else f'{prefix}assets/blog/{esc(p["image"] or "")}'
        srcset = ""
        if "w=1600&h=900" in src:
            srcset = (' srcset="' + ", ".join(esc(src.replace("w=1600&h=900", f"w={w}&h={w * 9 // 16}")) + f" {w}w"
                                            for w in (640, 960, 1280, 1600)) + '" sizes="(max-width: 1100px) 100vw, 1060px"')
        hero = (f'<figure class="post-hero"><img src="{esc(src)}"{srcset} alt="{esc(p["image_alt"])}" '
                f'width="1600" height="900" fetchpriority="high">{credit}</figure>') if p["image"] else ""
        updated = (f' · Updated {p["updated_human"]}' if p["updated"] != p["date"] else "")
        first_tool = by_slug.get(cat_tools[0]) if cat_tools else None
        body = f"""<section class="tool-head post-head">
<div class="tool-head-text">
<p class="crumbs"><a href="{prefix}">Home</a> / <a href="{prefix}blog/">Guides</a> / <a href="../">{esc(p['category_label'])}</a></p>
<h1>{esc(p['title'])}</h1>
<p class="lede">{esc(p['description'])}</p>
<p class="post-meta">By <a href="{prefix}{author_url(p['author'])}">{esc(p['author'])}</a> · {p['date_human']}{updated} · {p['minutes']} min read</p>
</div>
<div class="tool-head-art">{iso.tool_icon(first_tool['tool']) if first_tool else ''}</div>
</section>
{hero}
<div class="post-layout">
<article class="guide post">
{_render_md(p['markdown'], prefix)}
</article>
<aside class="post-side">
<section class="related"><h2>Calculators for this project</h2><ul class="related-list">{calc_cards(calcs, prefix)}</ul></section>
</aside>
</div>
<section class="author-box">
<span class="author-mark" aria-hidden="true"></span>
<div><p class="author-name">Written by {esc(p['author'])}</p><p>{esc(bio)}</p>
<p><a href="{prefix}how-we-calculate/">How we calculate</a> · <a href="{prefix}contact/">Report a mistake</a></p></div>
</section>
{('<section class="related"><h2>More ' + esc(p['category_label'].lower()) + ' guides</h2><ul class="post-cards">' + ''.join(post_card(q, prefix) for q in more) + '</ul></section>') if more else ''}"""
        schema = [
            {"@context": "https://schema.org", "@type": "BlogPosting", "headline": p["title"],
             "description": p["description"], "image": [p["image_url"]],
             "datePublished": p["date"].isoformat(), "dateModified": p["updated"].isoformat(),
             "author": {"@type": "Person", "name": p["author"], "url": f"{base}/{author_url(p['author'])}"},
             "publisher": publisher, "mainEntityOfPage": f"{base}/{p['path']}"},
            {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "Guides", "item": f"{base}/blog/"},
                {"@type": "ListItem", "position": 2, "name": p["category_label"], "item": f"{base}/blog/{p['category']}/"},
                {"@type": "ListItem", "position": 3, "name": p["title"], "item": f"{base}/{p['path']}"}]},
        ]
        extra = (f'<meta property="article:published_time" content="{p["date"].isoformat()}">\n'
                 f'<meta property="article:modified_time" content="{p["updated"].isoformat()}">\n'
                 f'<meta property="article:author" content="{esc(p["author"])}">\n'
                 f'<link rel="alternate" type="application/rss+xml" title="{esc(cfg["name"])} guides" href="{base}/blog/feed.xml">\n')
        d = out_dir / p["path"]
        d.mkdir(parents=True, exist_ok=True)
        (d / "index.html").write_text(page(path=p["path"], title=f"{p['seo_title']} | {cfg['name']}", description=p["seo_description"],
                                           body=body, schema=schema, accent=p["accent"], image=p["image_url"],
                                           og_type="article", extra_head=extra, current="blog/"))
        urls.append((p["path"], "0.7", p["updated"].isoformat()))

    # ---- Category pages ----
    for key, label in cfg["categories"]:
        cat_posts = [p for p in posts if p["category"] == key]
        if not cat_posts:
            continue
        prefix = "../../"
        cat_tools = [t["slug"] for t in tools if t.get("category") == key]
        accent = by_slug[cat_tools[0]]["tool"] if cat_tools else "violet"
        hub_link = (f'<p class="more-link"><a href="{prefix}{hubs[key]["slug"]}/">All {esc(hubs[key]["h1"].lower())}</a></p>' if key in hubs else "")
        body = f"""<section class="tool-head">
<div class="tool-head-text">
<p class="crumbs"><a href="{prefix}">Home</a> / <a href="../">Guides</a> / {esc(label)}</p>
<h1>{esc(label)} guides</h1>
<p class="lede">{esc((cfg.get("blog_intros") or {}).get(key) or "Plans, tips and shopping lists for " + label.lower() + " projects, with a calculator for every step.")}</p>
</div>
<div class="tool-head-art">{iso.tool_icon(accent)}</div>
</section>
<ul class="post-cards">{''.join(post_card(p, prefix) for p in cat_posts)}</ul>
<section class="related"><h2>{esc(label)} calculators</h2><ul class="related-list">{calc_cards(cat_tools, prefix)}</ul>{hub_link}</section>"""
        d = out_dir / "blog" / key
        d.mkdir(parents=True, exist_ok=True)
        (d / "index.html").write_text(page(path=f"blog/{key}/", title=f"{label} Guides | {cfg['name']}",
                                           description=f"{label} project guides: plans, tips and exactly what to buy.",
                                           body=body, accent=accent, image=f"blog-{key}", current="blog/"))
        urls.append((f"blog/{key}/", "0.6", max(p["updated"] for p in cat_posts).isoformat()))

    # ---- Blog home ----
    prefix = "../"
    sections = ""
    for key, label in cfg["categories"]:
        cat_posts = [p for p in posts if p["category"] == key][:3]
        if cat_posts:
            sections += (f'<section class="tool-group"><h2 class="section-title"><a href="{key}/">{esc(label)}</a></h2>'
                         f'<ul class="post-cards">{"".join(post_card(p, prefix) for p in cat_posts)}</ul></section>')
    body = f"""<section class="tool-head page-head">
<div class="tool-head-text">
<p class="crumbs"><a href="../">Home</a> / Guides</p>
<h1>Project guides</h1>
<p class="lede">Step-by-step plans and buying advice for home projects, each linked to the calculator you need.</p>
</div>
</section>
{sections}"""
    d = out_dir / "blog"
    d.mkdir(exist_ok=True)
    (d / "index.html").write_text(page(path="blog/", title=f"Project Guides | {cfg['name']}",
                                       description="Step-by-step home project guides with shopping lists and calculators.",
                                       body=body, current="blog/"))
    urls.append(("blog/", "0.6", max(p["updated"] for p in posts).isoformat()))

    # ---- RSS ----
    items = "".join(
        f"<item><title>{esc(p['title'])}</title><link>{base}/{p['path']}</link><guid>{base}/{p['path']}</guid>"
        f"<pubDate>{datetime.datetime.combine(p['date'], datetime.time(12)).strftime('%a, %d %b %Y %H:%M:%S +0000')}</pubDate>"
        f"<description>{esc(p['description'])}</description></item>" for p in posts[:30])
    (d / "feed.xml").write_text(
        f'<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>{esc(cfg["name"])} guides</title>'
        f"<link>{base}/blog/</link><description>Home project guides</description>{items}</channel></rss>\n")
    return urls
