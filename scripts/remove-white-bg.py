"""Remove fundo branco de PNGs do mascote, gerando canal alfa."""
from __future__ import annotations

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "src" / "assets"


def remove_checkerboard_background(
    input_path: Path,
    output_path: Path,
) -> None:
    """Remove fundo xadrez (checkerboard) e neutros conectados à borda."""
    img = Image.open(input_path).convert("RGBA")
    arr = np.array(img)
    h, w = arr.shape[:2]

    r = arr[..., 0].astype(float)
    g = arr[..., 1].astype(float)
    b = arr[..., 2].astype(float)
    max_c = np.maximum(np.maximum(r, g), b)
    min_c = np.minimum(np.minimum(r, g), b)
    saturation = max_c - min_c
    luminance = (r + g + b) / 3.0

    is_neutral = saturation < 35
    is_bg_candidate = is_neutral & (
        (luminance > 190) | (luminance < 115) | (luminance > 240)
    )

    to_remove = np.zeros((h, w), dtype=bool)
    visited = np.zeros((h, w), dtype=bool)
    queue: deque[tuple[int, int]] = deque()

    for x in range(w):
        for y in (0, h - 1):
            if is_bg_candidate[y, x]:
                queue.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if is_bg_candidate[y, x]:
                queue.append((x, y))

    while queue:
        x, y = queue.popleft()
        if x < 0 or x >= w or y < 0 or y >= h:
            continue
        if visited[y, x] or not is_bg_candidate[y, x]:
            continue
        visited[y, x] = True
        to_remove[y, x] = True
        queue.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])

    alpha = arr[..., 3].astype(float)
    alpha[to_remove] = 0
    arr[..., 3] = alpha.astype(np.uint8)
    Image.fromarray(arr).save(output_path, "PNG", optimize=True)
    print(f"OK (checkerboard): {output_path.name}")


def remove_with_rembg(input_path: Path, output_path: Path) -> None:
    """Remove fundo com modelo IA (recomendado para PNGs com xadrez embutido)."""
    try:
        from rembg import remove as rembg_remove
    except ImportError as exc:
        raise SystemExit("Instale rembg: pip install rembg onnxruntime") from exc

    output_path.write_bytes(rembg_remove(input_path.read_bytes()))
    print(f"OK (rembg): {output_path.name} ({output_path.stat().st_size // 1024} KB)")


def remove_white_background(
    input_path: Path,
    output_path: Path,
    *,
    luminance_threshold: float = 238.0,
    saturation_threshold: float = 28.0,
) -> None:
    img = Image.open(input_path).convert("RGBA")
    arr = np.array(img)
    h, w = arr.shape[:2]

    r = arr[..., 0].astype(float)
    g = arr[..., 1].astype(float)
    b = arr[..., 2].astype(float)
    luminance = (r + g + b) / 3.0
    max_c = np.maximum(np.maximum(r, g), b)
    min_c = np.minimum(np.minimum(r, g), b)
    saturation = max_c - min_c

    is_bg = (luminance > luminance_threshold) & (saturation < saturation_threshold)

    to_remove = np.zeros((h, w), dtype=bool)
    visited = np.zeros((h, w), dtype=bool)
    queue: deque[tuple[int, int]] = deque()

    for x in range(w):
        if is_bg[0, x]:
            queue.append((x, 0))
        if is_bg[h - 1, x]:
            queue.append((x, h - 1))
    for y in range(h):
        if is_bg[y, 0]:
            queue.append((0, y))
        if is_bg[y, w - 1]:
            queue.append((w - 1, y))

    while queue:
        x, y = queue.popleft()
        if x < 0 or x >= w or y < 0 or y >= h:
            continue
        if visited[y, x] or not is_bg[y, x]:
            continue
        visited[y, x] = True
        to_remove[y, x] = True
        queue.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])

    alpha = arr[..., 3].astype(float)
    alpha[to_remove] = 0

    # Suaviza bordas anti-aliasing do recorte
    edge_mask = np.zeros((h, w), dtype=bool)
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            if to_remove[y, x]:
                continue
            if to_remove[y - 1 : y + 2, x - 1 : x + 2].any():
                edge_mask[y, x] = True

    for y, x in zip(*np.where(edge_mask)):
        lum = luminance[y, x]
        if lum > 200:
            fade = max(0.0, min(255.0, 255.0 * (luminance_threshold - lum) / 45.0))
            alpha[y, x] = min(alpha[y, x], fade)

    arr[..., 3] = alpha.astype(np.uint8)
    Image.fromarray(arr).save(output_path, "PNG", optimize=True)
    print(f"OK: {output_path.name} ({output_path.stat().st_size // 1024} KB)")


def main() -> None:
    jobs = [
        ("mascot-hero.png", "mascot-hero.png"),
        ("mascot-hero.png", "mascot-hero-transparent.png"),
        ("mascot-balloon.png", "mascot-balloon.png"),
    ]

    for src_name, out_name in jobs:
        src = ASSETS / src_name
        if not src.exists():
            print(f"Pulando {src_name}: arquivo não encontrado")
            continue
        remove_white_background(src, ASSETS / out_name)


if __name__ == "__main__":
    main()
