#!/usr/bin/env python3
"""Builds side-by-side comparisons of the reference phone screenshots and our captures.

Usage:
  python3 scripts/compare-visual.py --import-refs DIR   # crop Android status/nav bars from the
                                                        # original screenshots into docs/visual-qa/reference
  python3 scripts/compare-visual.py                      # write docs/visual-qa/compare/*.png
Reference files are matched by content (see MAP); the Work-phase timer reference was not supplied.
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
QA = ROOT / 'docs' / 'visual-qa'
# reference name -> our capture name
MAP = {
    'editor-bottom': 'phone-editor-bottom',
    'editor-top': 'phone-editor-top',
    'list-menu': 'phone-list-menu',
    'list': 'phone-list',
    'timer-prepare': 'phone-timer-prepare',
}
STATUS_BAR, NAV_BAR = 80, 2000 - 1962  # px in the 923x2000 originals


def import_refs(src: Path) -> None:
    out = QA / 'reference'
    out.mkdir(parents=True, exist_ok=True)
    # Original upload order: editor-bottom, editor-top, list-menu, list, timer-prepare.
    files = sorted(p for p in src.iterdir() if p.suffix.lower() in ('.jpg', '.jpeg', '.png'))
    for name, f in zip(MAP.keys(), files):
        im = Image.open(f).convert('RGB')
        im.crop((0, STATUS_BAR, im.width, im.height - NAV_BAR)).save(out / f'{name}.jpg', quality=88)
        print('reference', name, '<-', f.name)


def compare() -> None:
    out = QA / 'compare'
    out.mkdir(parents=True, exist_ok=True)
    for ref_name, act_name in MAP.items():
        ref_p, act_p = QA / 'reference' / f'{ref_name}.jpg', QA / 'actual' / f'{act_name}.png'
        if not ref_p.exists() or not act_p.exists():
            print('skip', ref_name)
            continue
        act = Image.open(act_p).convert('RGB')
        ref = Image.open(ref_p).convert('RGB')
        ref = ref.resize((act.width, round(ref.height * act.width / ref.width)), Image.LANCZOS)
        h = max(ref.height, act.height) + 28
        canvas = Image.new('RGB', (act.width * 2 + 12, h), 'white')
        canvas.paste(ref, (0, 28))
        canvas.paste(act, (act.width + 12, 28))
        d = ImageDraw.Draw(canvas)
        d.text((6, 8), f'reference: {ref_name}', fill='black')
        d.text((act.width + 18, 8), f'implementation: {act_name}', fill='black')
        canvas.save(out / f'{ref_name}.png')
        print('compare', ref_name)


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == '--import-refs':
        import_refs(Path(sys.argv[2]))
    else:
        compare()
