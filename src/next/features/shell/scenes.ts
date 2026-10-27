import glacierGrinnell from '../../assets/scenes/glacier-grinnell.jpg';
import glacierLake from '../../assets/scenes/glacier-lake.jpg';
import grandTetonPond from '../../assets/scenes/grand-teton-pond.jpg';
import yosemiteMerced from '../../assets/scenes/yosemite-merced.jpg';
import yosemiteTunnelView from '../../assets/scenes/yosemite-tunnel-view.jpg';

/**
 * Curated national-park photography for the Cinematic Nature background. All photos are published on Unsplash under the
 * Unsplash License (free use, no permission needed; attribution is given anyway, see docs/design/scene-credits.md and the
 * settings). They ship with the app as local assets: no API key, no hotlinking, no network request per slide. A later
 * live Unsplash source must go through a server-side proxy (access key never in the frontend), hotlink the returned
 * `urls`, trigger `download_location` once per shown photo and keep this list as the offline fallback.
 */
export interface Scene {
  readonly id: string;
  readonly src: string;
  readonly place: string;
  readonly park: string;
  readonly photographer: string;
  /** Unsplash photo page (with referral parameters, as the Unsplash API guidelines ask for attribution links). */
  readonly url: string;
  /** Focal point for `background-position`, so the motif survives every aspect ratio. */
  readonly focus: string;
  /** Veil strength 0–1: bright, busy photos get more veil, dark calm ones less (adaptive contrast). */
  readonly veil: number;
}

const ref = (slug: string) => `https://unsplash.com/photos/${slug}?utm_source=copyboard&utm_medium=referral`;

export const scenes: readonly Scene[] = [
  {
    id: 'yosemite-merced',
    src: yosemiteMerced,
    place: 'Merced River',
    park: 'Yosemite',
    photographer: 'Bailey Zindel',
    url: ref('NRQV-hBF10M'),
    focus: '50% 58%',
    veil: 0.9,
  },
  {
    id: 'grand-teton-pond',
    src: grandTetonPond,
    place: 'Schwabacher Landing',
    park: 'Grand Teton',
    photographer: 'Garrett Butler',
    url: ref('4t4dsHGxFDw'),
    focus: '62% 40%',
    veil: 1,
  },
  {
    id: 'glacier-lake',
    src: glacierLake,
    place: 'Bergsee',
    park: 'Glacier',
    photographer: 'Kinsey Gibson',
    url: ref('jzNRMhs_Thg'),
    focus: '50% 55%',
    veil: 0.86,
  },
  {
    id: 'yosemite-tunnel-view',
    src: yosemiteTunnelView,
    place: 'Tunnel View',
    park: 'Yosemite',
    photographer: 'Zoshua Colah',
    url: ref('6Jgp0hnv7xY'),
    focus: '55% 45%',
    veil: 0.96,
  },
  {
    id: 'glacier-grinnell',
    src: glacierGrinnell,
    place: 'Grinnell Lake',
    park: 'Glacier',
    photographer: 'Harrison Steen',
    url: ref('d01xcR3puFA'),
    focus: '50% 50%',
    veil: 1,
  },
];

/** Interval of the slideshow: a calm change every ~40 s, never a carousel. */
export const SCENE_INTERVAL_MS = 40_000;

/**
 * The first motif of a visit: derived from the time, so consecutive visits start on different photos without storing
 * anything (the app keeps its state only in its own IndexedDB store).
 */
export const startScene = (now = Date.now()): number => Math.floor(now / SCENE_INTERVAL_MS) % scenes.length;
