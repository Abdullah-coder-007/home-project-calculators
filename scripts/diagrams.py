"""
"What to measure" diagrams for the calculators.

    python3 scripts/diagrams.py   # writes src/diagrams/<name>.svg

Plain line drawings that follow the site's colors (they use CSS variables, so
they work in light and dark mode). build.py inlines them where a form has
<!-- diagram: name -->.
"""
import math
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "src" / "diagrams"
C30, S30 = math.cos(math.radians(30)), math.sin(math.radians(30))

STYLE = ('<style>.ln{fill:none;stroke:var(--ink);stroke-width:2;stroke-linejoin:round}'
         '.fa{fill:var(--accent-soft);stroke:var(--ink);stroke-width:2;stroke-linejoin:round}'
         '.fb{fill:var(--surface-2);stroke:var(--ink);stroke-width:2;stroke-linejoin:round}'
         '.fc{fill:var(--accent);fill-opacity:.35;stroke:var(--ink);stroke-width:2;stroke-linejoin:round}'
         '.dm{fill:none;stroke:var(--accent);stroke-width:2}'
         '.ah{fill:var(--accent)}'
         '.tx{fill:var(--ink);font:700 15px/1 var(--font, sans-serif)}'
         '.ts{fill:var(--muted);font:600 13px/1 var(--font, sans-serif)}</style>')


class D:
    def __init__(self, w, h, title):
        self.w, self.h, self.title, self.parts = w, h, title, []

    def poly(self, pts, cls="fa"):
        self.parts.append(f'<polygon class="{cls}" points="{" ".join(f"{x:.1f},{y:.1f}" for x, y in pts)}"/>')

    def line(self, a, b, cls="ln", dash=False):
        d = ' stroke-dasharray="5 5"' if dash else ""
        self.parts.append(f'<line class="{cls}" x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}"{d}/>')

    def text(self, x, y, s, cls="tx", anchor="middle"):
        self.parts.append(f'<text class="{cls}" x="{x:.1f}" y="{y:.1f}" text-anchor="{anchor}">{s}</text>')

    def ellipse(self, cx, cy, rx, ry, cls="fa"):
        self.parts.append(f'<ellipse class="{cls}" cx="{cx:.1f}" cy="{cy:.1f}" rx="{rx:.1f}" ry="{ry:.1f}"/>')

    def dim(self, a, b, label, off=(0, 0), lx=None, ly=None, anchor="middle"):
        """Dimension line between a and b with arrowheads and a label."""
        a = (a[0] + off[0], a[1] + off[1]); b = (b[0] + off[0], b[1] + off[1])
        self.line(a, b, "dm")
        ang = math.atan2(b[1] - a[1], b[0] - a[0])
        for p, s in ((a, 1), (b, -1)):
            t = ang if s == 1 else ang + math.pi
            pts = [p, (p[0] + 10 * math.cos(t + 0.4), p[1] + 10 * math.sin(t + 0.4)),
                   (p[0] + 10 * math.cos(t - 0.4), p[1] + 10 * math.sin(t - 0.4))]
            self.poly(pts, "ah")
        mx, my = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
        self.text(lx if lx is not None else mx, ly if ly is not None else my, label, "tx", anchor)

    def svg(self):
        return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.w} {self.h}" role="img" '
                f'aria-label="{self.title}" class="diagram-svg">{STYLE}' + "".join(self.parts) + "</svg>\n")


def iso(ox, oy, s):
    def p(x, y, z=0):
        return (ox + (x - y) * C30 * s, oy + (x + y) * S30 * s - z * s)
    return p


def box(d, p, x0, y0, z0, x1, y1, z1, top="fa", left="fb", right="fc"):
    d.poly([p(x0, y1, z0), p(x1, y1, z0), p(x1, y1, z1), p(x0, y1, z1)], left)     # front-left face
    d.poly([p(x1, y0, z0), p(x1, y1, z0), p(x1, y1, z1), p(x1, y0, z1)], right)    # front-right face
    d.poly([p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y1, z1)], top)      # top


def room():
    d = D(420, 300, "Measure the room's length, width and wall height, and count doors and windows")
    p = iso(190, 115, 18)
    L, W, H = 9, 7, 5.5
    d.poly([p(0, 0), p(L, 0), p(L, W), p(0, W)], "fb")
    d.poly([p(0, 0), p(L, 0), p(L, 0, H), p(0, 0, H)], "fa")
    d.poly([p(0, 0), p(0, W), p(0, W, H), p(0, 0, H)], "fa")
    d.poly([p(0, 2, 0), p(0, 4, 0), p(0, 4, 3.8), p(0, 2, 3.8)], "fc")
    d.poly([p(3.5, 0, 2), p(6.5, 0, 2), p(6.5, 0, 4), p(3.5, 0, 4)], "fc")
    d.text(*p(0, 3, 4.5), "Door", "ts")
    d.text(*p(5, 0, 4.6), "Window", "ts")
    d.dim(p(0, W + 0.8), p(L, W + 0.8), "Length", lx=p(L / 2, W + 0.8)[0] - 6, ly=p(L / 2, W + 0.8)[1] + 26)
    d.dim(p(L + 0.8, 0), p(L + 0.8, W), "Width", lx=p(L + 0.8, W / 2)[0] + 40, ly=p(L + 0.8, W / 2)[1] + 6)
    d.dim(p(L, 0, 0), p(L, 0, H), "Height", off=(14, 0), lx=p(L, 0, H / 2)[0] + 22, ly=p(L, 0, H / 2)[1], anchor="start")
    return d.svg()


def slab():
    d = D(420, 250, "Measure the slab's length, width and thickness")
    p = iso(200, 60, 20)
    L, W, T = 9, 6, 0.8
    box(d, p, 0, 0, 0, L, W, T)
    d.dim(p(0, W + 1.2), p(L, W + 1.2), "Length", lx=p(L / 2, W + 1.2)[0] - 8, ly=p(L / 2, W + 1.2)[1] + 26)
    d.dim(p(L + 0.9, 0), p(L + 0.9, W), "Width", lx=p(L + 0.9, W / 2)[0] + 40, ly=p(L + 0.9, W / 2)[1] + 6)
    d.dim(p(0, W, 0), p(0, W, T), "Thickness", off=(-16, 0), lx=p(0, W, T / 2)[0] - 24, ly=p(0, W, T / 2)[1] + 5, anchor="end")
    return d.svg()


def footing():
    d = D(420, 230, "Measure the footing's total length, width and depth")
    p = iso(120, 90, 16)
    L, W, H = 13, 1.6, 2.4
    box(d, p, 0, 0, 0, L, W, H)
    d.dim(p(0, W + 1.2), p(L, W + 1.2), "Total length", lx=p(L / 2, W + 1.2)[0] - 10, ly=p(L / 2, W + 1.2)[1] + 26)
    d.dim(p(L + 0.8, 0), p(L + 0.8, W), "Width", lx=p(L + 0.8, W / 2)[0] + 16, ly=p(L + 0.8, W / 2)[1] + 5, anchor="start")
    d.dim(p(0, W, 0), p(0, W, H), "Depth", off=(-14, 0), lx=p(0, W, H / 2)[0] - 22, ly=p(0, W, H / 2)[1] + 5, anchor="end")
    return d.svg()


def round_hole():
    d = D(420, 240, "Measure the hole's diameter and depth, and count the holes")
    cx, top, bot, rx, ry = 210, 50, 190, 60, 18
    d.parts.append(f'<path class="fc" d="M{cx-rx},{top} L{cx-rx},{bot} A{rx},{ry} 0 0 0 {cx+rx},{bot} L{cx+rx},{top} Z"/>')
    d.ellipse(cx, top, rx, ry, "fa")
    d.dim((cx - rx, top), (cx + rx, top), "Diameter", lx=cx, ly=top - 26)
    d.dim((cx + rx + 26, top), (cx + rx + 26, bot), "Depth", lx=cx + rx + 40, ly=(top + bot) / 2 + 5, anchor="start")
    d.text(cx, bot + 40, "Round column or post hole", "ts")
    return d.svg()


def square_column():
    d = D(420, 280, "Measure the column's width and height, and count the columns")
    p = iso(220, 212, 20)
    s, H = 2.2, 9
    box(d, p, 0, 0, 0, s, s, H)
    d.dim(p(s + 0.5, 0, H), p(s + 0.5, s, H), "Width", lx=p(s + 0.5, s, H)[0] + 16, ly=p(s + 0.5, s, H)[1] - 4, anchor="start")
    d.dim(p(0, s, 0), p(0, s, H), "Height", off=(-22, 0), lx=p(0, s, H / 2)[0] - 32, ly=p(0, s, H / 2)[1] + 5, anchor="end")
    return d.svg()


def steps():
    d = D(420, 260, "Measure each step's rise and run, the top landing depth and the step width")
    x0, y0, rise, run, n, land = 90, 200, 40, 50, 3, 120
    pts = [(x0, y0)]
    x, y = x0, y0
    for i in range(n):
        y -= rise; pts.append((x, y))
        x += run if i < n - 1 else land; pts.append((x, y))
    pts.append((x, y0))
    d.poly(pts, "fa")
    d.dim((x0 - 22, y0), (x0 - 22, y0 - rise), "Rise", lx=x0 - 30, ly=y0 - rise / 2 + 5, anchor="end")
    d.dim((x0, y0 - rise - 16), (x0 + run, y0 - rise - 16), "Run", lx=x0 + run / 2, ly=y0 - rise - 26)
    lx0 = x0 + run * (n - 1)
    d.dim((lx0, y0 - n * rise - 16), (lx0 + land, y0 - n * rise - 16), "Top step or landing", lx=lx0 + land / 2, ly=y0 - n * rise - 26)
    d.text(210, y0 + 34, "Side view \u00b7 the step width runs into the page", "ts")
    return d.svg()


def curb():
    d = D(420, 240, "Measure the curb width and height and the gutter width and thickness")
    base, x0, cw, ch, gw, gt = 170, 250, 46, 116, 130, 32
    d.poly([(x0, base - ch), (x0 + cw, base - ch), (x0 + cw, base), (x0 - gw, base), (x0 - gw, base - gt), (x0, base - gt)], "fa")
    d.dim((x0, base - ch - 16), (x0 + cw, base - ch - 16), "Curb width", lx=x0 + cw / 2, ly=base - ch - 26)
    d.dim((x0 + cw + 22, base), (x0 + cw + 22, base - ch), "Curb height", lx=x0 + cw + 30, ly=base - ch / 2 + 5, anchor="start")
    d.dim((x0 - gw, base + 18), (x0, base + 18), "Gutter width", lx=x0 - gw / 2, ly=base + 40)
    d.dim((x0 - gw - 18, base), (x0 - gw - 18, base - gt), "Thickness", lx=x0 - gw - 26, ly=base - gt / 2 + 5, anchor="end")
    d.text(210, 232, "Cross-section \u00b7 the length runs into the page", "ts")
    return d.svg()


def stairs():
    d = D(420, 270, "Measure the total rise from floor to floor, then the tread run")
    x0, y0, n = 80, 225, 6
    rise, run = 30, 34
    pts = [(x0, y0)]
    x, y = x0, y0
    for i in range(n):
        y -= rise; pts.append((x, y)); x += run; pts.append((x, y))
    d.poly(pts + [(x, y0)], "fa")
    d.line((x, y0 - n * rise), (x + 50, y0 - n * rise))
    d.line((x0 - 40, y0), (x + 50, y0))
    d.dim((x + 36, y0), (x + 36, y0 - n * rise), "Total rise", lx=x + 46, ly=y0 - n * rise / 2 + 5, anchor="start")
    d.dim((x0 - 18, y0), (x0 - 18, y0 - rise), "Riser", lx=x0 - 26, ly=y0 - rise / 2 + 5, anchor="end")
    d.dim((x0, y0 - rise - 14), (x0 + run, y0 - rise - 14), "Tread", lx=x0 + run / 2, ly=y0 - rise - 24)
    d.text(210, 258, "Total rise: floor to the finished floor above", "ts")
    return d.svg()


def roof():
    d = D(420, 280, "Measure the house length and width, the overhang, and the roof pitch")
    x0, base, w, peak, ov = 110, 190, 220, 80, 22
    top = (x0 + w / 2, base - peak - 16)
    d.poly([(x0 - ov, base - 2), top, (x0 + w + ov, base - 2), (x0 + w, base), (x0 + w / 2, base - peak), (x0, base)], "fc")
    d.poly([(x0, base), (x0 + w, base), (x0 + w, base + 44), (x0, base + 44)], "fb")
    d.dim((x0, base + 60), (x0 + w, base + 60), "House width", lx=x0 + w / 2, ly=base + 82)
    d.dim((x0 - ov, base + 12), (x0, base + 12), "", lx=0, ly=-20)
    d.text(x0 - ov - 6, base + 17, "Overhang", "ts", "end")
    slope = (base - 2 - top[1]) / (w / 2 + ov)
    ax = top[0] + 34; ay = top[1] + 34 * slope
    bx = ax + 64; cy = ay + 64 * slope
    d.line((ax, ay), (bx, ay), "dm"); d.line((bx, ay), (bx, cy), "dm")
    d.text((ax + bx) / 2, ay - 8, "12 in run", "ts")
    d.text(bx + 8, (ay + cy) / 2 + 5, "Rise", "tx", "start")
    d.text(210, 22, "Pitch = rise per 12 in of run", "ts")
    return d.svg()


DIAGRAMS = {"room": room, "slab": slab, "footing": footing, "round": round_hole, "square": square_column,
            "steps": steps, "curb": curb, "stairs": stairs, "roof": roof}

if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for name, fn in DIAGRAMS.items():
        (OUT / f"{name}.svg").write_text(fn())
    print("wrote", len(DIAGRAMS), "diagrams to", OUT)
