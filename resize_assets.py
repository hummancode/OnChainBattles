"""
resize_assets.py — Batch resize OnChainBattles art to spec dimensions.

Uses Pillow's LANCZOS resampling (highest quality downscale).
Creates a backup of originals in _originals/ before overwriting.

USAGE:
    python resize_assets.py                    # dry run (shows what would change)
    python resize_assets.py --apply            # actually resize files
    python resize_assets.py --apply --no-backup # skip backup (saves disk space)

Run from project root:  D:\OnChainBattles>
"""

import os
import sys
import shutil
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Pillow not installed. Run:  pip install Pillow")
    sys.exit(1)

# ─── Target dimensions from OCB_Master_Artwork_List ─────────────
# Format:  directory_glob → (width, height)
# Images already at target size are skipped.

RESIZE_RULES = {
    # Card art — exact display size in hand (140 wide × 90 art area)
    "public/assets/cards/art/*.png": (140, 90),

    # Card thumbnails — exact board unit size (100×100)
    "public/assets/cards/thumb/*.png": (100, 100),

    # Card frames — exact card size in hand (140×200)
    "public/assets/cards/card_frame_*.png": (140, 200),
    "public/assets/cards/card_back_pattern.png": (140, 200),

    # Everything else stays the same
    "public/assets/backgrounds/bg_main_menu.png": (1280, 720),
    "public/assets/backgrounds/bg_battle.png":    (1280, 720),
    "public/assets/backgrounds/bg_result.png":    (1280, 720),
    "public/assets/backgrounds/bg_lobby.png":     (1280, 720),
    "public/assets/backgrounds/bg_menu.png":      (1280, 720),
    "public/assets/backgrounds/bg_board.png": (720, 720),
    "public/assets/board/board_skin.png": (720, 720),
    "public/assets/icons/*.png": (64, 64),
    "public/assets/fx/*.png": (120, 120),
    "public/assets/ui/logo.png": (300, 80),
}


# ─── Helpers ────────────────────────────────────────────────────

def find_files(glob_pattern: str, project_root: Path) -> list[Path]:
    """Resolve a glob pattern relative to project root."""
    parts = glob_pattern.replace("/", os.sep)
    return sorted(project_root.glob(parts))


def resize_image(src: Path, target_w: int, target_h: int, dry_run: bool, backup_dir: Path | None):
    """Resize a single image if it doesn't match target dimensions."""
    try:
        img = Image.open(src)
    except Exception as e:
        print(f"  SKIP  {src.name} — can't open: {e}")
        return "skip"

    cur_w, cur_h = img.size

    # Already correct size
    if cur_w == target_w and cur_h == target_h:
        return "ok"

    ratio_tag = f"{cur_w}×{cur_h} → {target_w}×{target_h}"

    if dry_run:
        print(f"  WOULD RESIZE  {src.name}  ({ratio_tag})")
        return "would"

    # Backup original
    if backup_dir:
        rel = src.relative_to(src.parents[len(src.parts) - 2])
        backup_path = backup_dir / src.relative_to(backup_dir.parent.parent / "public")
        backup_path.parent.mkdir(parents=True, exist_ok=True)
        if not backup_path.exists():
            shutil.copy2(src, backup_path)

    # Resize with LANCZOS (best quality for downscaling)
    # Preserve alpha channel
    resized = img.resize((target_w, target_h), Image.LANCZOS)
    resized.save(src, "PNG", optimize=True)

    print(f"  RESIZED  {src.name}  ({ratio_tag})")
    return "resized"


# ─── Main ───────────────────────────────────────────────────────

def main():
    apply = "--apply" in sys.argv
    no_backup = "--no-backup" in sys.argv

    # Find project root (script should be in project root)
    project_root = Path.cwd()

    # Verify we're in the right place
    if not (project_root / "public" / "assets").is_dir():
        # Try script's own directory
        project_root = Path(__file__).parent
        if not (project_root / "public" / "assets").is_dir():
            print("ERROR: Run this script from the OnChainBattles project root.")
            print("       e.g.:  cd D:\\OnChainBattles && python resize_assets.py")
            sys.exit(1)

    backup_dir = None
    if apply and not no_backup:
        backup_dir = project_root / "public" / "_originals"
        backup_dir.mkdir(exist_ok=True)
        print(f"Backing up originals to: {backup_dir}\n")

    if not apply:
        print("=" * 60)
        print("DRY RUN — no files will be changed.")
        print("Add --apply to actually resize files.")
        print("=" * 60)
        print()

    stats = {"ok": 0, "resized": 0, "would": 0, "skip": 0, "missing": 0}

    for glob_pattern, (tw, th) in RESIZE_RULES.items():
        files = find_files(glob_pattern, project_root)

        if not files:
            # Single file pattern that doesn't exist
            if "*" not in glob_pattern:
                print(f"  MISSING  {glob_pattern}")
                stats["missing"] += 1
            continue

        print(f"\n[{glob_pattern}]  target: {tw}×{th}  ({len(files)} files)")

        for f in files:
            # Skip .DS_Store and non-PNG
            if f.suffix.lower() != ".png":
                continue
            result = resize_image(f, tw, th, dry_run=not apply, backup_dir=backup_dir)
            stats[result] += 1

    # Summary
    print("\n" + "=" * 60)
    if apply:
        print(f"DONE.  Resized: {stats['resized']}  |  Already correct: {stats['ok']}  |  Skipped: {stats['skip']}  |  Missing: {stats['missing']}")
        if backup_dir and backup_dir.exists():
            print(f"\nOriginals saved in: {backup_dir}")
            print("Delete _originals/ when you're happy with the results.")
    else:
        print(f"DRY RUN.  Would resize: {stats['would']}  |  Already correct: {stats['ok']}  |  Missing: {stats['missing']}")
        print("\nRun with --apply to execute.")


if __name__ == "__main__":
    main()
