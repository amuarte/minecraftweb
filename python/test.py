import os
import json
import pyperclip
from tkinter import *
from tkinter import filedialog, simpledialog, messagebox
from PIL import Image, ImageTk

class AtlasEditor:
    def __init__(self, root):
        self.root = root
        self.root.title("Atlas Tile Editor z zoomem i zapisem danych 🔍")

        self.file_path = None
        self.image = None
        self.tk_img = None
        self.tile_size = 64
        self.tiles = {}
        self.scale = 1.0

        # --- PANEL GÓRNY ---
        top_frame = Frame(root)
        top_frame.pack(side=TOP, fill=X, pady=5)

        Button(top_frame, text="📂 Otwórz atlas", command=self.load_image).pack(side=LEFT, padx=5)
        Label(top_frame, text="Rozmiar kafelka:").pack(side=LEFT)
        self.entry_size = Entry(top_frame, width=5)
        self.entry_size.insert(0, "64")
        self.entry_size.pack(side=LEFT)
        Button(top_frame, text="🔲 Odśwież siatkę", command=self.redraw_grid).pack(side=LEFT, padx=5)
        Button(top_frame, text="💾 Zapisz kafelki", command=self.save_tiles).pack(side=RIGHT, padx=5)
        Button(top_frame, text="🧩 Zapisz dane", command=self.save_metadata).pack(side=RIGHT, padx=5)
        Button(top_frame, text="📋 Kopiuj dane", command=self.copy_metadata).pack(side=RIGHT, padx=5)
        Button(top_frame, text="🔍 Analizuj ASCII", command=self.analyze_ascii_png).pack(side=RIGHT, padx=5)

        # --- OBSZAR Z KANWĄ I SUWAKAMI ---
        self.canvas_frame = Frame(root)
        self.canvas_frame.pack(fill=BOTH, expand=True)

        self.canvas = Canvas(self.canvas_frame, bg="gray")
        self.canvas.pack(side=LEFT, fill=BOTH, expand=True)

        self.scroll_x = Scrollbar(self.canvas_frame, orient=HORIZONTAL, command=self.canvas.xview)
        self.scroll_x.pack(side=BOTTOM, fill=X)
        self.scroll_y = Scrollbar(self.canvas_frame, orient=VERTICAL, command=self.canvas.yview)
        self.scroll_y.pack(side=RIGHT, fill=Y)
        self.canvas.configure(xscrollcommand=self.scroll_x.set, yscrollcommand=self.scroll_y.set)

        # --- ZDARZENIA ---
        self.canvas.bind("<Button-1>", self.on_click)
        self.canvas.bind("<MouseWheel>", self.on_zoom)
        self.canvas.bind("<Button-4>", self.on_zoom)
        self.canvas.bind("<Button-5>", self.on_zoom)

    # === ŁADOWANIE I WYŚWIETLANIE ===
    def load_image(self):
        path = filedialog.askopenfilename(filetypes=[("Obrazy", "*.png;*.jpg;*.jpeg")])
        if not path:
            return
        self.file_path = path
        self.image = Image.open(path)
        self.scale = 1.0
        self.tiles.clear()
        self.display_image()

    def display_image(self):
        if not self.image:
            return
        scaled = self.image.resize(
            (int(self.image.width * self.scale), int(self.image.height * self.scale)),
            Image.NEAREST
        )
        self.tk_img = ImageTk.PhotoImage(scaled)
        self.canvas.delete("all")
        self.canvas.create_image(0, 0, anchor=NW, image=self.tk_img)
        self.draw_grid()
        self.canvas.config(scrollregion=self.canvas.bbox(ALL))

    def draw_grid(self):
        if not self.image:
            return
        try:
            self.tile_size = int(self.entry_size.get())
        except ValueError:
            messagebox.showerror("Błąd", "Rozmiar kafelka musi być liczbą.")
            return
        w, h = self.image.size
        step = self.tile_size * self.scale
        # Grubsze linie sieci dla lepszej widoczności
        for x in range(0, int(w * self.scale), int(step)):
            self.canvas.create_line(x, 0, x, int(h * self.scale), fill="lime", width=3)
        for y in range(0, int(h * self.scale), int(step)):
            self.canvas.create_line(0, y, int(w * self.scale), y, fill="lime", width=3)

    def on_zoom(self, event):
        if not self.image:
            return
        if event.delta > 0 or getattr(event, "num", 0) == 4:
            self.scale *= 1.1
        elif event.delta < 0 or getattr(event, "num", 0) == 5:
            self.scale /= 1.1
        self.scale = max(0.2, min(self.scale, 10))
        self.display_image()

    # === INTERAKCJA Z KAFELKAMI ===
    def on_click(self, event):
        if not self.image:
            return
        tx = int(event.x / (self.tile_size * self.scale))
        ty = int(event.y / (self.tile_size * self.scale))
        name = simpledialog.askstring("Nazwa kafelka", f"Nazwa dla kafelka ({tx}, {ty}):")
        if name:
            self.tiles[name] = {
                "x": tx * self.tile_size,
                "y": ty * self.tile_size,
                "width": self.tile_size,
                "height": self.tile_size
            }
            x1 = tx * self.tile_size * self.scale
            y1 = ty * self.tile_size * self.scale
            x2 = x1 + self.tile_size * self.scale
            y2 = y1 + self.tile_size * self.scale
            # Grubszy prostokąt (width=4) z jaśniejszym zielonym kolorem
            self.canvas.create_rectangle(x1, y1, x2, y2, outline="gold", width=4)
            # Czarny cień tekstu dla lepszej czytelności
            self.canvas.create_text(x1 + (self.tile_size * self.scale) / 2 + 1,
                                    y1 + (self.tile_size * self.scale) / 2 + 1,
                                    text=name, fill="black", font=("Arial", 10, "bold"))
            # Biały tekst
            self.canvas.create_text(x1 + (self.tile_size * self.scale) / 2,
                                    y1 + (self.tile_size * self.scale) / 2,
                                    text=name, fill="white", font=("Arial", 10, "bold"))

    def redraw_grid(self):
        if self.image:
            self.display_image()

    # === ZAPIS OBRAZÓW ===
    def save_tiles(self):
        if not self.image or not self.tiles:
            messagebox.showinfo("Info", "Brak nazwanych kafelków do zapisania.")
            return
        out_dir = "named_tiles"
        os.makedirs(out_dir, exist_ok=True)
        for name, data in self.tiles.items():
            x1, y1, w, h = data["x"], data["y"], data["width"], data["height"]
            tile = self.image.crop((x1, y1, x1 + w, y1 + h))
            tile.save(os.path.join(out_dir, f"{name}.png"))
        messagebox.showinfo("Zapisano", f"Zapisano {len(self.tiles)} kafelków w folderze '{out_dir}'.")

    # === ZAPIS I KOPIOWANIE METADANYCH ===
    def save_metadata(self):
        if not self.tiles:
            messagebox.showwarning("Uwaga", "Brak danych do zapisania.")
            return
        out_path = filedialog.asksaveasfilename(
            defaultextension=".json", filetypes=[("JSON files", "*.json")],
            title="Zapisz dane kafelków"
        )
        if not out_path:
            return
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(self.tiles, f, ensure_ascii=False, indent=4)
        messagebox.showinfo("Zapisano", f"Dane zapisano do '{os.path.basename(out_path)}'.")

    def copy_metadata(self):
        if not self.tiles:
            messagebox.showwarning("Uwaga", "Brak danych do skopiowania.")
            return
        text = json.dumps(self.tiles, ensure_ascii=False, indent=2)
        try:
            pyperclip.copy(text)
            messagebox.showinfo("Skopiowano", "Dane kafelków skopiowane do schowka.")
        except Exception:
            messagebox.showerror("Błąd", "Nie udało się skopiować danych (brak pyperclip?).")

    def analyze_ascii_png(self):
        """Analizuj ascii.png i konwertuj na mapę 0/1 podzieloną na 8x8"""
        try:
            # Załaduj ascii.png
            ascii_path = '../assets/minecraft/textures/font/ascii.png'
            if not os.path.exists(ascii_path):
                messagebox.showerror("Błąd", f"Nie znaleziono: {ascii_path}")
                return

            img = Image.open(ascii_path)

            # Konwertuj na RGBA
            if img.mode != 'RGBA':
                img = img.convert('RGBA')

            width, height = img.size

            # Przeanalizuj każdy 8x8 slot
            result = []
            char_index = 0

            for y in range(0, height, 8):
                for x in range(0, width, 8):
                    # Wytnij 8x8 slot
                    box = (x, y, x + 8, y + 8)
                    slot = img.crop(box)
                    pixels = list(slot.getdata())

                    # Sprawdź czy slot ma zawartość (przynajmniej 2 opakowe piksele)
                    opaque_count = sum(1 for p in pixels if p[3] > 0)
                    has_content = opaque_count > 2

                    # Konwertuj 8x8 na mapę 0/1
                    char_map = []
                    for i, p in enumerate(pixels):
                        # 1 jeśli pixel ma alpha > 0, 0 jeśli przezroczysty
                        char_map.append('1' if p[3] > 0 else '0')

                    # Podziel na 8 wierszy po 8 znaków
                    char_visual = '\n'.join([''.join(char_map[i*8:(i+1)*8]) for i in range(8)])

                    # Dodaj do wyniku
                    if 32 <= char_index < 127:
                        char_name = chr(char_index)
                    else:
                        char_name = f"0x{char_index:02x}"

                    result.append(f"Char {char_index:3d} ('{char_name}') at ({x:3d}, {y:2d}) - Content: {has_content}\n{char_visual}")
                    char_index += 1

            # Skopiuj do schowka
            output = '\n' + '='*50 + '\n'.join(result)
            try:
                pyperclip.copy(output)
                messagebox.showinfo("Analizę", f"Przeanalizowano ascii.png!\n\nWynik ({char_index} znaków) skopiowany do schowka.")
            except:
                # Jeśli pyperclip nie działa, wyświetl w oknie
                top = Toplevel(self.root)
                top.title("Analiza ASCII.PNG")
                text = Text(top, width=80, height=40)
                text.pack()
                text.insert("1.0", output[:5000])  # Pokaż pierwsze 5000 znaków

        except Exception as e:
            messagebox.showerror("Błąd", f"Błąd analizy: {str(e)}")

# === URUCHOMIENIE ===
root = Tk()
app = AtlasEditor(root)
root.geometry("1000x800")
root.mainloop()
