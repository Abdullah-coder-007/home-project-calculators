# Guides (blog)

One folder per category, matching the homepage groups:

| Folder | Category |
| --- | --- |
| `walls/` | Walls and ceilings |
| `floors/` | Floors |
| `concrete/` | Concrete, pavers and fill |
| `outdoor/` | Yard, garden and outdoor |
| `structure/` | Roofs and stairs |

Each post is a Markdown file, for example `walls/paint-a-bedroom-in-a-weekend.md`. The file name becomes the web address.

```
---
title: How to paint a bedroom in one weekend
description: One sentence that makes people want to click (shown in Google and Discover).
seo_title: Short title for Google, 60 characters or less   # needed when the title is longer
seo_description: 120 to 155 characters for Google            # needed when the description is longer
date: 2026-11-02
updated: 2026-11-10                 # optional
author: Abdullah                    # optional
image: paint-bedroom.jpg            # optional; at least 1200 px wide, saved in images/
image_alt: A freshly painted blue bedroom with a roller tray
calculators: [paint-calculator]     # optional; shown beside the post
draft: true                         # optional; hides the post
---

The article in Markdown: ## headings, lists, | tables |, > tips, ![alt](images/photo.jpg)
```

Nothing under /blog/ is published until the first post exists. Posts without their own image use the category's share image. Run `python3 build.py` to publish.

The SEO check in `tests/seo.test.js` fails if a page's title for Google is over 60 characters or its description is over 165, so add `seo_title` and `seo_description` when the headline or summary is long.
