"""
Generate a Figma-importable SVG "design page" of the RP Field Tech Assistant
state screens. Each state is a 375x812 phone artboard laid out on one canvas,
using the real brand tokens, embedded PNG logos, and geometry that matches the
live CSS. Drag the resulting .svg into Figma -> each artboard imports as an
editable frame with live text/vector layers.
"""
import base64, html
from pathlib import Path
from PIL import Image

# Repo-relative: this file lives in docs/design/, public/ is two levels up.
ROOT = Path(__file__).resolve().parents[2]
PUB = ROOT / "public"
OUT = ROOT / "docs" / "design" / "rp-field-tech-states.svg"

# ---- brand tokens (mirror style.css) ----
L = dict(bg="#f4f7fb", surface="#ffffff", surface2="#eef3f9", text="#1D3552",
         muted="#5a6b82", border="#dbe5f0", brand="#1D3552", accent="#732CFD",
         alert="#F41234", userbg="#732CFD", userfg="#ffffff", botbg="#ffffff",
         botfg="#1D3552", rpblue="#D9E4F0", subtext="#eef3f9")
D = dict(bg="#0e1a2b", surface="#16273d", surface2="#1d3552", text="#f4f6fa",
         muted="#9aabc4", border="#2a4068", brand="#16273d", accent="#732CFD",
         alert="#F41234", userbg="#732CFD", userfg="#ffffff", botbg="#16273d",
         botfg="#f4f6fa", rpblue="#D9E4F0", subtext="#1d3552")

FONT_BODY = "Nunito Sans, sans-serif"
FONT_TITLE = "Syne, sans-serif"
FONT_MONO = "JetBrains Mono, monospace"

W, H = 375, 812
HEAD_H = 56

def datauri(p):
    b = Path(p).read_bytes()
    return "data:image/png;base64," + base64.b64encode(b).decode()

WHITE_LOGO = datauri(PUB / "rp-logo-white.png")
NAVY_LOGO = datauri(PUB / "rp-logo-navy.png")
MARK = datauri(PUB / "rp-mark.png")
wl_w, wl_h = Image.open(PUB / "rp-logo-white.png").size
WL_AR = wl_w / wl_h  # aspect ratio of wordmark

def esc(s): return html.escape(s, quote=True)

def wrap(text, maxchars):
    words, lines, cur = text.split(), [], ""
    for w in words:
        if len(cur) + len(w) + 1 <= maxchars:
            cur = (cur + " " + w).strip()
        else:
            lines.append(cur); cur = w
    if cur: lines.append(cur)
    return lines

# ---------- primitive helpers (all coordinates are frame-local) ----------
def rect(x, y, w, h, fill, rx=0, stroke=None, sw=1, extra=""):
    s = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ""
    return f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{rx}" fill="{fill}"{s}{(" "+extra) if extra else ""}/>'

def txt(x, y, s, size, fill, font=FONT_BODY, weight=400, anchor="start", spacing=None, opacity=None):
    ls = f' letter-spacing="{spacing}"' if spacing else ""
    op = f' opacity="{opacity}"' if opacity is not None else ""
    return (f'<text x="{x:.1f}" y="{y:.1f}" font-family="{font}" font-size="{size}" '
            f'font-weight="{weight}" fill="{fill}" text-anchor="{anchor}"{ls}{op}>{esc(s)}</text>')

def img(x, y, w, h, href, rx=None):
    clip = ""
    return f'<image x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" href="{href}" preserveAspectRatio="xMidYMid meet"/>'

def hamburger(cx, cy, c):
    o = []
    for dy in (-5, 0, 5):
        o.append(f'<rect x="{cx-8}" y="{cy+dy-1}" width="16" height="2" rx="1" fill="{c}"/>')
    return "".join(o)

def moon(cx, cy, c):
    # crescent: outer circle minus offset circle
    return (f'<circle cx="{cx}" cy="{cy}" r="7" fill="{c}"/>'
            f'<circle cx="{cx+3}" cy="{cy-2}" r="6" fill="{{HEADER_BG}}"/>')

def send_icon(cx, cy, c, s=0.85):
    # paper-plane path from the app, scaled & centered around (cx,cy)
    return (f'<g transform="translate({cx-11*s},{cy-11*s}) scale({s})">'
            f'<path d="M2 21l21-9L2 3v7l15 2-15 2z" fill="{c}"/></g>')

def spinner(cx, cy, r, track, arc):
    import math
    def pt(a):
        return (cx + r*math.cos(math.radians(a)), cy + r*math.sin(math.radians(a)))
    x0,y0 = pt(-90); x1,y1 = pt(180)
    return (f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{track}" stroke-width="3"/>'
            f'<path d="M{x0:.1f},{y0:.1f} A{r},{r} 0 0 1 {x1:.1f},{y1:.1f}" '
            f'fill="none" stroke="{arc}" stroke-width="3" stroke-linecap="round"/>')

# ---------- shared frame chrome ----------
def header(t, initials="JM", show_sub=True):
    o = [rect(0, 0, W, HEAD_H, t["brand"])]
    o.append(hamburger(28, HEAD_H/2, "#ffffff"))
    lw = 22 * WL_AR
    o.append(img(52, HEAD_H/2 - 11, lw, 22, WHITE_LOGO))
    if show_sub:
        o.append(f'<line x1="{52+lw+10}" y1="{HEAD_H/2-9}" x2="{52+lw+10}" y2="{HEAD_H/2+9}" stroke="rgba(255,255,255,0.28)"/>')
        o.append(txt(52+lw+18, HEAD_H/2+3.5, "FIELD TECH", 8, t["rpblue"], FONT_MONO, 500, spacing="1.6"))
    # right controls: theme + profile
    tx = W - 30 - 44
    o.append(f'<circle cx="{tx}" cy="{HEAD_H/2}" r="16" fill="none" stroke="rgba(255,255,255,0.45)"/>')
    o.append(moon(tx, HEAD_H/2, "#ffffff").replace("{HEADER_BG}", t["brand"]))
    px = W - 26
    o.append(f'<circle cx="{px}" cy="{HEAD_H/2}" r="16" fill="{t["accent"]}"/>')
    o.append(txt(px, HEAD_H/2+4, initials, 11, "#ffffff", FONT_MONO, 700, anchor="middle"))
    return "".join(o)

def composer(t):
    y = H - 64
    o = [rect(0, y, W, 64, t["surface"]), f'<line x1="0" y1="{y}" x2="{W}" y2="{y}" stroke="{t["border"]}"/>']
    o.append(rect(10, y+10, W-10-58, 44, t["bg"], rx=20, stroke=t["border"]))
    o.append(txt(24, y+37, "Ask a question\u2026", 15, t["muted"]))
    o.append(f'<circle cx="{W-32}" cy="{y+32}" r="22" fill="{t["accent"]}"/>')
    o.append(send_icon(W-32, y+32, "#ffffff"))
    return "".join(o)

def welcome_card(t):
    x, y, w = 12, HEAD_H+14, W-24
    o = [rect(x, y, w, 108, t["surface"], rx=12, stroke=t["border"])]
    lines = wrap("Ask about PurpleSeal\u2122 / PurpleReign\u2122 frac plugs, pumpdown rates, "
                 "WLAK components, shear ratings, setting tools, or any ENG-TB bulletin.", 40)
    yy = y+26
    for ln in lines:
        o.append(txt(x+16, yy, ln, 14, t["text"])); yy += 19
    o.append(txt(x+16, yy+6, "If the docs don't cover it, contact your", 12, t["muted"]))
    o.append(txt(x+16, yy+22, "supervisor or engineering.", 12, t["muted"]))
    return "".join(o)

def bubbles(t):
    o = []
    # user bubble (right)
    uw = 250
    ux = W-12-uw
    utext = 'Pressure rating for the 4.38" plug in 5.5" 17# casing?'
    ul = wrap(utext, 30)
    uh = 16 + len(ul)*20
    o.append(rect(ux, HEAD_H+16, uw, uh, t["userbg"], rx=16))
    yy = HEAD_H+16+24
    for ln in ul:
        o.append(txt(ux+14, yy, ln, 15, t["userfg"])); yy += 20
    # bot bubble (left)
    by = HEAD_H+16+uh+12
    bw = 300
    blines = ['8,000 psi in 5.5" 17# casing.',
              '(17.0 / 20.0 ppf -> 8,000 / 10,000 psi.)']
    bh = 16 + len(blines)*20 + 26
    o.append(rect(12, by, bw, bh, t["botbg"], rx=16, stroke=t["border"]))
    yy = by+24
    # first line bold (the value)
    o.append(txt(26, yy, blines[0], 15, t["botfg"], weight=700)); yy += 20
    o.append(txt(26, yy, blines[1], 14, t["botfg"])); yy += 24
    o.append(txt(26, yy, "Source: RPL-FSM-10001 Rev 26", 12, t["muted"], FONT_MONO))
    return "".join(o)

def sidebar(t, with_menu=False):
    """Chat-history drawer over a dimmed transcript."""
    o = [f'<rect x="0" y="0" width="{W}" height="{H}" fill="rgba(0,0,0,0.4)"/>']  # overlay
    sw = 280
    o.append(rect(0, 0, sw, H, t["surface"], stroke=t["border"]))
    # head
    o.append(txt(16, 34, "Chats", 15, t["text"], FONT_TITLE, 700))
    o.append(rect(sw-84, 16, 68, 30, t["accent"], rx=8))
    o.append(txt(sw-50, 36, "+ New", 12, "#ffffff", FONT_MONO, anchor="middle"))
    o.append(f'<line x1="0" y1="56" x2="{sw}" y2="56" stroke="{t["border"]}"/>')
    rows = [("Pressure rating 4.38\" 5.5\" 17#", True),
            ("Pumpdown 5.5\" 20# regular", False),
            ("StageSaver shear pin count", False),
            ("Setting tool misfire steps", False),
            ("Haynesville frac plug approval", False)]
    ry = 66
    for i,(name, active) in enumerate(rows):
        if active:
            o.append(rect(8, ry, sw-16, 40, t["surface2"], rx=8))
            o.append(rect(8, ry, 3, 40, t["accent"]))
        name_clip = name if len(name)<=24 else name[:24]+"\u2026"
        o.append(txt(18, ry+25, name_clip, 13, t["text"]))
        o.append(txt(sw-22, ry+27, "\u22ee", 18, t["muted"], anchor="middle"))
        ry += 46
    if with_menu:
        # popover for the active row (row 0)
        mx, my = sw-166, 66+34
        o.append(rect(mx, my, 150, 118, t["surface"], rx=10, stroke=t["border"]))
        items = [("Rename", t["text"]), ("Export", t["text"]), ("Delete", t["alert"])]
        iy = my+16
        for label, col in items:
            o.append(txt(mx+14, iy+14, label, 14, col)); iy += 34
    return "".join(o)

def profile_popover(t):
    o = []
    pw, ph = 244, 128
    px = W-12-pw
    py = HEAD_H+8
    o.append(rect(px, py, pw, ph, t["surface"], rx=12, stroke=t["border"]))
    # avatar (mark) + name + email
    o.append(rect(px+14, py+14, 40, 40, t["surface2"], rx=10))
    o.append(img(px+19, py+19, 30, 30, MARK))
    o.append(txt(px+64, py+30, "Jordan Miller", 14, t["text"], FONT_TITLE, 700))
    o.append(txt(px+64, py+48, "jordan.miller@repeatprecision.com", 10.5, t["muted"]))
    o.append(f'<line x1="{px+12}" y1="{py+66}" x2="{px+pw-12}" y2="{py+66}" stroke="{t["border"]}"/>')
    o.append(rect(px+12, py+78, pw-24, 38, t["surface"], rx=8, stroke=t["border"]))
    o.append(txt(px+24, py+102, "Log out", 14, t["alert"]))
    return "".join(o)

import re
def slug(s): return re.sub(r'[^A-Za-z0-9]+', '-', s).strip('-')

# ---------- artboard assembler ----------
def artboard(x, y, label, body_fn, bg_token="bg", theme=L, dark_attr=False):
    t = theme
    cid = "clip-" + slug(label)
    inner = [f'<clipPath id="{cid}"><rect x="0" y="0" width="{W}" height="{H}" rx="28"/></clipPath>']
    content = [rect(0, 0, W, H, t[bg_token])]
    content.append(body_fn(t))
    g = (f'<g transform="translate({x},{y})">'
         f'<rect x="-1" y="-1" width="{W+2}" height="{H+2}" rx="29" fill="none" stroke="#c7d2e0" stroke-width="1"/>'
         f'<g clip-path="url(#{cid})">' + "".join(inner) + "".join(content) + '</g>'
         f'<text x="{W/2}" y="{H+34}" font-family="{FONT_MONO}" font-size="13" font-weight="500" '
         f'fill="#334" text-anchor="middle" letter-spacing="0.5">{esc(label)}</text>'
         f'</g>')
    return g

# ---------- state bodies ----------
def state_splash(t):
    # navy->purple gradient, white wordmark, label, spinner
    o = [f'<rect x="0" y="0" width="{W}" height="{H}" fill="url(#splashgrad)"/>']
    lw = 232
    o.append(img(W/2-lw/2, H/2-120, lw, lw/WL_AR, WHITE_LOGO))
    o.append(txt(W/2, H/2-10, "FIELD TECH ASSISTANT", 13, "#D9E4F0", FONT_MONO, anchor="middle", spacing="2.4"))
    o.append(spinner(W/2, H/2+40, 15, "rgba(217,228,240,0.28)", "#9B7BFF"))
    return "".join(o)

def state_welcome(t):
    return header(t) + welcome_card(t) + composer(t)

def state_convo(t):
    return header(t) + bubbles(t) + composer(t)

def state_drawer(t):
    return header(t) + welcome_card(t) + composer(t) + sidebar(t)

def state_chatmenu(t):
    return header(t) + welcome_card(t) + composer(t) + sidebar(t, with_menu=True)

def state_profile(t):
    return header(t) + welcome_card(t) + composer(t) + profile_popover(t)

# ---------- layout ----------
COLS = 4
GAPX, GAPY = 70, 130
MX, MY = 80, 150
frames = [
    ("Splash", state_splash, L, "brand"),
    ("Welcome (light)", state_welcome, L, "bg"),
    ("Conversation (light)", state_convo, L, "bg"),
    ("Conversation (dark)", state_convo, D, "bg"),
    ("Chat history drawer", state_drawer, L, "bg"),
    ("Chat options menu", state_chatmenu, L, "bg"),
    ("Profile & logout", state_profile, L, "bg"),
]

CANVAS_W = MX*2 + COLS*W + (COLS-1)*GAPX
rows_n = (len(frames) + COLS - 1)//COLS
CANVAS_H = MY + rows_n*(H+GAPY) + 40

parts = []
for i,(label, fn, theme, bgtok) in enumerate(frames):
    r, c = divmod(i, COLS)
    x = MX + c*(W+GAPX)
    y = MY + r*(H+GAPY)
    parts.append(artboard(x, y, label, fn, bgtok, theme))

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{CANVAS_W}" height="{CANVAS_H}" viewBox="0 0 {CANVAS_W} {CANVAS_H}" font-family="{FONT_BODY}">
<defs>
<linearGradient id="splashgrad" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#16273d"/><stop offset="0.45" stop-color="#1D3552"/><stop offset="1" stop-color="#3a2a7a"/>
</linearGradient>
</defs>
<rect x="0" y="0" width="{CANVAS_W}" height="{CANVAS_H}" fill="#f0f3f8"/>
<text x="{MX}" y="{MY-70}" font-family="{FONT_TITLE}" font-size="34" font-weight="800" fill="#1D3552">RP Field Tech Assistant</text>
<text x="{MX}" y="{MY-42}" font-family="{FONT_MONO}" font-size="14" fill="#5a6b82" letter-spacing="1">UI STATE SCREENS \u00b7 375\u00d7812 \u00b7 generated from live styles</text>
{''.join(parts)}
</svg>'''

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(svg, encoding="utf-8")
print("wrote", OUT, len(svg), "bytes;", len(frames), "artboards;", f"canvas {CANVAS_W}x{CANVAS_H}")
