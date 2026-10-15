# ProjectMath — home project calculators

Free calculators that tell homeowners exactly what to buy: paint, concrete, tile, flooring, and mulch/soil/gravel. Each page gives quantities, a printable shopping list with editable prices, a how-to guide and an embeddable version for other sites.

Live site (once GitHub Pages is on): https://abdullah-coder-007.github.io/home-project-calculators/

## How the project is laid out

| Path | What it is |
| --- | --- |
| `site.json` | Site settings: name, web address, contact email, AdSense ID, verification codes, list of calculators |
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
