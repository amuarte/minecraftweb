from PIL import Image
import tkinter as tk
from tkinter import filedialog, messagebox
from PIL import ImageTk
import numpy as np

class ColormapTool:
    def __init__(self):
        self.texture = None
        self.colormap = None
        self.output = None
        
        self.root = tk.Tk()
        self.root.title("Colormap Tool")
        self.root.geometry("600x400")
        
        tk.Button(self.root, text="Załaduj teksturę (B&W)", command=self.load_texture, width=30).pack(pady=5)
        tk.Button(self.root, text="Załaduj colormapę", command=self.load_colormap, width=30).pack(pady=5)
        
        tk.Label(self.root, text="Temperatura (0-255):").pack()
        temp_frame = tk.Frame(self.root)
        temp_frame.pack(fill=tk.X, padx=20)
        self.temp_scale = tk.Scale(temp_frame, from_=0, to=255, orient=tk.HORIZONTAL, command=self.update_temp_input)
        self.temp_scale.pack(side=tk.LEFT, fill=tk.X, expand=True)
        self.temp_input = tk.Entry(temp_frame, width=5)
        self.temp_input.pack(side=tk.LEFT, padx=5)
        self.temp_input.insert(0, "95")
        self.temp_input.bind('<Return>', lambda e: self.set_temp_from_input())
        self.temp_scale.set(95)
        
        tk.Label(self.root, text="Wilgotność (0-255):").pack()
        humid_frame = tk.Frame(self.root)
        humid_frame.pack(fill=tk.X, padx=20)
        self.humid_scale = tk.Scale(humid_frame, from_=0, to=255, orient=tk.HORIZONTAL, command=self.update_humid_input)
        self.humid_scale.pack(side=tk.LEFT, fill=tk.X, expand=True)
        self.humid_input = tk.Entry(humid_frame, width=5)
        self.humid_input.pack(side=tk.LEFT, padx=5)
        self.humid_input.insert(0, "80")
        self.humid_input.bind('<Return>', lambda e: self.set_humid_from_input())
        self.humid_scale.set(80)
        
        self.preview = tk.Label(self.root, bg="gray")
        self.preview.pack(pady=10)
        
        tk.Button(self.root, text="Eksportuj PNG", command=self.export, width=30).pack(pady=5)
        
    def load_texture(self):
        path = filedialog.askopenfilename(filetypes=[("PNG", "*.png")])
        if path:
            self.texture = Image.open(path).convert("RGB")
            messagebox.showinfo("OK", "Tekstura załadowana!")
            
    def load_colormap(self):
        path = filedialog.askopenfilename(filetypes=[("PNG", "*.png")])
        if path:
            self.colormap = Image.open(path).convert("RGB")
            messagebox.showinfo("OK", "Colormap załadowany!")
            self.apply_colormap()
            
    def update_temp_input(self, val):
        self.temp_input.delete(0, tk.END)
        self.temp_input.insert(0, str(int(float(val))))
        self.apply_colormap()
        
    def update_humid_input(self, val):
        self.humid_input.delete(0, tk.END)
        self.humid_input.insert(0, str(int(float(val))))
        self.apply_colormap()
        
    def set_temp_from_input(self):
        try:
            val = int(self.temp_input.get())
            self.temp_scale.set(max(0, min(255, val)))
        except:
            pass
            
    def set_humid_from_input(self):
        try:
            val = int(self.humid_input.get())
            self.humid_scale.set(max(0, min(255, val)))
        except:
            pass
            
    def apply_colormap(self, val=None):
        if not self.texture or not self.colormap:
            return
            
        temp = int(self.temp_scale.get())
        humid = int(self.humid_scale.get())
        
        # Limit do rozmiarów colormappy
        w, h = self.colormap.size
        temp = min(temp, w - 1)
        humid = min(humid, h - 1)
        
        # Pobierz kolor z colormappy
        color = self.colormap.getpixel((temp, humid))
        
        # Konwertuj teksturę na array
        tex_array = np.array(self.texture, dtype=np.float32)
        color_array = np.array(color[:3], dtype=np.float32) / 255.0
        
        # Nałóż kolor
        result = tex_array * color_array[np.newaxis, np.newaxis, :]
        result = np.clip(result, 0, 255).astype(np.uint8)
        
        self.output = Image.fromarray(result)
        
        # Pokaż preview
        preview = self.output.resize((150, 150))
        photo = ImageTk.PhotoImage(preview)
        self.preview.config(image=photo)
        self.preview.image = photo
        
    def export(self):
        if self.output is None:
            messagebox.showerror("Error", "Najpierw zastosuj colormapę!")
            return
            
        path = filedialog.asksaveasfilename(defaultextension=".png", filetypes=[("PNG", "*.png")])
        if path:
            self.output.save(path)
            messagebox.showinfo("OK", f"Zapisano: {path}")
            
    def run(self):
        self.root.mainloop()

if __name__ == "__main__":
    tool = ColormapTool()
    tool.run()