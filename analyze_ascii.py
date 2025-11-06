#!/usr/bin/env python3
from PIL import Image
import json

# Załaduj ascii.png
img = Image.open('./assets/minecraft/textures/font/ascii.png')
width, height = img.size

print(f"Rozmiar ascii.png: {width}x{height}")
print(f"Liczba znaków w szerokości: {width // 8}")
print(f"Liczba znaków w wysokości: {height // 8}")

# Przeanalizuj każdy 8x8 slot
char_index = 0
char_map = {}

for y in range(0, height, 8):
    for x in range(0, width, 8):
        # Sprawdź czy slot ma jakieś piksele (nie jest pusty)
        box = (x, y, x + 8, y + 8)
        slot = img.crop(box)

        # Konwertuj do RGBA
        if slot.mode != 'RGBA':
            slot = slot.convert('RGBA')

        pixels = list(slot.getdata())

        # Zlicz opakowe piksele (alpha > 0)
        opaque_count = sum(1 for p in pixels if p[3] > 0)

        if opaque_count > 2:  # Przynajmniej kilka pikseli
            # Jest zawartość - to znak
            if 32 <= char_index < 127:
                ascii_char = chr(char_index)
                char_map[ascii_char] = {'x': x, 'y': y}
                print(f"[{char_index:3d}] '{ascii_char}' at ({x:3d}, {y:2d})")
            elif char_index < 256:
                char_map[f'0x{char_index:02x}'] = {'x': x, 'y': y}
                print(f"[{char_index:3d}] '0x{char_index:02x}' at ({x:3d}, {y:2d})")

        char_index += 1

# Zapisz mapę do JSON
with open('ascii_charmap.json', 'w') as f:
    json.dump(char_map, f, indent=2)

print(f"\nZnaleziono {len(char_map)} znaków")
print("Zapisano do ascii_charmap.json")
