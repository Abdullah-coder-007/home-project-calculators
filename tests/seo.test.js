// SEO checks on the built site in docs/ (run `python3 build.py` first).
// A page that breaks one of these rules can't be published by mistake.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const DOCS = path.join(__dirname, '..', 'docs');
const BASE = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'site.json'), 'utf8')).base_url.replace(/\/$/, '');
const staging = fs.existsSync(path.join(DOCS, 'robots.txt')) && /Disallow: \//.test(fs.readFileSync(path.join(DOCS, 'robots.txt'), 'utf8'));

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'assets' ? [] : walk(p);
    return e.name.endsWith('.html') ? [p] : [];
  });
}
const decode = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const pages = walk(DOCS).map(file => {
  const html = fs.readFileSync(file, 'utf8');
  const rel = path.relative(DOCS, file).replace(/\\/g, '/');
  const urlPath = rel === 'index.html' ? '' : rel.replace(/index\.html$/, '');
  return {
    file: rel, urlPath, html,
    title: decode((html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || ''),
    description: decode((html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || ''),
    canonical: (html.match(/<link rel="canonical" href="([^"]*)"/) || [])[1] || '',
    noindex: /<meta name="robots" content="noindex/.test(html),
  };
});
const indexable = pages.filter(p => !p.noindex);

test('every page has a title and description of a sensible length', { skip: staging }, () => {
  for (const p of indexable) {
    assert.ok(p.title.length >= 10 && p.title.length <= 60, `${p.file}: title is ${p.title.length} characters (10-60): "${p.title}"`);
    assert.ok(p.description.length >= 50 && p.description.length <= 165, `${p.file}: description is ${p.description.length} characters (50-165)`);
  }
});

test('no two pages share a title or description', { skip: staging }, () => {
  for (const key of ['title', 'description']) {
    const seen = new Map();
    for (const p of indexable) {
      assert.ok(!seen.has(p[key]), `${p.file} and ${seen.get(p[key])} have the same ${key}`);
      seen.set(p[key], p.file);
    }
  }
});

test('canonical points to the page itself', { skip: staging }, () => {
  for (const p of indexable) assert.equal(p.canonical, `${BASE}/${p.urlPath}`, p.file);
});

test('exactly one h1 per page', () => {
  for (const p of pages) assert.equal((p.html.match(/<h1[\s>]/g) || []).length, 1, p.file);
});

test('structured data is valid JSON', () => {
  for (const p of pages) {
    for (const m of p.html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      assert.doesNotThrow(() => JSON.parse(m[1]), `${p.file}: broken JSON-LD`);
    }
  }
});

test('every image has an alt attribute', () => {
  for (const p of pages) {
    for (const m of p.html.matchAll(/<img\b[^>]*>/g)) assert.ok(/\balt="/.test(m[0]), `${p.file}: ${m[0].slice(0, 80)}`);
  }
});

test('internal links lead to real pages', () => {
  const exists = u => {
    const clean = decodeURI(u.split('#')[0].split('?')[0]);
    if (!clean) return true;
    const f = path.join(DOCS, clean);
    return fs.existsSync(clean.endsWith('/') ? path.join(f, 'index.html') : f) || fs.existsSync(path.join(f, 'index.html'));
  };
  for (const p of pages) {
    if (p.file === '404.html') continue;
    for (const m of p.html.matchAll(/<a\b[^>]*href="([^"]+)"/g)) {
      let href = decode(m[1]);
      if (/^(mailto:|tel:|#|javascript:)/.test(href)) continue;
      let target;
      if (href.startsWith(BASE + '/')) target = href.slice(BASE.length + 1);
      else if (/^https?:/.test(href)) continue;
      else target = path.posix.normalize(path.posix.join(path.posix.dirname('/' + p.file), href)).replace(/^\//, '');
      if (href.endsWith('/') && !target.endsWith('/')) target += '/';
      assert.ok(exists(target), `${p.file}: broken link ${href}`);
    }
  }
});

test('sitemap lists every indexable page, and nothing else', { skip: staging }, () => {
  const sm = fs.readFileSync(path.join(DOCS, 'sitemap.xml'), 'utf8');
  const locs = new Set([...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]));
  for (const p of indexable) assert.ok(locs.has(`${BASE}/${p.urlPath}`), `${p.file} is missing from sitemap.xml`);
  const urls = new Set(indexable.map(p => `${BASE}/${p.urlPath}`));
  for (const l of locs) assert.ok(urls.has(l), `sitemap.xml lists ${l}, which isn't an indexable page`);
  for (const m of sm.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)) assert.match(m[1], /^\d{4}-\d{2}-\d{2}$/);
});
