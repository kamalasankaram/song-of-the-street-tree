// Species parameters, ported verbatim from tree_stump_audio.py (v9).
//
// EMPIRICAL: porosity and Janka hardness (The Wood Database).
// INTERPRETIVE: hardness (amplitude scale), ewBoost (earlywood amplitude boost)
// and ewWidth (fraction of each ring that is earlywood). See the Python file
// for the per-species sources and reasoning.
export const SPECIES = {
  'Silver Linden': { key: 'silver_linden', porosity: 'diffuse', jankaLbf: 410, hardness: 0.38, ewBoost: 1.00, ewWidth: 0.00 },
  'Littleleaf Linden': { key: 'littleleaf_linden', porosity: 'diffuse', jankaLbf: 410, hardness: 0.38, ewBoost: 1.00, ewWidth: 0.00 },
  'Ginkgo': { key: 'ginkgo', porosity: 'diffuse', jankaLbf: 560, hardness: 0.45, ewBoost: 1.03, ewWidth: 0.08 },
  'Silver Maple': { key: 'silver_maple', porosity: 'diffuse', jankaLbf: 700, hardness: 0.52, ewBoost: 1.03, ewWidth: 0.08 },
  'London Planetree': { key: 'london_planetree', porosity: 'diffuse', jankaLbf: 770, hardness: 0.55, ewBoost: 1.05, ewWidth: 0.10 },
  'Sweetgum': { key: 'sweetgum', porosity: 'diffuse', jankaLbf: 850, hardness: 0.60, ewBoost: 1.00, ewWidth: 0.00 },
  'Cherry': { key: 'cherry', porosity: 'diffuse', jankaLbf: 950, hardness: 0.65, ewBoost: 1.08, ewWidth: 0.12 },
  'Red Maple': { key: 'red_maple', porosity: 'diffuse', jankaLbf: 950, hardness: 0.65, ewBoost: 1.05, ewWidth: 0.10 },
  'Norway Maple': { key: 'norway_maple', porosity: 'diffuse', jankaLbf: 1010, hardness: 0.70, ewBoost: 1.05, ewWidth: 0.10 },
  'Japanese Pagoda Tree': { key: 'japanese_pagoda_tree', porosity: 'diffuse', jankaLbf: 1200, hardness: 0.78, ewBoost: 1.10, ewWidth: 0.15 },
  'Callery Pear': { key: 'callery_pear', porosity: 'diffuse', jankaLbf: 1660, hardness: 0.97, ewBoost: 1.05, ewWidth: 0.10 },
  'American Hornbeam': { key: 'american_hornbeam', porosity: 'diffuse', jankaLbf: 1780, hardness: 0.99, ewBoost: 1.03, ewWidth: 0.08 },
  'American Elm': { key: 'american_elm', porosity: 'ring', jankaLbf: 830, hardness: 0.60, ewBoost: 1.35, ewWidth: 0.40 },
  'Japanese Zelkova': { key: 'japanese_zelkova', porosity: 'ring', jankaLbf: 1050, hardness: 0.72, ewBoost: 1.40, ewWidth: 0.40 },
  'Pin Oak': { key: 'pin_oak', porosity: 'ring', jankaLbf: 1130, hardness: 0.75, ewBoost: 1.45, ewWidth: 0.45 },
  'Black Oak': { key: 'black_oak', porosity: 'ring', jankaLbf: 1210, hardness: 0.80, ewBoost: 1.45, ewWidth: 0.45 },
  'Red Oak': { key: 'red_oak', porosity: 'ring', jankaLbf: 1290, hardness: 0.85, ewBoost: 1.50, ewWidth: 0.45 },
  'Honeylocust': { key: 'honeylocust', porosity: 'ring', jankaLbf: 1580, hardness: 0.95, ewBoost: 1.40, ewWidth: 0.40 },
  'Black Locust': { key: 'black_locust', porosity: 'ring', jankaLbf: 1700, hardness: 0.98, ewBoost: 1.25, ewWidth: 0.35 },
  'Unknown / Other': { key: 'unknown', porosity: 'unknown', jankaLbf: null, hardness: 0.65, ewBoost: 1.10, ewWidth: 0.15 },
};
