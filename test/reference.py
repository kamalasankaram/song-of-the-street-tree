"""Render reference output with the original tree_stump_audio.py.

Usage: python3 test/reference.py <tree_stump_audio.py> <mesh.obj> <out_dir> <species> <seconds>
Writes rings.json, indexical.pcm and metaphorical.pcm (int16 little-endian,
quantized exactly as write_wav does).
"""
import importlib.util, json, struct, sys, types

# The script imports Tkinter at module level; stub it so it loads headless.
tk = types.ModuleType("tkinter")
tk.Tk = object
for sub in ("ttk", "filedialog", "messagebox"):
    m = types.ModuleType("tkinter." + sub)
    setattr(tk, sub, m)
    sys.modules["tkinter." + sub] = m
sys.modules["tkinter"] = tk

src, obj, out, species, seconds = sys.argv[1:6]
spec = importlib.util.spec_from_file_location("tsa", src)
tsa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tsa)

verts = tsa.parse_obj(obj)
rd = tsa.detect_rings(verts)
dur = float(seconds)
idx, _ = tsa.generate_audio(rd, tsa.SPECIES[species], duration=dur)
met, _ = tsa.generate_metaphorical(rd, len(rd["ring_radii"]), duration=dur)

def pcm(a):
    return struct.pack(f"<{len(a)}h", *[max(-32767, min(32767, int(s * 32767))) for s in a])

open(f"{out}/indexical.pcm", "wb").write(pcm(idx))
open(f"{out}/metaphorical.pcm", "wb").write(pcm(met))
json.dump({"cx": rd["cx"], "cy": rd["cy"], "max_r": rd["max_r"], "ring_radii": rd["ring_radii"],
           "z_min": rd["z_min"], "z_max": rd["z_max"]}, open(f"{out}/rings.json", "w"))
