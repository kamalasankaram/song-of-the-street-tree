// Stump records. Media paths are relative to public/.
// Phase 5 replaces this list with the shared online archive.
export const stumps = [
  {
    id: 'linden-235',
    lat: 40.88638, lng: -73.91396,
    species: 'Littleleaf Linden', latin: 'Tilia cordata',
    loc: 'Independence Ave & W 235th St', borough: 'Bronx',
    inDB: true, rings: 32,
    scan: 'Polycam LiDAR / iPhone 16 Pro Max',
    duration: '22:00 — LP side at 33⅓ RPM',
    polycamUrl: 'https://poly.cam/capture/BF824C77-CCF5-4DE8-9AB6-F54F1294EBB4',
    anatomy: [['Diffuse-porous', true], ['Janka 410 lbf'], ['Fine even grain']],
    ringStyle: 'diffuse',
    video: 'media/linden-scan.mp4',
    audio: {
      indexical: 'media/linden-indexical.mp3',
      metaphorical: 'media/linden-metaphorical.mp3',
    },
  },
  {
    id: 'red-oak-246',
    lat: 40.8923, lng: -73.9119,
    species: 'Red Oak', latin: 'Quercus rubra',
    loc: 'Independence Ave & W 246th St', borough: 'Bronx',
    inDB: false, rings: 28,
    scan: 'Polycam LiDAR / iPhone 16 Pro Max',
    duration: '22:00 — LP side at 33⅓ RPM',
    anatomy: [['Ring-porous', true], ['Janka 1290 lbf'], ['Large earlywood pores']],
    ringStyle: 'ring',
    video: null,
    audio: {
      indexical: 'media/red-oak-indexical.mp3',
      metaphorical: 'media/red-oak-metaphorical.mp3',
    },
  },
];

export const RING_POROUS = ['American Elm', 'Japanese Zelkova', 'Pin Oak', 'Black Oak', 'Red Oak', 'Honeylocust', 'Black Locust'];

// INTERPRETIVE: ring count × 8 Hz, matching tree_stump_audio.py.
export const fundamental = rings => (rings ? rings * 8 + ' Hz' : '—');
