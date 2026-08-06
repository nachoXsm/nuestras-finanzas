#!/usr/bin/env python3
"""
Dos correcciones sobre Presupuesto_Puesta_a_Punto_Trailers.pdf

1) Quita la fecha "· 10/08/2026 al 09/09/2026" del subtítulo del encabezado (pág. 1).
2) Evita el corte del bloque "3 · Total — Opción A": mueve la barra de título
   desde el pie de la pág. 1 al inicio de la pág. 2, junto a su tabla,
   desplazando el contenido de la pág. 2 hacia abajo la altura de la barra.
"""
import sys
import pypdf
from pypdf.generic import DecodedStreamObject, NameObject

SRC = sys.argv[1] if len(sys.argv) > 1 else "orig.pdf"
DST = sys.argv[2] if len(sys.argv) > 2 else "fixed.pdf"

PAGE_CLIP = "156.25 156.25 2173.291 3177.1973 re"
BAR_H_PX = 24.0          # alto de la barra de sección (px CSS del documento)
BAR_TOP_P1 = 975.0       # y original de la barra (coordenadas del documento)
BAR_TOP_P2 = 1017.0      # inicio del área de contenido de la pág. 2
SHIFT_PX = BAR_H_PX      # cuánto baja el contenido de la pág. 2
SHIFT_DEV = SHIFT_PX * 3.125

reader = pypdf.PdfReader(SRC)
p1 = reader.pages[0].get_contents().get_data().decode("latin-1").split("\n")
p2 = reader.pages[1].get_contents().get_data().decode("latin-1").split("\n")

# ---------------------------------------------------------------- página 1
# (a) Quitar la fecha del subtítulo: el último Tj de esa línea contiene
#     "ALQUILER NQ (Neuquén) · 10/08/2026 al 09/09/2026". Cortamos después
#     del glifo ")" (000C), lo que elimina también el separador " · ".
date_fixed = False
for i, line in enumerate(p1):
    if "0024002F00340038002C002F00280035" in line and line.rstrip().endswith("Tj"):
        pre, rest = line.split("<", 1)
        hexstr, post = rest.split(">", 1)
        cut = hexstr.index("000C") + 4
        p1[i] = f"{pre}<{hexstr[:cut]}>{post}"
        date_fixed = True
        break
assert date_fixed, "no se encontró el subtítulo con la fecha"

# (b) Quitar el trazado de la barra verde de la sección 3 (queda en la pág. 2).
bar_path = []
bar_start = None
for i, line in enumerate(p1):
    if line.strip() == f"0 {BAR_TOP_P1 + BAR_H_PX:.0f} m":
        bar_start = i
        break
assert bar_start is not None, "no se encontró la barra de la sección 3"
bar_end = next(j for j in range(bar_start, len(p1)) if p1[j].strip() == "f")
bar_path = p1[bar_start:bar_end + 1]
del p1[bar_start:bar_end + 1]

# (c) Quitar el bloque de texto blanco "3 · Total — Opción A ..." del pie.
txt_idx = next(i for i, l in enumerate(p1) if l.strip() == "1 0 0 -1 10 991 Tm")
blk_start = next(i for i in range(txt_idx, -1, -1)
                 if p1[i].strip() == "q" and p1[i + 1].strip() == PAGE_CLIP)
blk_end = next(i for i in range(txt_idx, len(p1)) if p1[i].strip() == "ET") + 2
heading_text = p1[txt_idx:blk_end - 2]      # Tm + los Tj
del p1[blk_start:blk_end + 1]

# ---------------------------------------------------------------- página 2
# (d) Bajar todo el contenido de la pág. 2 el alto de la barra, insertando una
#     traslación justo después del recorte de página de cada bloque de nivel 0.
out, depth = [], 0
for i, line in enumerate(p2):
    out.append(line)
    s = line.strip()
    if s == "q":
        if depth == 0 and p2[i + 1].strip() == PAGE_CLIP:
            out.append(p2[i + 1])
            out.append(p2[i + 2])
            out.append(f"1 0 0 1 0 {SHIFT_DEV:.5f} cm")
            p2[i + 1] = p2[i + 2] = "\x00skip"
        depth += 1
    elif s == "Q":
        depth -= 1
p2 = [l for l in out if l != "\x00skip"]

# (e) Redibujar la barra + el título al inicio de la pág. 2, sobre su tabla.
dy = BAR_TOP_P2 - BAR_TOP_P1


def shift_y(line):
    """Suma dy a cada coordenada y de un operador de trazado (x y pares)."""
    parts = line.split()
    op = parts[-1]
    nums = [float(v) for v in parts[:-1]]
    for k in range(1, len(nums), 2):
        nums[k] += dy
    return " ".join(f"{v:.5f}".rstrip("0").rstrip(".") for v in nums) + " " + op


bar_p2 = [shift_y(l) if l.strip()[-1] in "mlc" else l for l in bar_path]
title = [l.replace("1 0 0 -1 10 991 Tm", f"1 0 0 -1 10 {991 + dy:.0f} Tm")
         for l in heading_text]

heading_block = [
    "q",
    PAGE_CLIP,
    "W* n",
    "q",
    "3.125 0 0 3.125 156.25 -3021.875 cm",
    ".3725 .4784 .3059 RG .3725 .4784 .3059 rg",
    "/G3 gs",
    *bar_p2,
    "1 1 1 RG 1 1 1 rg",
    "BT",
    "/F15 12 Tf",
    *title,
    "ET",
    "Q",
    "Q",
]
# se inserta al principio del flujo para respetar el orden de lectura
p2[1:1] = heading_block

# ---------------------------------------------------------------- escritura
writer = pypdf.PdfWriter(clone_from=SRC)
for page, data in zip(writer.pages, ["\n".join(p1), "\n".join(p2)]):
    stream = DecodedStreamObject()
    stream.set_data(data.encode("latin-1"))
    page[NameObject("/Contents")] = writer._add_object(stream)
    page.compress_content_streams()
writer.write(DST)
print(f"escrito {DST}")
