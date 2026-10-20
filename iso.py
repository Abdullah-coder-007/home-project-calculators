"""
Isometric 3D artwork, generated as inline SVG at build time.
No image files: every block is three shaded polygons, so it stays sharp
on any screen and weighs a few kilobytes.
"""
import math

C30 = math.cos(math.radians(30))


def _hex(c):
    c = c.lstrip("#")
    return [int(c[i:i + 2], 16) for i in (0, 2, 4)]


def shade(color, f):
    """f > 0 mixes toward white, f < 0 toward a deep indigo."""
    r, g, b = _hex(color)
    tr, tg, tb = (255, 255, 255) if f > 0 else (27, 22, 64)
    f = abs(f)
    return "#%02x%02x%02x" % (round(r + (tr - r) * f), round(g + (tg - g) * f), round(b + (tb - b) * f))


class Scene:
    def __init__(self, s=14, ox=0, oy=0):
        self.s, self.ox, self.oy = s, ox, oy
        self.items = []  # (depth, svg)

    def p(self, x, y, z):
        return (self.ox + (x - y) * C30 * self.s, self.oy + (x + y) * 0.5 * self.s - z * self.s)

    def _poly(self, pts, fill):
        d = " ".join(f"{a:.1f},{b:.1f}" for a, b in pts)
        return f'<polygon points="{d}" fill="{fill}"/>'

    def box(self, x, y, z, w, d, h, color, depth=None, stroke=True):
        P = self.p
        top = [P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)]
        left = [P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)]
        right = [P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)]
        svg = (self._poly(left, shade(color, -0.12)) + self._poly(right, shade(color, -0.32)) +
               self._poly(top, shade(color, 0.28)))
        if stroke:
            edge = [P(x, y + d, z + h), P(x + w, y + d, z + h), P(x + w, y, z + h)]
            svg += '<polyline points="%s" fill="none" stroke="%s" stroke-width="1" stroke-opacity=".7"/>' % (
                " ".join(f"{a:.1f},{b:.1f}" for a, b in edge), shade(color, 0.6))
        self.items.append((depth if depth is not None else x + y + z * 0.01, svg))

    def cylinder(self, x, y, z, r, h, color, lid=None, depth=None, drip=None):
        s = self.s
        cx, cyb = self.p(x, y, z)
        _, cyt = self.p(x, y, z + h)
        rx, ry = math.sqrt(2) * r * C30 * s, math.sqrt(2) * r * 0.5 * s
        body = shade(color, -0.1)
        out = (f'<ellipse cx="{cx:.1f}" cy="{cyb:.1f}" rx="{rx:.1f}" ry="{ry:.1f}" fill="{shade(color, -0.35)}"/>'
               f'<rect x="{cx - rx:.1f}" y="{cyt:.1f}" width="{2 * rx:.1f}" height="{cyb - cyt:.1f}" fill="{body}"/>'
               f'<rect x="{cx - rx:.1f}" y="{cyt:.1f}" width="{rx * 0.55:.1f}" height="{cyb - cyt:.1f}" fill="{shade(color, 0.18)}"/>'
               f'<rect x="{cx + rx * 0.45:.1f}" y="{cyt:.1f}" width="{rx * 0.55:.1f}" height="{cyb - cyt:.1f}" fill="{shade(color, -0.3)}"/>')
        if drip:
            out += (f'<path d="M{cx - rx:.1f} {cyt:.1f} h{2 * rx:.1f} v{(cyb - cyt) * 0.32:.1f} '
                    f'q{-rx * 0.25:.1f} {ry * 0.9:.1f} {-rx * 0.5:.1f} 0 q{-rx * 0.25:.1f} {ry * 1.8:.1f} {-rx * 0.5:.1f} 0 '
                    f'q{-rx * 0.25:.1f} {ry * 0.7:.1f} {-rx * 0.5:.1f} 0 q{-rx * 0.25:.1f} {ry * 1.3:.1f} {-rx * 0.5:.1f} 0 z" fill="{drip}"/>')
        out += f'<ellipse cx="{cx:.1f}" cy="{cyt:.1f}" rx="{rx:.1f}" ry="{ry:.1f}" fill="{lid or shade(color, 0.3)}"/>'
        out += (f'<ellipse cx="{cx:.1f}" cy="{cyt:.1f}" rx="{rx * 0.78:.1f}" ry="{ry * 0.78:.1f}" fill="none" '
                f'stroke="{shade(color, -0.25)}" stroke-width="1.4"/>')
        self.items.append((depth if depth is not None else x + y, out))

    def mound(self, x, y, z, r, h, color, depth=None):
        s = self.s
        cx, cy = self.p(x, y, z)
        rx, ry = math.sqrt(2) * r * C30 * s, math.sqrt(2) * r * 0.5 * s
        top = h * s
        out = (f'<ellipse cx="{cx:.1f}" cy="{cy:.1f}" rx="{rx:.1f}" ry="{ry:.1f}" fill="{shade(color, -0.35)}"/>'
               f'<path d="M{cx - rx:.1f} {cy:.1f} C{cx - rx * 0.7:.1f} {cy - top:.1f} {cx + rx * 0.7:.1f} {cy - top:.1f} {cx + rx:.1f} {cy:.1f} '
               f'A{rx:.1f} {ry:.1f} 0 0 1 {cx - rx:.1f} {cy:.1f}z" fill="{shade(color, -0.05)}"/>'
               f'<path d="M{cx - rx * 0.55:.1f} {cy - top * 0.45:.1f} C{cx - rx * 0.3:.1f} {cy - top * 0.85:.1f} {cx + rx * 0.05:.1f} {cy - top * 0.8:.1f} {cx + rx * 0.2:.1f} {cy - top * 0.7:.1f}" '
               f'stroke="{shade(color, 0.45)}" stroke-width="{s * 0.35:.1f}" stroke-linecap="round" fill="none"/>')
        # Wood-chip texture
        import random
        rnd = random.Random(7)
        for _ in range(int(r * 9)):
            a = rnd.uniform(-0.85, 0.85)
            t = rnd.uniform(0.15, 0.85)
            px = cx + a * rx * (1 - t * 0.35)
            py = cy - top * t * (1 - abs(a) ** 2 * 0.8) * 0.9 + ry * 0.2
            out += f'<rect x="{px:.1f}" y="{py:.1f}" width="{s*0.45:.1f}" height="{s*0.18:.1f}" rx="1" transform="rotate({rnd.uniform(-40,40):.0f} {px:.1f} {py:.1f})" fill="{shade(color, rnd.choice([-0.3, 0.25, -0.15]))}"/>'
        self.items.append((depth if depth is not None else x + y, out))

    def svg(self, w, h, label="", cls=""):
        body = "".join(svg for _, svg in sorted(self.items, key=lambda t: t[0]))
        role = f'role="img" aria-label="{label}"' if label else 'aria-hidden="true"'
        return f'<svg class="{cls}" viewBox="0 0 {w} {h}" {role} xmlns="http://www.w3.org/2000/svg">{body}</svg>'


COLORS = {
    "paint": "#ff4d8d", "concrete": "#3d7bff", "tile": "#12b8a6",
    "flooring": "#ff9f1c", "mulch": "#3bb54a", "violet": "#6c4cf5", "tape": "#ffc93c",
    "area": "#8b5cf6", "volume": "#06b6d4", "drywall": "#6366f1", "wallpaper": "#d946ef",
    "fence": "#f97316", "deck": "#d4a039", "roofing": "#ef4444", "pavers": "#a8a29e",
    "stairs": "#84cc16", "lawn": "#10b981",
    "insulation": "#f58fb0", "baseboard": "#8b5a3c", "grout": "#64748b",
}

# Per-calculator page colors: accent, second gradient color, deep edge, soft tint.
ACCENTS = {
    "violet":    ("#6c4cf5", "#a46bff", "#4a2fc4", "#ece7ff"),
    "paint":     ("#f2367c", "#ff7a59", "#b81d58", "#ffe5ef"),
    "concrete":  ("#2f6bff", "#24b4ff", "#1c46b8", "#e3ecff"),
    "tile":      ("#0fa596", "#3ad6a0", "#08776c", "#dcf7f2"),
    "flooring":  ("#f2830d", "#ffc23c", "#9c5000", "#fff0dc"),
    "mulch":     ("#2fa43f", "#9ad13b", "#1d7a2b", "#e2f6e1"),
    "area":      ("#7c3aed", "#c084fc", "#5521b5", "#f1e8ff"),
    "volume":    ("#0891b2", "#22d3ee", "#0e6680", "#dff7fc"),
    "drywall":   ("#4f46e5", "#818cf8", "#3730a3", "#e8e8ff"),
    "wallpaper": ("#c026d3", "#f472b6", "#86198f", "#fbe6fd"),
    "fence":     ("#ea580c", "#fb923c", "#9a3412", "#ffeadb"),
    "deck":      ("#b7791f", "#f2c14e", "#7c4f0e", "#fbf0d9"),
    "roofing":   ("#dc2626", "#f97316", "#991b1b", "#fde4e4"),
    "pavers":    ("#78716c", "#f59e0b", "#44403c", "#f3efe9"),
    "stairs":    ("#65a30d", "#a3e635", "#3f6212", "#eef8dc"),
    "lawn":      ("#059669", "#84cc16", "#065f46", "#dcfce7"),
    "insulation": ("#0284c7", "#f58fb0", "#075985", "#e0f2fe"),
    "baseboard": ("#8b5a3c", "#d9a273", "#5c3a24", "#f6ece3"),
    "grout":     ("#475569", "#94a3b8", "#1e293b", "#e8edf3"),
}


def accents_css():
    out = []
    for k, (a, a2, deep, soft) in ACCENTS.items():
        out.append(f'[data-accent="{k}"] {{ --accent: {a}; --accent-2: {a2}; --accent-deep: {deep}; --accent-soft: {soft}; }}')
    return "\n".join(out) + "\n"


def tool_icon(kind, size=96):
    """A small 3D object for each calculator."""
    c = COLORS[kind]
    sc = Scene(s=9, ox=48, oy=34)
    if kind == "paint":
        sc.cylinder(2.5, 2.5, 0, 2.4, 4.4, "#e9ecf6", lid=shade(c, 0.15), drip=c)
    elif kind == "concrete":
        sc.box(0.6, 1.0, 0, 4.2, 3.0, 1.3, c, depth=1)
        sc.box(0.9, 1.2, 1.3, 3.8, 2.6, 1.3, shade(c, 0.12), depth=2)
        sc.box(1.2, 1.4, 2.6, 3.4, 2.2, 1.2, shade(c, 0.22), depth=3)
    elif kind == "tile":
        for i in range(4):
            sc.box(0.6 + i * 0.12, 0.6 + i * 0.12, i * 0.75, 4.2, 4.2, 0.55,
                   shade(c, 0.06 * i) if i % 2 == 0 else shade(c, -0.08), depth=i)
    elif kind == "flooring":
        for i in range(4):
            sc.box(-0.4, 0.4 + (i % 2) * 0.25, i * 0.8, 6.2, 1.5, 0.7, shade(c, 0.07 * (i % 2)), depth=i)
        sc.box(-0.4, 2.2, 0, 6.2, 1.5, 0.7, shade(c, -0.08), depth=5)
    elif kind == "mulch":
        sc.mound(2.6, 2.6, 0, 3.0, 3.6, c)
    elif kind == "area":
        # A floor of alternating squares with a corner measuring block
        for gx in range(3):
            for gy in range(3):
                sc.box(gx * 1.7, gy * 1.7, 0, 1.6, 1.6, 0.35, shade(c, 0.1 if (gx + gy) % 2 else -0.1), depth=gx + gy)
        sc.box(4.3, -0.6, 0.35, 1.0, 1.0, 1.6, COLORS["tape"], depth=9)
    elif kind == "volume":
        # Eight cubes stacked into one big cube
        for z in range(2):
            for gx in range(2):
                for gy in range(2):
                    sc.box(0.6 + gx * 2.2, 0.6 + gy * 2.2, z * 2.2, 2.1, 2.1, 2.1, shade(c, 0.12 * ((gx + gy + z) % 2)), depth=gx + gy + z * 10)
    elif kind == "drywall":
        # Sheets stacked on edge
        for k in range(4):
            sc.box(0.6 + k * 0.7, 1.8, 0, 0.45, 3.8, 4.0, "#f1f2f8" if k % 2 else "#e3e6f3", depth=k)
        sc.box(3.4, 0.6, 0, 2.2, 2.2, 1.1, c, depth=9)
    elif kind == "wallpaper":
        sc.cylinder(1.6, 3.6, 0, 1.15, 4.2, c, lid=shade(c, 0.35), drip=shade(c, 0.45), depth=1)
        sc.cylinder(4.0, 1.6, 0, 1.15, 4.2, shade(c, -0.15), lid=shade(c, 0.2), drip=shade(c, 0.5), depth=2)
    elif kind == "fence":
        for k in range(5):
            sc.box(0.2 + k * 1.2, 2.6, 0, 0.7, 0.3, 3.8 if k % 2 == 0 else 3.4, shade(c, 0.12 * (k % 2)), depth=k)
        sc.box(0.0, 2.95, 0.9, 6.0, 0.3, 0.45, shade(c, -0.2), depth=10)
        sc.box(0.0, 2.95, 2.5, 6.0, 0.3, 0.45, shade(c, -0.2), depth=10.1)
    elif kind == "deck":
        sc.box(0.2, 0.2, 0, 0.5, 0.5, 1.6, shade(c, -0.25), depth=0)
        sc.box(4.6, 4.6, 0, 0.5, 0.5, 1.6, shade(c, -0.25), depth=0.5)
        for k in range(6):
            sc.box(-0.3 + k * 0.95, -0.3, 1.6, 0.85, 6.0, 0.35, shade(c, 0.08 * (k % 2)), depth=1 + k)
    elif kind == "roofing":
        # House box with a gable roof drawn from polygons
        sc.box(0.6, 1.2, 0, 4.6, 3.4, 2.2, "#f1f2f8", depth=0)
        P = sc.p
        x0, x1, y0, y1, z0, ridge = 0.2, 5.6, 0.8, 5.0, 2.2, 4.4
        ym = (y0 + y1) / 2
        front = [P(x1, y0, z0), P(x1, y1, z0), P(x1, ym, ridge)]
        slope_l = [P(x0, y1, z0), P(x1, y1, z0), P(x1, ym, ridge), P(x0, ym, ridge)]
        sc.items.append((5, sc._poly(slope_l, shade(c, -0.05)) + sc._poly(front, shade(c, -0.35))))
        for k in range(1, 4):
            t = k / 4
            a1 = P(x0, y1 + (ym - y1) * t, z0 + (ridge - z0) * t); a2 = P(x1, y1 + (ym - y1) * t, z0 + (ridge - z0) * t)
            sc.items.append((5.1, f'<line x1="{a1[0]:.1f}" y1="{a1[1]:.1f}" x2="{a2[0]:.1f}" y2="{a2[1]:.1f}" stroke="{shade(c, -0.3)}" stroke-width="1.2"/>'))
    elif kind == "pavers":
        for gx in range(3):
            for gy in range(4):
                off = 0.55 if gy % 2 else 0
                sc.box(gx * 1.75 + off - 0.4, gy * 1.25, 0, 1.6, 1.1, 0.55,
                       COLORS["fence"] if (gx + gy) % 3 == 0 else shade(c, 0.1 * ((gx + gy) % 2)), depth=gx + gy)
    elif kind == "stairs":
        for k in range(4):
            sc.box(0.4 + k * 1.2, 0.8, 0, 1.2, 3.8, 1.1 * (4 - k), shade(c, 0.08 * (k % 2)), depth=k)
    elif kind == "lawn":
        sc.box(0.2, 0.2, 0, 5.2, 5.2, 0.7, "#8b5e34", depth=0)
        sc.box(0.2, 0.2, 0.7, 5.2, 2.5, 0.35, c, depth=1)
        sc.box(0.2, 2.75, 0.7, 5.2, 2.5, 0.35, shade(c, 0.12), depth=2)
        sc.cylinder(1.4, 4.6, 1.05, 0.55, 0.9, COLORS["lawn"], lid=shade(COLORS["lawn"], 0.4), depth=3)
    elif kind == "insulation":
        # A stud wall with pink batts in both bays and a roll in front
        stud = "#e7c79a"
        for k, x in enumerate((0.0, 2.55, 5.1)):
            sc.box(x, 1.4, 0, 0.45, 0.9, 3.6, stud, depth=k * 2)
        for k, x in enumerate((0.45, 3.0)):
            sc.box(x, 1.5, 0, 2.1, 0.75, 1.75, c, depth=k * 2 + 1)
            sc.box(x, 1.5, 1.8, 2.1, 0.75, 1.8, shade(c, 0.12), depth=k * 2 + 1.1)
        sc.box(-0.1, 1.35, 3.6, 5.75, 1.0, 0.35, shade(stud, -0.08), depth=6)
        sc.cylinder(4.2, 4.4, 0, 1.15, 2.0, c, lid=shade(c, 0.35), depth=10)
    elif kind == "baseboard":
        # A wall corner with a baseboard running along both walls
        sc.box(0.2, 0.2, 0, 5.4, 0.35, 4.6, "#f1f2f8", depth=0)
        sc.box(0.2, 0.2, 0, 0.35, 5.4, 4.6, "#e3e6f3", depth=0.1)
        sc.box(0.55, 0.55, 0, 5.05, 0.3, 1.0, c, depth=2)
        sc.box(0.55, 0.85, 0, 0.3, 4.75, 1.0, shade(c, -0.08), depth=2.1)
        sc.box(0.55, 0.55, 1.0, 5.05, 0.15, 0.2, shade(c, 0.25), depth=2.2)
        sc.box(0.55, 0.7, 1.0, 0.15, 4.9, 0.2, shade(c, 0.2), depth=2.3)
        sc.box(2.8, 3.0, 0, 0.6, 2.8, 0.6, COLORS["tape"], depth=8)
    elif kind == "grout":
        # Light tiles set in dark grout, with a grout float on top
        sc.box(0.0, 0.0, 0, 5.6, 5.6, 0.45, shade(c, -0.1), depth=0)
        for gx in range(3):
            for gy in range(3):
                sc.box(0.2 + gx * 1.8, 0.2 + gy * 1.8, 0.45, 1.6, 1.6, 0.25, "#eef2f7" if (gx + gy) % 2 else "#dfe6ee", depth=1 + gx + gy)
        sc.box(2.4, 1.4, 0.7, 2.6, 1.3, 0.35, COLORS["tile"], depth=20)
        sc.box(3.3, 1.85, 1.05, 0.8, 0.4, 0.8, shade(COLORS["tape"], -0.1), depth=21)
    return sc.svg(size, size, cls="iso-icon")


def hero_scene():
    """Homepage illustration: a job-site platform with every material."""
    sc = Scene(s=15, ox=270, oy=70)
    V, P = COLORS["violet"], COLORS
    # Platform
    sc.box(-1, -1, -1.2, 18, 18, 1.2, "#ffffff", depth=-100)
    sc.box(-1, -1, -1.6, 18, 18, 0.4, V, depth=-101, stroke=False)
    # Tile stack (back left)
    for i in range(5):
        sc.box(0.5, 9.5, i * 0.6, 4.5, 4.5, 0.45, shade(P["tile"], 0.08 if i % 2 else -0.04), depth=14 + i * 0.01)
    # Plank stack (back right)
    for i in range(4):
        sc.box(7.5 + (i % 2) * 0.3, 0.6, i * 0.7, 8.5, 1.6, 0.6, shade(P["flooring"], 0.06 * (i % 2)), depth=8 + i * 0.01)
    sc.box(7.8, 2.4, 0, 8.5, 1.6, 0.6, shade(P["flooring"], -0.08), depth=10.4)
    # Concrete bags (middle)
    sc.box(8, 7, 0, 4, 2.8, 1.1, P["concrete"], depth=15)
    sc.box(8.3, 7.2, 1.1, 3.5, 2.4, 1.1, shade(P["concrete"], 0.12), depth=15.1)
    sc.box(12.6, 7.4, 0, 2.6, 4, 1.1, shade(P["concrete"], -0.06), depth=20)
    # Paint cans (front left)
    sc.cylinder(3.2, 4.0, 0, 1.6, 3.2, "#eef0f8", lid=shade(P["paint"], 0.15), drip=P["paint"], depth=7.3)
    sc.cylinder(1.4, 6.6, 0, 1.1, 2.2, "#eef0f8", lid=shade(P["violet"], 0.25), drip=P["violet"], depth=8.1)
    # Mulch pile (front right)
    sc.mound(12.5, 13.2, 0, 3.0, 3.4, P["mulch"], depth=26)
    # Tape measure block (front)
    sc.box(5.5, 13, 0, 3.2, 3.2, 1.6, P["tape"], depth=19)
    sc.box(8.7, 14.2, 0, 3.6, 0.8, 0.12, shade(P["tape"], 0.1), depth=23.5, stroke=False)
    return sc.svg(540, 380, label="Paint cans, tile, flooring planks, concrete bags and mulch on a work platform", cls="hero-art")
