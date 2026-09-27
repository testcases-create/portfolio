"""Narrows the variable fonts to the axis ranges the design uses and writes
woff2 files to src/assets/fonts. Re-run after changing the type scale.

    pip install fonttools brotli
    python3 scripts/subset-fonts.py

Archivo: width 100-125 and weight 400-700 (PLAN.md, typography).
Source Serif 4: weight 400-700 (prose, bold and italic only).
"""
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parent.parent
FONTSOURCE = ROOT / "node_modules" / "@fontsource-variable"
OUT = ROOT / "src" / "assets" / "fonts"

JOBS = [
    ("archivo/files/archivo-latin-wdth-normal.woff2", "archivo-latin-normal.woff2", {"wght": (400, 700), "wdth": (100, 125)}),
    ("source-serif-4/files/source-serif-4-latin-wght-normal.woff2", "source-serif-4-latin-normal.woff2", {"wght": (400, 700)}),
    ("source-serif-4/files/source-serif-4-latin-wght-italic.woff2", "source-serif-4-latin-italic.woff2", {"wght": (400, 700)}),
]

OUT.mkdir(parents=True, exist_ok=True)
for src, dest, axes in JOBS:
    path = FONTSOURCE / src
    font = instantiateVariableFont(TTFont(path), axes, updateFontNames=False)
    font.flavor = "woff2"
    font.save(OUT / dest)
    before, after = path.stat().st_size, (OUT / dest).stat().st_size
    print(f"{dest}: {before / 1000:.1f} KB -> {after / 1000:.1f} KB")
