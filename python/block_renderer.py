from PIL import Image
import os
import platform
import subprocess
from tkinter import Tk, filedialog

import math

def open_file(path):
    if platform.system() == "Windows":
        os.startfile(path)
    elif platform.system() == "Darwin":  # macOS
        subprocess.run(["open", path])
    else:  # Linux
        subprocess.run(["xdg-open", path])

def isometric_projection(img_path, output_path, wall_height=50):
    img = Image.open(img_path).convert("RGBA")
    w, h = img.size

    # Nowy obraz izometryczny
    iso_w = int(w + h)
    iso_h = int((w + h) / 2 + wall_height)
    iso_img = Image.new("RGBA", (iso_w, iso_h), (0,0,0,0))

    # Stałe do izometrii
    cos30 = math.cos(math.radians(30))
    sin30 = math.sin(math.radians(30))

    pixels = img.load()
    iso_pixels = iso_img.load()

    for x in range(w):
        for y in range(h):
            px = pixels[x, y]
            if px[3] == 0:
                continue  # pomijamy przezroczyste piksele
            iso_x = int((x - y) * cos30 + h)
            iso_y = int((x + y) * sin30)
            iso_pixels[iso_x, iso_y] = px

    # Dodanie „ściany” pod spodem (ciemny półprzezroczysty pasek)
    wall = Image.new("RGBA", (iso_w, wall_height), (0, 0, 0, 80))
    iso_img.paste(wall, (0, iso_h - wall_height), wall)

    iso_img.save(output_path)
    print(f"Zapisano: {output_path}")
    open_file(output_path)

def main():
    root = Tk()
    root.withdraw()
    file_path = filedialog.askopenfilename(
        title="Wybierz obraz PNG",
        filetypes=[("Pliki PNG", "*.png"), ("Wszystkie pliki", "*.*")]
    )
    if file_path:
        output_path = os.path.splitext(file_path)[0] + "_isometric.png"
        isometric_projection(file_path, output_path)
    else:
        print("Nie wybrano pliku.")

if __name__ == "__main__":
    main()
