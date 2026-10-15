# Calcupine — home project calculators

15 free calculators that tell homeowners exactly what to buy: paint, drywall, wallpaper, flooring, tile, square footage, concrete, pavers, cubic yards, mulch/soil/gravel, sod and seed, fences, decks, roofing and stairs. Each page gives quantities, a printable shopping list with editable prices, a how-to guide and an embeddable version for other sites.

Live site: https://calcupine.com (hosted on Cloudflare Pages from the `docs/` folder)

## How the project is laid out

| Path | What it is |
| --- | --- |
| `site.json` | Site settings: name, web address, contact email, AdSense ID, verification codes, calculator list and homepage groups |
| `iso.py` | Draws the 3D artwork and sets each calculator's colors |
| `src/tools/<name>/` | One folder per calculator: `meta.json` (title, description, FAQ), `form.html` (inputs), `guide.html` (article) |
| `src/pages/` | About, contact, privacy, terms and "How we calculate" pages |
| `src/assets/js/formulas.js` | All the maths, in one place |
| `src/assets/js/tools.js` | Turns the maths into results and shopping lists |
| `src/assets/js/app.js` | Page behaviour: room-shape builder, share links, print, copy |
| `src/assets/css/site.css` | Design |
| `tests/` | Checks every formula against hand-worked examples |
| `build.py` | Builds the finished website into `docs/` |
| `docs/` | The finished website that GitHub Pages serves. Don't edit by hand; it is rebuilt each time |

## Making changes

```
python3 build.py              # rebuild the site into docs/
node --test tests/*.test.js   # check all formulas
```

## Settings to fill in later (in `site.json`)

- `contact_email` — needed before applying to AdSense
- `custom_domain` — once you buy a domain, e.g. `projectmath.com`
- `google_site_verification`, `bing_site_verification` — from Search Console and Bing Webmaster Tools
- `adsense_client` — your `ca-pub-...` ID once AdSense approves the site; this also creates `ads.txt`

Then rebuild and push.

## Hosting

Cloudflare builds from the `main` branch and serves the `docs/` folder, as set in `wrangler.jsonc`. Every push to `main` goes live on calcupine.com in about a minute.
