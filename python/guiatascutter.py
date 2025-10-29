from PIL import Image, ImageDraw
import tkinter as tk
from tkinter import filedialog, messagebox
from PIL import ImageTk
import json

class GUIAtlasCutter:
    def __init__(self):
        self.atlas = None
        self.crop_data = []
        self.point1 = None
        self.point2 = None
        self.zoom = 1.0
        self.pan_x = 0
        self.pan_y = 0
        self.dragging = False
        self.last_drag_x = 0
        self.last_drag_y = 0
        
        self.root = tk.Tk()
        self.root.title("GUI Atlas Cutter")
        self.root.geometry("1000x800")
        
        tk.Button(self.root, text="Załaduj atlas", command=self.load_atlas, width=30).pack(pady=5)
        
        # Zoom controls
        zoom_frame = tk.Frame(self.root)
        zoom_frame.pack(pady=5)
        tk.Button(zoom_frame, text="Zoom +", command=lambda: self.set_zoom(self.zoom * 1.2)).pack(side=tk.LEFT, padx=5)
        tk.Button(zoom_frame, text="Zoom -", command=lambda: self.set_zoom(self.zoom / 1.2)).pack(side=tk.LEFT, padx=5)
        tk.Button(zoom_frame, text="Fit", command=self.fit_zoom).pack(side=tk.LEFT, padx=5)
        self.zoom_label = tk.Label(zoom_frame, text="Zoom: 1.0x")
        self.zoom_label.pack(side=tk.LEFT, padx=5)
        
        # Canvas
        self.canvas = tk.Canvas(self.root, bg="gray20", width=900, height=500, cursor="crosshair")
        self.canvas.pack(pady=10, fill=tk.BOTH, expand=True)
        self.canvas.bind("<Button-1>", self.on_canvas_click)
        self.canvas.bind("<MouseWheel>", self.on_mousewheel)
        self.canvas.bind("<Button-4>", self.on_mousewheel)
        self.canvas.bind("<Button-5>", self.on_mousewheel)
        self.canvas.bind("<Button-3>", self.on_drag_start)
        self.canvas.bind("<B3-Motion>", self.on_drag)
        self.canvas.bind("<ButtonRelease-3>", self.on_drag_end)
        
        # Info
        info_frame = tk.Frame(self.root)
        info_frame.pack(pady=5, fill=tk.X, padx=5)
        
        tk.Label(info_frame, text="Punkt 1:").pack(side=tk.LEFT, padx=5)
        self.p1_label = tk.Label(info_frame, text="---", fg="red")
        self.p1_label.pack(side=tk.LEFT, padx=5)
        
        tk.Label(info_frame, text="Punkt 2:").pack(side=tk.LEFT, padx=5)
        self.p2_label = tk.Label(info_frame, text="---", fg="blue")
        self.p2_label.pack(side=tk.LEFT, padx=5)
        
        tk.Label(info_frame, text="Nazwa:").pack(side=tk.LEFT, padx=5)
        self.name_input = tk.Entry(info_frame, width=15)
        self.name_input.pack(side=tk.LEFT, padx=5)
        
        tk.Button(info_frame, text="Wytnij & Dodaj", command=self.crop, bg="#4CAF50", fg="white").pack(side=tk.LEFT, padx=5)
        tk.Button(info_frame, text="Wyczyść", command=self.clear_points).pack(side=tk.LEFT, padx=5)
        
        # Lista
        tk.Label(self.root, text="Wycięte elementy (Delete - usuń):").pack(pady=5)
        self.listbox = tk.Listbox(self.root, height=4)
        self.listbox.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        self.listbox.bind('<Delete>', lambda e: self.delete_selected())
        
        # Eksport
        export_frame = tk.Frame(self.root)
        export_frame.pack(pady=5)
        tk.Button(export_frame, text="Eksportuj JSON", command=self.export_json, bg="#2196F3", fg="white").pack(side=tk.LEFT, padx=5)
        tk.Button(export_frame, text="Eksportuj PNG", command=self.export_png, bg="#FF9800", fg="white").pack(side=tk.LEFT, padx=5)
        
        self.photo = None
        self.displayed_atlas = None
        
    def load_atlas(self):
        path = filedialog.askopenfilename(filetypes=[("PNG", "*.png")])
        if path:
            self.atlas = Image.open(path)
            self.fit_zoom()
            
    def set_zoom(self, new_zoom):
        self.zoom = max(0.1, min(new_zoom, 8.0))
        self.display_atlas()
        
    def fit_zoom(self):
        if not self.atlas:
            return
        canvas_width = self.canvas.winfo_width()
        canvas_height = self.canvas.winfo_height()
        if canvas_width <= 1 or canvas_height <= 1:
            canvas_width = 900
            canvas_height = 500
        
        self.zoom = min(canvas_width / self.atlas.width, canvas_height / self.atlas.height) * 0.9
        self.pan_x = 0
        self.pan_y = 0
        self.display_atlas()
        
    def on_mousewheel(self, e):
        if not self.atlas:
            return
        factor = 1.15 if e.num == 4 or e.delta > 0 else 0.85
        self.set_zoom(self.zoom * factor)
        
    def on_drag_start(self, e):
        self.dragging = True
        self.last_drag_x = e.x
        self.last_drag_y = e.y
        
    def on_drag(self, e):
        if not self.dragging or not self.atlas:
            return
        dx = e.x - self.last_drag_x
        dy = e.y - self.last_drag_y
        self.pan_x += dx
        self.pan_y += dy
        self.last_drag_x = e.x
        self.last_drag_y = e.y
        self.display_atlas()
        
    def on_drag_end(self, e):
        self.dragging = False
        
    def display_atlas(self):
        if not self.atlas:
            return
        
        # Skaluj
        new_w = int(self.atlas.width * self.zoom)
        new_h = int(self.atlas.height * self.zoom)
        scaled = self.atlas.resize((new_w, new_h), Image.Resampling.NEAREST)
        
        # Rysuj punkty
        draw = ImageDraw.Draw(scaled)
        if self.point1:
            p1 = (int(self.point1[0] * self.zoom), int(self.point1[1] * self.zoom))
            draw.ellipse([p1[0]-5, p1[1]-5, p1[0]+5, p1[1]+5], fill="red", outline="white")
        if self.point2:
            p2 = (int(self.point2[0] * self.zoom), int(self.point2[1] * self.zoom))
            draw.ellipse([p2[0]-5, p2[1]-5, p2[0]+5, p2[1]+5], fill="blue", outline="white")
            if self.point1:
                draw.rectangle([p1[0], p1[1], p2[0], p2[1]], outline="yellow", width=2)
        
        self.displayed_atlas = scaled
        self.photo = ImageTk.PhotoImage(scaled)
        self.canvas.delete("all")
        self.canvas.create_image(self.pan_x, self.pan_y, image=self.photo, anchor="nw")
        self.zoom_label.config(text=f"Zoom: {self.zoom:.2f}x")
        
    def on_canvas_click(self, e):
        if not self.atlas or self.dragging:
            return
        
        x = int((e.x - self.pan_x) / self.zoom)
        y = int((e.y - self.pan_y) / self.zoom)
        
        if self.point1 is None:
            self.point1 = (x, y)
            self.p1_label.config(text=f"({x}, {y})")
        else:
            self.point2 = (x, y)
            self.p2_label.config(text=f"({x}, {y})")
        
        self.display_atlas()
        
    def clear_points(self):
        self.point1 = None
        self.point2 = None
        self.p1_label.config(text="---")
        self.p2_label.config(text="---")
        self.display_atlas()
        
    def crop(self):
        if not self.point1 or not self.point2:
            messagebox.showerror("Error", "Zaznacz dwa punkty!")
            return
        
        name = self.name_input.get() or f"element_{len(self.crop_data)}"
        
        x1, y1 = self.point1
        x2, y2 = self.point2
        
        x = min(x1, x2)
        y = min(y1, y2)
        w = abs(x2 - x1)
        h = abs(y2 - y1)
        
        if w == 0 or h == 0:
            messagebox.showerror("Error", "Zaznaczenie musi mieć wymiary!")
            return
        
        cropped = self.atlas.crop((x, y, x+w, y+h))
        
        self.crop_data.append({
            "name": name,
            "x": x,
            "y": y,
            "width": w,
            "height": h,
            "image": cropped
        })
        
        self.listbox.insert(tk.END, f"{name}: ({x},{y}) {w}x{h}")
        self.name_input.delete(0, tk.END)
        self.clear_points()
        
    def delete_selected(self):
        sel = self.listbox.curselection()
        if sel:
            idx = sel[0]
            del self.crop_data[idx]
            self.listbox.delete(idx)
        
    def export_json(self):
        if not self.crop_data:
            messagebox.showerror("Error", "Brak elementów!")
            return
        
        data = {"elements": [{
            "name": item["name"],
            "x": item["x"],
            "y": item["y"],
            "width": item["width"],
            "height": item["height"]
        } for item in self.crop_data]}
        
        path = filedialog.asksaveasfilename(defaultextension=".json", filetypes=[("JSON", "*.json")])
        if path:
            with open(path, 'w') as f:
                json.dump(data, f, indent=2)
            messagebox.showinfo("OK", f"Zapisano!")
        
    def export_png(self):
        if not self.crop_data:
            messagebox.showerror("Error", "Brak elementów!")
            return
        
        dir_path = filedialog.askdirectory()
        if dir_path:
            for item in self.crop_data:
                item["image"].save(f"{dir_path}/{item['name']}.png")
            messagebox.showinfo("OK", f"Zapisano {len(self.crop_data)} plików")
        
    def run(self):
        self.root.mainloop()

if __name__ == "__main__":
    app = GUIAtlasCutter()
    app.run()