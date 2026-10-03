#!/usr/bin/env python3
"""
Tree Stump Audio Generator  v9
No external dependencies — Python standard library only (includes Tkinter).

To run:
    Double-click the file, or:
    python3 tree_stump_audio.py

Signal principle:
  The audio waveform IS the Z-height topology of your scan.
  Nothing is added. No oscillators. No sine waves.
  The only math.sin/cos calls are for computing the XY position
  of the stylus on its spiral path — geometry only.

Species parameters have two documented layers:
  EMPIRICAL    — porosity type and Janka hardness from The Wood Database
  INTERPRETIVE — how that anatomy maps onto audio parameters (adjustable)

The spiral path follows detected ring boundaries from the scan.
"""

import sys, os, struct, math, time, threading
from pathlib import Path
import tkinter as tk
from tkinter import ttk, filedialog, messagebox


# ╔══════════════════════════════════════════════════════════════════════════════
# ║  SPECIES DATA
# ╚══════════════════════════════════════════════════════════════════════════════
#
# Each species entry has TWO layers, kept separate so adjustments are traceable:
#
# LAYER 1 — EMPIRICAL (sourced from wood anatomy literature)
#   porosity   : "ring" or "diffuse"  Source: The Wood Database per species.
#   janka_lbf  : Janka hardness (lbf) Source: The Wood Database per species.
#
# LAYER 2 — INTERPRETIVE (translations of anatomy into audio parameters)
#   hardness   : amplitude scale 0–1, derived from janka_lbf (linear normalisation
#                against range 410–1780 lbf). INTERPRETIVE CHOICE: linear scale.
#   ew_boost   : amplitude multiplier at inner ring edge. Ring-porous species
#                have large open pores → stylus drops deeper → louder.
#                Magnitude estimated from pore-size descriptions ("large to very
#                large" etc). NOT acoustically measured. INTERPRETIVE CHOICE.
#   ew_width   : fraction of ring width occupied by earlywood zone (0–1).
#                Approximated from cross-section micrograph descriptions.
#                INTERPRETIVE CHOICE.

SPECIES = {

    # ── Diffuse-porous ─────────────────────────────────────────────────────────
    # Pores small and evenly distributed. No distinct earlywood zone.

    "Silver Linden": {
        "key": "silver_linden",
        # EMPIRICAL: diffuse-porous, janka 410 lbf. Pores extremely fine and even;
        # growth rings barely distinct. Source: wood-database.com/linden-basswood
        "porosity": "diffuse", "janka_lbf": 410,
        # INTERPRETIVE: softest in list → lowest hardness. No earlywood zone.
        "hardness": 0.38, "ew_boost": 1.00, "ew_width": 0.00,
    },
    "Littleleaf Linden": {
        "key": "littleleaf_linden",
        # EMPIRICAL: identical anatomy to silver linden. janka 410 lbf.
        # Source: same genus (Tilia), indistinguishable microscopically.
        "porosity": "diffuse", "janka_lbf": 410,
        # INTERPRETIVE: same as silver linden.
        "hardness": 0.38, "ew_boost": 1.00, "ew_width": 0.00,
    },
    "Ginkgo": {
        "key": "ginkgo",
        # EMPIRICAL: diffuse-porous, janka ~560 lbf. Primitive gymnosperm wood
        # structure; very uniform grain. Source: wood-database.com/ginkgo
        "porosity": "diffuse", "janka_lbf": 560,
        # INTERPRETIVE: soft; minimal ring contrast.
        "hardness": 0.45, "ew_boost": 1.03, "ew_width": 0.08,
    },
    "Silver Maple": {
        "key": "silver_maple",
        # EMPIRICAL: diffuse-porous, janka 700 lbf. Softest NYC maple.
        # Source: wood-database.com/silver-maple
        "porosity": "diffuse", "janka_lbf": 700,
        # INTERPRETIVE: low-moderate hardness; faint ring contrast.
        "hardness": 0.52, "ew_boost": 1.03, "ew_width": 0.08,
    },
    "London Planetree": {
        "key": "london_planetree",
        # EMPIRICAL: diffuse-porous, janka 770 lbf. Most prominent broad rays
        # of any species in this list — visible to naked eye.
        # Source: wood-database.com/london-plane
        # NOTE: ray modulation not yet implemented; flagged for future parameter.
        "porosity": "diffuse", "janka_lbf": 770,
        # INTERPRETIVE: moderate hardness; slight ring visibility.
        "hardness": 0.55, "ew_boost": 1.05, "ew_width": 0.10,
    },
    "Sweetgum": {
        "key": "sweetgum",
        # EMPIRICAL: diffuse-porous, janka 850 lbf. Growth rings indistinct;
        # rays not visible without lens. Most even grain in this list.
        # Source: wood-database.com/sweetgum — "growth rings indistinct,
        # rays not visible without lens."
        "porosity": "diffuse", "janka_lbf": 850,
        # INTERPRETIVE: no earlywood zone at all (rings truly indistinct).
        "hardness": 0.60, "ew_boost": 1.00, "ew_width": 0.00,
    },
    "Cherry": {
        "key": "cherry",
        # EMPIRICAL: diffuse-porous, janka 950 lbf (Prunus serotina).
        # Fine uniform texture, slightly interlocked grain.
        # Source: wood-database.com/black-cherry
        "porosity": "diffuse", "janka_lbf": 950,
        # INTERPRETIVE: moderate hardness; slight ring contrast.
        "hardness": 0.65, "ew_boost": 1.08, "ew_width": 0.12,
    },
    "Red Maple": {
        "key": "red_maple",
        # EMPIRICAL: diffuse-porous, janka 950 lbf.
        # Source: wood-database.com/red-maple
        "porosity": "diffuse", "janka_lbf": 950,
        # INTERPRETIVE: same hardness as cherry; slightly less ring contrast.
        "hardness": 0.65, "ew_boost": 1.05, "ew_width": 0.10,
    },
    "Norway Maple": {
        "key": "norway_maple",
        # EMPIRICAL: diffuse-porous, janka 1010 lbf.
        # Source: wood-database.com/norway-maple
        "porosity": "diffuse", "janka_lbf": 1010,
        # INTERPRETIVE: moderate-high hardness; slight ring contrast.
        "hardness": 0.70, "ew_boost": 1.05, "ew_width": 0.10,
    },
    "Japanese Pagoda Tree": {
        "key": "japanese_pagoda_tree",
        # EMPIRICAL: diffuse-porous, janka ~1200 lbf (Styphnolobium japonicum).
        # Medium-fine texture. Source: Fabaceae family anatomy.
        "porosity": "diffuse", "janka_lbf": 1200,
        # INTERPRETIVE: fairly hard; moderate ring visibility.
        "hardness": 0.78, "ew_boost": 1.10, "ew_width": 0.15,
    },
    "Callery Pear": {
        "key": "callery_pear",
        # EMPIRICAL: diffuse-porous, janka ~1660 lbf. Unusually hard for
        # diffuse-porous. Very fine, even texture despite high density.
        # Source: janka from hardness charts; porosity from Rosaceae anatomy.
        "porosity": "diffuse", "janka_lbf": 1660,
        # INTERPRETIVE: very hard but even grain → high hardness, minimal ew boost.
        # Acoustically distinctive: loud but smooth.
        "hardness": 0.97, "ew_boost": 1.05, "ew_width": 0.10,
    },
    "American Hornbeam": {
        "key": "american_hornbeam",
        # EMPIRICAL: diffuse-porous, janka 1780 lbf. Hardest diffuse-porous
        # species in this list. Distinctive muscular fluted grain.
        # Source: wood-database.com/american-hornbeam
        "porosity": "diffuse", "janka_lbf": 1780,
        # INTERPRETIVE: highest hardness in diffuse group; minimal earlywood.
        "hardness": 0.99, "ew_boost": 1.03, "ew_width": 0.08,
    },

    # ── Ring-porous ────────────────────────────────────────────────────────────
    # Large pores concentrated at inner ring edge (earlywood).
    # Stylus drops into pores at each ring boundary → amplitude pulse.

    "American Elm": {
        "key": "american_elm",
        # EMPIRICAL: ring-porous, janka 830 lbf. Interlocked wavy grain.
        # Distinct earlywood pore ring; small latewood pores.
        # Source: wood-database.com/american-elm
        "porosity": "ring", "janka_lbf": 830,
        # INTERPRETIVE: soft for ring-porous; wide earlywood zone.
        "hardness": 0.60, "ew_boost": 1.35, "ew_width": 0.40,
    },
    "Japanese Zelkova": {
        "key": "japanese_zelkova",
        # EMPIRICAL: ring-porous, janka ~1050 lbf. Elm family (Ulmaceae);
        # anatomy nearly identical to elm — large earlywood pores, tyloses common.
        # Source: wood-database.com/keyaki (Zelkova serrata)
        "porosity": "ring", "janka_lbf": 1050,
        # INTERPRETIVE: harder than elm; similar ring structure.
        "hardness": 0.72, "ew_boost": 1.40, "ew_width": 0.40,
    },
    "Pin Oak": {
        "key": "pin_oak",
        # EMPIRICAL: ring-porous, janka 1130 lbf. Large earlywood pores;
        # no tyloses (red oak group). Source: wood-database.com/pin-oak
        "porosity": "ring", "janka_lbf": 1130,
        # INTERPRETIVE: moderate ring-porous boost; wide earlywood zone.
        "hardness": 0.75, "ew_boost": 1.45, "ew_width": 0.45,
    },
    "Black Oak": {
        "key": "black_oak",
        # EMPIRICAL: ring-porous, janka ~1210 lbf. Red oak group; very similar
        # to red oak and pin oak. Source: wood-database.com/black-oak
        "porosity": "ring", "janka_lbf": 1210,
        # INTERPRETIVE: slightly harder than pin oak; same ring structure.
        "hardness": 0.80, "ew_boost": 1.45, "ew_width": 0.45,
    },
    "Red Oak": {
        "key": "red_oak",
        # EMPIRICAL: ring-porous, janka 1290 lbf. Large open earlywood pores
        # (no tyloses). Standard reference species.
        # Source: wood-database.com/red-oak
        "porosity": "ring", "janka_lbf": 1290,
        # INTERPRETIVE: strong ring-porous boost; wide earlywood zone.
        "hardness": 0.85, "ew_boost": 1.50, "ew_width": 0.45,
    },
    "Honeylocust": {
        "key": "honeylocust",
        # EMPIRICAL: ring-porous, janka 1580 lbf. "3-5 rows of large to very
        # large earlywood pores, medium to small latewood pores in tangential
        # bands." Source: wood-database.com/honey-locust (direct quote).
        "porosity": "ring", "janka_lbf": 1580,
        # INTERPRETIVE: very hard; large pores → strong boost. Slightly narrower
        # earlywood zone than oak based on "3-5 rows" description.
        "hardness": 0.95, "ew_boost": 1.40, "ew_width": 0.40,
    },
    "Black Locust": {
        "key": "black_locust",
        # EMPIRICAL: ring-porous, janka 1700 lbf. Pores packed with tyloses
        # (unlike honeylocust). Hardest species in this list.
        # Source: wood-database.com/black-locust
        # NOTE: tyloses fill pores → REDUCES stylus-drop effect vs open-pored
        # ring-porous species. ew_boost is therefore lower than honeylocust
        # despite being harder.
        "porosity": "ring", "janka_lbf": 1700,
        # INTERPRETIVE: highest hardness; tyloses reduce pore depth effect.
        "hardness": 0.98, "ew_boost": 1.25, "ew_width": 0.35,
    },

    # ── Unknown ────────────────────────────────────────────────────────────────
    "Unknown / Other": {
        "key": "unknown",
        # No empirical source. Neutral middle-ground. Use when species unconfirmed.
        "porosity": "unknown", "janka_lbf": None,
        "hardness": 0.65, "ew_boost": 1.10, "ew_width": 0.15,
    },
}

# Ordered display list for the dropdown, grouped
SPECIES_ORDER = [
    # Diffuse-porous (softest → hardest)
    "Silver Linden", "Littleleaf Linden", "Ginkgo", "Silver Maple",
    "London Planetree", "Sweetgum", "Cherry", "Red Maple", "Norway Maple",
    "Japanese Pagoda Tree", "Callery Pear", "American Hornbeam",
    # Ring-porous (softest → hardest)
    "American Elm", "Japanese Zelkova", "Pin Oak", "Black Oak", "Red Oak",
    "Honeylocust", "Black Locust",
    # Other
    "Unknown / Other",
]


# ╔══════════════════════════════════════════════════════════════════════════════
# ║  AUDIO ENGINE  (no changes from v5 — pure processing)
# ╚══════════════════════════════════════════════════════════════════════════════

def parse_obj(filepath, progress_cb=None):
    vertices = []
    with open(filepath, "r", errors="replace") as f:
        for line in f:
            if line.startswith("v "):
                parts = line.split()
                try:
                    vertices.append((float(parts[1]), float(parts[2]), float(parts[3])))
                except (ValueError, IndexError):
                    continue
    if progress_cb:
        progress_cb(f"Read {len(vertices):,} vertices")
    return vertices


def build_grid(vertices, cell_size):
    grid = {}
    for v in vertices:
        key = (int(v[0] / cell_size), int(v[1] / cell_size))
        if key not in grid:
            grid[key] = []
        grid[key].append(v)
    return grid


def lookup_z(grid, cell_size, x, y):
    cx, cy = int(x / cell_size), int(y / cell_size)
    best_dist, best_z = float("inf"), 0.0
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            bucket = grid.get((cx + dx, cy + dy))
            if bucket:
                for v in bucket:
                    d = (v[0] - x)**2 + (v[1] - y)**2
                    if d < best_dist:
                        best_dist, best_z = d, v[2]
    return best_z


def detect_rings(vertices, progress_cb=None, n_angles=360, n_bins=400):
    xs = [v[0] for v in vertices]
    ys = [v[1] for v in vertices]
    cx = sum(xs) / len(xs)
    cy = sum(ys) / len(ys)
    max_r = max(math.sqrt((v[0]-cx)**2 + (v[1]-cy)**2) for v in vertices)
    cell_size = max(max_r * 0.01, 0.001)
    grid = build_grid(vertices, cell_size)
    bin_size = max_r / n_bins

    if progress_cb:
        progress_cb("Building radial profile…")

    z_bins = [[] for _ in range(n_bins)]
    for ai in range(n_angles):
        angle = ai / n_angles * 2 * math.pi
        for bi in range(n_bins):
            r = (bi + 0.5) * bin_size
            z_bins[bi].append(lookup_z(grid, cell_size,
                                        cx + math.cos(angle) * r,
                                        cy + math.sin(angle) * r))

    avg_z = [sum(b)/len(b) if b else 0.0 for b in z_bins]
    w = max(3, n_bins // 80)
    smooth = []
    for i in range(n_bins):
        lo, hi = max(0, i-w), min(n_bins, i+w+1)
        smooth.append(sum(avg_z[lo:hi]) / (hi-lo))

    peaks = []
    for i in range(1, n_bins-1):
        if smooth[i] >= smooth[i-1] and smooth[i] >= smooth[i+1]:
            peaks.append((i + 0.5) * bin_size)

    min_gap = max_r * 0.003
    filtered, last = [], -999
    for r in peaks:
        if r - last >= min_gap:
            filtered.append(r)
            last = r

    if progress_cb:
        progress_cb(f"Detected ~{len(filtered)} ring boundaries")

    return {
        "cx": cx, "cy": cy, "max_r": max_r,
        "ring_radii": filtered,
        "avg_z": smooth, "bin_size": bin_size,
        "cell_size": cell_size, "grid": grid,
        "z_min": min(smooth), "z_max": max(smooth),
    }


def generate_audio(rd, sp_params, duration=1320, sample_rate=44100, progress_cb=None):
    p = sp_params
    cx, cy = rd["cx"], rd["cy"]
    max_r  = rd["max_r"]
    grid   = rd["grid"]
    cs     = rd["cell_size"]
    avg_z  = rd["avg_z"]
    bs     = rd["bin_size"]
    z_min, z_max = rd["z_min"], rd["z_max"]
    z_range = z_max - z_min if z_max != z_min else 1.0
    # Mean Z from the radial profile — used to centre the signal around zero.
    # INTERPRETIVE CHOICE: centering removes DC offset, using full ±0.5 range
    # rather than 0–1. More physically accurate (stylus responds to deviation
    # from mean surface, not absolute height) and much less harsh to listen to.
    z_mean = sum(avg_z) / len(avg_z) if avg_z else (z_min + z_max) / 2
    rings = rd["ring_radii"]
    ring_radii = rings
    waypoints = list(reversed(rings)) + [0.0] if len(rings) >= 2 else [max_r, 0.0]
    n_seg = len(waypoints) - 1

    def r_at(t):
        f = (t / duration) * n_seg
        i = min(int(f), n_seg - 1)
        return waypoints[i] + (waypoints[i+1] - waypoints[i]) * (f - i)

    rpm = 33.33
    rot_per_s = rpm / 60.0
    total = int(sample_rate * duration)
    report = total // 20
    t0 = time.time()
    audio = []

    for i in range(total):
        if i % report == 0:
            pct = int(100 * i / total)
            el  = time.time() - t0
            eta = (el / max(i, 1)) * (total - i)
            if progress_cb:
                progress_cb(f"Generating audio… {pct}%  (ETA ~{int(eta)}s)", pct)

        t        = i / sample_rate
        rotation = t * rot_per_s * 2.0 * math.pi
        r        = r_at(t)

        x = cx + math.cos(rotation) * r
        y = cy + math.sin(rotation) * r
        z_raw = lookup_z(grid, cs, x, y)
        # Centred normalisation: deviation from mean, scaled to ±0.5
        topo  = (z_raw - z_mean) / z_range

        ring_frac = 0.0
        if ring_radii:
            for ri in range(1, len(ring_radii)):
                if r <= ring_radii[ri]:
                    span = ring_radii[ri] - ring_radii[ri-1]
                    ring_frac = (r - ring_radii[ri-1]) / span if span > 0 else 0.0
                    break

        ew = p["ew_width"]
        if ew > 0 and ring_frac < ew:
            t_ew = ring_frac / ew
            ew_scale = p["ew_boost"] * (1.0 - t_ew) + 1.0 * t_ew
        else:
            ew_scale = 1.0

        sample = topo * p["hardness"] * ew_scale
        audio.append(sample)

    # ── Moving average low-pass filter ────────────────────────────────────────
    # RATIONALE: A real stylus has mechanical mass and cantilever compliance —
    # it cannot respond instantaneously to infinitely sharp surface transitions.
    # The moving average models this physical inertia by smoothing the signal
    # over a small window of consecutive samples.
    #
    # INTERPRETIVE CHOICE: window size.
    # At 44100 Hz, each sample = ~0.023 ms.
    # Window of  3 samples ≈  0.07 ms — very subtle, removes only harshest peaks
    # Window of  5 samples ≈  0.11 ms — gentle, equivalent to a light stylus
    # Window of 11 samples ≈  0.25 ms — moderate, clearly audible softening
    # Window of 21 samples ≈  0.48 ms — strong, noticeably warmer
    #
    # Starting at 5 — the lightest meaningful smoothing.
    # Increase if still too harsh; decrease toward 3 if too muffled.
    FILTER_WINDOW = 5

    if FILTER_WINDOW > 1:
        if progress_cb:
            progress_cb("Applying stylus compliance filter…")
        smoothed = []
        half = FILTER_WINDOW // 2
        for i in range(len(audio)):
            lo = max(0, i - half)
            hi = min(len(audio), i + half + 1)
            smoothed.append(sum(audio[lo:hi]) / (hi - lo))
        audio = smoothed

    return audio, sample_rate


def generate_metaphorical(rd, ring_count, duration=1320, sample_rate=44100,
                          progress_cb=None):
    """
    Generate a metaphorical audio track derived from the tree's numerical identity.

    Design principles:
      - The tree's ring count determines the fundamental frequency (ring_count × 8 Hz).
        This is a deliberate interpretive choice: rings become pitch rather than
        surface roughness. At ×8, most NYC street trees (30–80 rings) land in the
        range 240–640 Hz — a warm, present mid-register.
      - The spiral topology modulates THREE aspects of the tone, all multiplicatively:
          1. PITCH DRIFT:   surface height bends frequency ±2% (smooth = steady,
                            rough = slow vibrato). Models the tree's growth variation
                            as subtle intonation rather than noise.
          2. RING PULSE:    amplitude swells at each detected ring boundary, then
                            fades. 32 rings over 22 minutes = one breath every ~41s.
                            The tree's age becomes a slow rhythmic structure.
          3. HARMONIC MIX:  topology value drives the overtone series (harmonics 2–5).
                            High topology = richer timbre; smooth zones = purer tone.
                            The wood grain determines the colour of the sound.
      - A sine wave at the fundamental is used deliberately here — it IS the
        conceptual foundation of the metaphorical track, not a grain model.
        This is the one case where a sine is indexically appropriate.

    INTERPRETIVE CHOICES:
      - Multiplier ×8: puts ring counts in audible mid-register. Could be ×4 (lower,
        more bass) or ×16 (higher, more bell-like). Adjust here if desired.
      - Pitch drift ±2%: subtle. ±5% would be more noticeable; ±1% barely perceptible.
      - Harmonic mix weights: 2nd harmonic 30%, 3rd 20%, 4th 10%, 5th 5% at max
        topology. These are musical judgments, not physical measurements.
      - Ring pulse shape: half-cosine fade in/out over the ring width. A sharper
        envelope would be more percussive; softer would be more legato.
    """
    cx, cy = rd["cx"], rd["cy"]
    max_r  = rd["max_r"]
    grid   = rd["grid"]
    cs     = rd["cell_size"]
    avg_z  = rd["avg_z"]
    bs     = rd["bin_size"]
    n_bins = len(avg_z)
    z_min  = rd["z_min"]
    z_max  = rd["z_max"]
    z_range = z_max - z_min if z_max != z_min else 1.0
    z_mean  = sum(avg_z) / len(avg_z) if avg_z else (z_min + z_max) / 2.0
    rings   = rd["ring_radii"]

    # ── Fundamental frequency ─────────────────────────────────────────────────
    # INTERPRETIVE: ring_count × 8. 32 rings → 256 Hz ≈ middle C.
    fund_hz = ring_count * 8.0

    # ── Spiral path (same ring-aware path as indexical track) ─────────────────
    waypoints = list(reversed(rings)) + [0.0] if len(rings) >= 2 else [max_r, 0.0]
    n_seg = len(waypoints) - 1

    def r_at(t):
        f = (t / duration) * n_seg
        i = min(int(f), n_seg - 1)
        return waypoints[i] + (waypoints[i+1] - waypoints[i]) * (f - i)

    rpm = 33.33
    rot_per_s = rpm / 60.0
    total = int(sample_rate * duration)
    report = total // 20
    t0 = time.time()

    if progress_cb:
        progress_cb(f"Generating metaphorical track (fundamental {fund_hz:.1f} Hz)…", 0)

    audio = []
    phase = 0.0   # running phase accumulator (avoids discontinuities from freq drift)

    for i in range(total):
        if i % report == 0:
            pct = int(100 * i / total)
            el  = time.time() - t0
            eta = (el / max(i, 1)) * (total - i)
            if progress_cb:
                progress_cb(f"Metaphorical track… {pct}%  (ETA ~{int(eta)}s)", pct)

        t        = i / sample_rate
        rotation = t * rot_per_s * 2.0 * math.pi
        r        = r_at(t)

        # Sample topology at this point
        x = cx + math.cos(rotation) * r
        y = cy + math.sin(rotation) * r
        z_raw = lookup_z(grid, cs, x, y)
        # Centred topology 0–1 (same normalisation as indexical track)
        topo = (z_raw - z_mean) / z_range + 0.5
        topo = max(0.0, min(1.0, topo))

        # ── 1. Pitch drift ────────────────────────────────────────────────────
        # INTERPRETIVE: ±2% frequency bend driven by topology.
        # topo=0.5 (mean) → no drift; topo>0.5 → slightly sharp; <0.5 → flat.
        drift = 1.0 + (topo - 0.5) * 0.04   # ±2%
        freq = fund_hz * drift

        # Advance phase accumulator
        phase += 2.0 * math.pi * freq / sample_rate

        # ── 2. Ring pulse envelope ────────────────────────────────────────────
        # Find position within current ring (ring_frac 0→1)
        ring_frac = 0.0
        if rings:
            for ri in range(1, len(rings)):
                if r <= rings[ri]:
                    span = rings[ri] - rings[ri-1]
                    ring_frac = (r - rings[ri-1]) / span if span > 0 else 0.0
                    break
        # Half-cosine envelope: peaks at ring_frac=0 (boundary), fades inward.
        # INTERPRETIVE: could invert (peak at latewood = outer edge instead).
        pulse = 0.5 + 0.5 * math.cos(ring_frac * math.pi)   # 1.0 → 0.0

        # ── 3. Harmonic mix from topology ─────────────────────────────────────
        # Fundamental
        sig = math.sin(phase)
        # Harmonics 2–5, weighted by topology (higher topo = richer).
        # INTERPRETIVE: weights are musical choices, not physical measurements.
        sig += topo * 0.30 * math.sin(2.0 * phase)   # 2nd harmonic
        sig += topo * 0.20 * math.sin(3.0 * phase)   # 3rd harmonic
        sig += topo * 0.10 * math.sin(4.0 * phase)   # 4th harmonic
        sig += topo * 0.05 * math.sin(5.0 * phase)   # 5th harmonic

        # Normalise harmonic sum (max possible = 1 + 0.30 + 0.20 + 0.10 + 0.05 = 1.65)
        sig /= 1.65

        # Apply ring pulse envelope and overall amplitude
        sample = sig * pulse * 0.85   # 0.85 headroom

        audio.append(sample)

    if progress_cb:
        progress_cb(f"Metaphorical track done — {time.time()-t0:.0f}s")

    return audio, sample_rate


def write_wav(path, audio, sr, progress_cb=None):
    if progress_cb:
        progress_cb("Writing WAV file…")
    raw = struct.pack(f"<{len(audio)}h",
                      *[max(-32767, min(32767, int(s * 32767))) for s in audio])
    with open(path, "wb") as f:
        f.write(b"RIFF"); f.write(struct.pack("<I", 36 + len(raw)))
        f.write(b"WAVE")
        f.write(b"fmt "); f.write(struct.pack("<I", 16))
        f.write(struct.pack("<HHIIHh", 1, 1, sr, sr*2, 2, 16))
        f.write(b"data"); f.write(struct.pack("<I", len(raw)))
        f.write(raw)
    mb = os.path.getsize(path) / 1_048_576
    if progress_cb:
        progress_cb(f"Saved {mb:.1f} MB → {Path(path).name}")


# ╔══════════════════════════════════════════════════════════════════════════════
# ║  GUI
# ╚══════════════════════════════════════════════════════════════════════════════

class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Tree Stump Audio Generator")
        self.resizable(False, False)
        self._build_ui()
        self._running = False

    def _build_ui(self):
        PAD = 16
        f = ttk.Frame(self, padding=PAD)
        f.grid(sticky="nsew")

        # ── Title ──────────────────────────────────────────────────────────────
        ttk.Label(f, text="Tree Stump Audio Generator",
                  font=("Helvetica", 16, "bold")).grid(
            row=0, column=0, columnspan=3, pady=(0, 4))
        ttk.Label(f, text="Converts a Polycam OBJ scan into a WAV audio file.",
                  foreground="#555").grid(
            row=1, column=0, columnspan=3, pady=(0, 14))

        # ── OBJ file ───────────────────────────────────────────────────────────
        ttk.Label(f, text="OBJ File:").grid(row=2, column=0, sticky="w")
        self.obj_var = tk.StringVar()
        ttk.Entry(f, textvariable=self.obj_var, width=46).grid(
            row=2, column=1, padx=6, sticky="ew")
        ttk.Button(f, text="Browse…", command=self._browse_obj).grid(
            row=2, column=2)

        # ── Species ────────────────────────────────────────────────────────────
        ttk.Label(f, text="Tree Species:").grid(row=3, column=0, sticky="w", pady=(10,0))
        self.species_var = tk.StringVar(value="Silver Linden")
        species_cb = ttk.Combobox(f, textvariable=self.species_var,
                                   values=SPECIES_ORDER,
                                   state="readonly", width=43)
        species_cb.grid(row=3, column=1, padx=6, sticky="ew", pady=(10,0))

        # Species info label
        self.species_info = ttk.Label(f, text="", foreground="#555",
                                       font=("Helvetica", 10))
        self.species_info.grid(row=4, column=1, padx=6, sticky="w")
        species_cb.bind("<<ComboboxSelected>>", self._update_species_info)
        self._update_species_info()

        # ── Duration ───────────────────────────────────────────────────────────
        ttk.Label(f, text="Duration:").grid(row=5, column=0, sticky="w", pady=(10,0))
        dur_frame = ttk.Frame(f)
        dur_frame.grid(row=5, column=1, sticky="w", padx=6, pady=(10,0))
        self.dur_var = tk.StringVar(value="22")
        ttk.Entry(dur_frame, textvariable=self.dur_var, width=6).pack(side="left")
        ttk.Label(dur_frame, text="minutes  (22 = one LP side)").pack(side="left", padx=6)

        # ── Ring count ─────────────────────────────────────────────────────────
        ttk.Label(f, text="Ring Count:").grid(row=6, column=0, sticky="w", pady=(10,0))
        ring_frame = ttk.Frame(f)
        ring_frame.grid(row=6, column=1, sticky="w", padx=6, pady=(10,0))
        self.ring_var = tk.StringVar(value="")
        ttk.Entry(ring_frame, textvariable=self.ring_var, width=6).pack(side="left")
        ttk.Label(ring_frame, text="rings  (from processing log — leave blank to detect)").pack(side="left", padx=6)

        # ── Output location ────────────────────────────────────────────────────
        ttk.Label(f, text="Output:").grid(row=7, column=0, sticky="w", pady=(10,0))
        self.out_label = ttk.Label(f, text="Saved next to OBJ file", foreground="#555")
        self.out_label.grid(row=7, column=1, sticky="w", padx=6, pady=(10,0))

        # ── Separator ─────────────────────────────────────────────────────────
        ttk.Separator(f, orient="horizontal").grid(
            row=8, column=0, columnspan=3, sticky="ew", pady=14)

        # ── Progress ───────────────────────────────────────────────────────────
        self.status_var = tk.StringVar(value="Ready.")
        ttk.Label(f, textvariable=self.status_var,
                  foreground="#333").grid(
            row=9, column=0, columnspan=3, sticky="w")

        self.progress = ttk.Progressbar(f, length=460, mode="determinate")
        self.progress.grid(row=10, column=0, columnspan=3, pady=(6,0), sticky="ew")

        # ── Generate button ────────────────────────────────────────────────────
        self.gen_btn = ttk.Button(f, text="Generate Audio",
                                   command=self._start, width=20)
        self.gen_btn.grid(row=11, column=0, columnspan=3, pady=(16, 0))

        # ── Log ────────────────────────────────────────────────────────────────
        ttk.Label(f, text="Log:").grid(row=12, column=0, sticky="nw", pady=(14,0))
        self.log = tk.Text(f, height=10, width=60, state="disabled",
                            font=("Courier", 10), bg="#f5f5f5", relief="flat")
        self.log.grid(row=12, column=1, columnspan=2, pady=(14,0), sticky="ew")
        sb = ttk.Scrollbar(f, command=self.log.yview)
        sb.grid(row=12, column=3, sticky="ns", pady=(14,0))
        self.log["yscrollcommand"] = sb.set

    def _update_species_info(self, event=None):
        name = self.species_var.get()
        sp = SPECIES.get(name)
        if sp:
            por = sp["porosity"].capitalize() if sp["porosity"] != "unknown" else "Unknown"
            janka = f"{sp['janka_lbf']} lbf" if sp["janka_lbf"] else "—"
            self.species_info.config(
                text=f"{por}-porous  ·  Janka {janka}  ·  hardness {sp['hardness']:.2f}")

    def _browse_obj(self):
        path = filedialog.askopenfilename(
            title="Select OBJ file",
            filetypes=[("OBJ files", "*.obj"), ("All files", "*.*")])
        if path:
            self.obj_var.set(path)
            obj = Path(path)
            self.out_label.config(
                text=f"{obj.stem}_indexical.wav  +  {obj.stem}_metaphorical.wav")

    def _log(self, msg):
        self.log.config(state="normal")
        self.log.insert("end", msg + "\n")
        self.log.see("end")
        self.log.config(state="disabled")

    def _set_progress(self, msg, pct=None):
        self.status_var.set(msg)
        if pct is not None:
            self.progress["value"] = pct

    def _start(self):
        if self._running:
            return

        obj_path = self.obj_var.get().strip()
        if not obj_path:
            messagebox.showerror("No file", "Please choose an OBJ file first.")
            return
        if not Path(obj_path).exists():
            messagebox.showerror("Not found", f"File not found:\n{obj_path}")
            return

        try:
            duration_min = float(self.dur_var.get())
            duration = int(duration_min * 60)
        except ValueError:
            messagebox.showerror("Duration", "Please enter a number for duration.")
            return

        species_name = self.species_var.get()
        sp_params = SPECIES[species_name]

        # Ring count — use entered value if provided, else will use detected count
        ring_str = self.ring_var.get().strip()
        ring_count = None
        if ring_str:
            try:
                ring_count = int(ring_str)
            except ValueError:
                messagebox.showerror("Ring Count", "Please enter a whole number for ring count.")
                return

        self._running = True
        self.gen_btn.config(state="disabled")
        self.progress["value"] = 0
        self.log.config(state="normal")
        self.log.delete("1.0", "end")
        self.log.config(state="disabled")

        t = threading.Thread(
            target=self._run,
            args=(obj_path, sp_params, species_name, duration, ring_count),
            daemon=True)
        t.start()

    def _run(self, obj_path, sp_params, species_name, duration, ring_count=None):
        def cb(msg, pct=None):
            self.after(0, lambda: self._set_progress(msg, pct))
            self.after(0, lambda: self._log(msg))

        try:
            obj = Path(obj_path)
            out_indexical    = obj.parent / (obj.stem + "_indexical.wav")
            out_metaphorical = obj.parent / (obj.stem + "_metaphorical.wav")

            cb(f"Species: {species_name}")
            cb(f"Duration: {duration//60} min {duration%60} sec")
            cb(f"Input: {obj.name}")
            cb("─" * 40)

            cb("Reading OBJ file…")
            verts = parse_obj(obj_path, progress_cb=cb)

            cb("Detecting ring boundaries…")
            rd = detect_rings(verts, progress_cb=cb)
            cb(f"Centre ({rd['cx']:.4f}, {rd['cy']:.4f})  max radius {rd['max_r']:.4f}")

            # Use entered ring count if provided, else use detected count
            detected = len(rd["ring_radii"])
            if ring_count is not None:
                rc = ring_count
                cb(f"Ring count: {rc} (entered manually)")
            else:
                rc = detected
                cb(f"Ring count: {rc} (detected from scan)")
            cb(f"Metaphorical fundamental: {rc * 8} Hz")

            # ── Indexical track ───────────────────────────────────────────────
            cb("Generating indexical track…", 0)
            audio_i, sr = generate_audio(rd, sp_params, duration=duration,
                                         progress_cb=cb)
            write_wav(str(out_indexical), audio_i, sr, progress_cb=cb)
            cb(f"✓ Indexical: {out_indexical.name}")

            # ── Metaphorical track ────────────────────────────────────────────
            cb("Generating metaphorical track…", 0)
            audio_m, sr = generate_metaphorical(rd, rc, duration=duration,
                                                progress_cb=cb)
            write_wav(str(out_metaphorical), audio_m, sr, progress_cb=cb)
            cb(f"✓ Metaphorical: {out_metaphorical.name}")

            self.after(0, lambda: self._set_progress("✓ Both tracks complete!", 100))
            self.after(0, lambda: self._log("─" * 40))
            self.after(0, lambda: messagebox.showinfo(
                "Done",
                f"Two tracks saved:\n\n"
                f"  {out_indexical.name}\n"
                f"  {out_metaphorical.name}\n\n"
                f"Open in QuickTime or any audio app."))

        except Exception as e:
            self.after(0, lambda: self._set_progress(f"Error: {e}"))
            self.after(0, lambda: self._log(f"ERROR: {e}"))
            self.after(0, lambda: messagebox.showerror("Error", str(e)))
        finally:
            self._running = False
            self.after(0, lambda: self.gen_btn.config(state="normal"))


# ╔══════════════════════════════════════════════════════════════════════════════
# ║  ENTRY POINT
# ╚══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    app = App()
    app.mainloop()
