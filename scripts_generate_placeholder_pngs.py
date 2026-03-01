import os
import sys

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("  [SKIP] Pillow not installed. Run: pip install Pillow")
    sys.exit(0)

ROOT = os.environ.get("ROOT") or os.path.dirname(os.path.abspath(__file__))

FONT_PATHS = [
    r"C:\Windows\Fonts\arialbd.ttf",
    r"C:\Windows\Fonts\arial.ttf",
    r"C:\Windows\Fonts\segoeui.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
]


def load_font(size: int):
    for fp in FONT_PATHS:
        try:
            return ImageFont.truetype(fp, size)
        except Exception:
            pass
    return ImageFont.load_default()


def rgb(h: str):
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


created = 0


def make(rel, w, h, bg, label, lc="#BBBBBB", border=None, alpha=255):
    global created
    path = os.path.join(ROOT, "public", "assets", rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if os.path.exists(path):
        return

    img = Image.new("RGBA", (w, h), (*rgb(bg), alpha))
    draw = ImageDraw.Draw(img)

    stripe_color = (*rgb(lc), 18)
    for i in range(-h, w + h, 18):
        draw.line([(i, 0), (i + h, h)], fill=stripe_color, width=1)

    if border:
        bw = max(2, w // 60)
        draw.rectangle([bw, bw, w - bw - 1, h - bw - 1], outline=(*rgb(border), 220), width=bw)

    font_size = max(8, min(16, h // 6, w // 8))
    font = load_font(font_size)

    lines = label.split("\n")
    total_h = len(lines) * (font_size + 2)
    for li, line in enumerate(lines):
        bb = draw.textbbox((0, 0), line, font=font)
        tw = bb[2] - bb[0]
        tx = (w - tw) // 2
        ty = (h - total_h) // 2 + li * (font_size + 2)
        draw.text((tx, ty), line, fill=(*rgb(lc), 210), font=font)

    img.save(path, "PNG")
    created += 1


def t(rel, w, h, bg, label, lc="#AAAAAA", border=None, a=255):
    make(rel, w, h, bg, label, lc, border, a)


# Backgrounds
t("backgrounds/bg_battle.png", 1280, 720, "#0A1520", "BG BATTLE", "#334455", "#1A2A3A")
t("backgrounds/bg_main_menu.png", 1280, 720, "#10101E", "BG MAIN MENU", "#2A2A44", "#1A1A3A")
t("backgrounds/bg_result.png", 1280, 720, "#0A1520", "BG RESULT", "#334455", "#1A2A3A")
t("backgrounds/bg_lobby.png", 1280, 720, "#10101E", "BG LOBBY", "#2A2A44", "#1A1A3A")

# Board
t("board/board_skin.png", 720, 720, "#0C2D4A", "BOARD SKIN", "#1A5A8A", "#1A3A6A")

# UI
t("ui/logo.png", 300, 80, "#1A1A2E", "ONCHAINBATTLES", "#F5A623", "#F5A623")

# Card frames
t("cards/card_frame_standard.png", 140, 200, "#12122A", "STANDARD\nFRAME", "#5A5A9A", "#4A4A8A")
t("cards/card_frame_royal.png", 140, 200, "#1A1200", "ROYAL\nFRAME", "#C8960C", "#A07800")
t("cards/card_frame_static.png", 140, 200, "#0A1A0A", "STATIC\nFRAME", "#3A8A4A", "#2A6A3A")
t("cards/card_frame_spell.png", 140, 200, "#140A1E", "SPELL\nFRAME", "#8A3AAA", "#6A1A8A")
t("cards/card_back_pattern.png", 140, 200, "#101028", "CARD\nBACK", "#3A3A66", "#2A2A55")

# Card art + thumbnails
CARDS = [
    ("foot_soldier", "#1A2A1A", "#4A8A4A"),
    ("pikeman", "#1A1A2A", "#4A4A8A"),
    ("archer", "#1A2A2A", "#4A7A7A"),
    ("assassin", "#080810", "#3A3A5A"),
    ("militia", "#1A1A08", "#6A6A2A"),
    ("scout", "#081A08", "#3A6A3A"),
    ("lancer", "#1A0808", "#7A3A3A"),
    ("mystic", "#080818", "#5A3A8A"),
    ("messenger", "#0A1A14", "#3A7A6A"),
    ("king", "#1A1000", "#C8960C"),
    ("swordsman", "#161608", "#8A8A2A"),
    ("princess", "#1A0814", "#9A3A6A"),
    ("priest", "#140808", "#7A3A4A"),
    ("commander", "#080812", "#3A3A8A"),
    ("inquisitor", "#0A0000", "#6A1A1A"),
    ("knight", "#080818", "#3A3A7A"),
    ("knights_guard", "#04040E", "#1A1A4A"),
    ("scribe", "#141000", "#7A6A2A"),
    ("castle", "#14100A", "#6A5A3A"),
    ("temple", "#0A0A18", "#4A3A7A"),
    ("village", "#0A1808", "#3A6A3A"),
    ("disease", "#001400", "#2A7A2A"),
    ("casus_belli", "#1A0A00", "#7A4A1A"),
    ("reform", "#0A1A0A", "#4A7A4A"),
    ("civil_war", "#140000", "#6A1A1A"),
    ("earthquake", "#1A1000", "#8A6A1A"),
    ("war_horn", "#001020", "#1A5A8A"),
    ("coup", "#180004", "#7A1A3A"),
    ("treason", "#100A00", "#6A5A1A"),
    ("motherland", "#001800", "#1A7A1A"),
    ("peasant_revolt", "#0A1400", "#4A7A2A"),
]
for cid, bg, accent in CARDS:
    label = cid.replace("_", " ").upper()
    t(f"cards/art/{cid}.png", 140, 90, bg, label, accent, accent)
    t(f"cards/thumb/{cid}_thumb.png", 200, 200, bg, label, accent, accent)

# Icons (32x32)
ICONS = [
    ("icon_atk", "#3A0A0A", "#FF6666", "ATK"),
    ("icon_def", "#0A1A3A", "#4FC3F7", "DEF"),
    ("icon_leg", "#2A1A00", "#F5A623", "LEG"),
    ("icon_move", "#002A1A", "#00FF88", "MOV"),
    ("icon_cavalry", "#2A1A00", "#F5B833", "CAV"),
    ("icon_clock", "#1A1A1A", "#AAAAAA", "CLK"),
    ("icon_ranged", "#0A1A2A", "#4FC3F7", "RNG"),
    ("icon_type_standard", "#1A1A2A", "#6A6A9A", "STD"),
    ("icon_type_royal", "#1A1200", "#C8960C", "ROY"),
    ("icon_type_static", "#0A1A0A", "#4A8A4A", "STC"),
    ("icon_type_spell", "#12001A", "#8A3AAA", "SPL"),
]
for name, bg, accent, label in ICONS:
    t(f"icons/{name}.png", 32, 32, bg, label, accent, accent)

# FX markers (semi-transparent)
t("fx/marker_move.png", 120, 120, "#001A08", "MOVE", "#00CC66", "#00AA44", 180)
t("fx/marker_attack.png", 120, 120, "#1A0000", "ATTACK", "#CC3333", "#AA2222", 200)
t("fx/marker_aura.png", 120, 120, "#00081A", "AURA", "#3399CC", "#2277AA", 160)
t("fx/marker_selected.png", 120, 120, "#001A0A", "SELECT", "#00FF88", "#00CC66", 200)
t("fx/marker_danger.png", 120, 120, "#1A0000", "DANGER", "#FF4444", "#CC2222", 180)

total = sum(
    sum(1 for f in files if f.endswith(".png"))
    for _, _, files in os.walk(os.path.join(ROOT, "public", "assets"))
)
print(f"  Created {created} new PNGs.  Total on disk: {total} PNGs.")
