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
}


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
