# Scene photography and fonts — credits and licences

Visual Signature v3 (Cinematic Nature Glass). Everything below ships with the app as local assets: no API key, no hotlinking,
no network request at runtime.

## Nature backgrounds (`src/next/assets/scenes/`)

All photos are published on Unsplash under the [Unsplash License](https://unsplash.com/license) (free for commercial and
non-commercial use, no permission required). Attribution is not required but is given in the app (corner credit and
Settings → Allgemein & Darstellung → Fotografien) and here. The files were downloaded through Unsplash's official download
endpoint, resized to 1680–1920 px and re-encoded without metadata.

| File | Motif | Park | Photographer | Source |
| --- | --- | --- | --- | --- |
| `yosemite-merced.jpg` | Merced River | Yosemite | Bailey Zindel | https://unsplash.com/photos/NRQV-hBF10M |
| `grand-teton-pond.jpg` | Schwabacher Landing | Grand Teton | Garrett Butler | https://unsplash.com/photos/4t4dsHGxFDw |
| `glacier-lake.jpg` | Mountain lake | Glacier | Kinsey Gibson | https://unsplash.com/photos/jzNRMhs_Thg |
| `yosemite-tunnel-view.jpg` | Tunnel View | Yosemite | Zoshua Colah | https://unsplash.com/photos/6Jgp0hnv7xY |
| `glacier-grinnell.jpg` | Grinnell Lake | Glacier | Harrison Steen | https://unsplash.com/photos/d01xcR3puFA |

## Light backgrounds — "Lichtlinien" (`src/next/assets/light/`)

Final Experience Polish V1. Long-exposure light photography, all published on Unsplash under the
[Unsplash License](https://unsplash.com/license) (free use; each photo page was checked to say "Free to use under the Unsplash
License", none is Unsplash+). Downloaded from the public Unsplash image CDN on 2026-10-28, resized to 1920 px and re-encoded
(JPEG q≈62). No API key involved; nothing is loaded at runtime. The app composes them soft and out of focus (base.css,
`.cb-scene[data-mode='ambient']`) and credits them in the corner, in image mode and in the settings.

| File | Motif | Photographer | Source |
| --- | --- | --- | --- |
| `light-arcs-cyan.jpg` | Cyan light arcs | Anton Maksimov (@juvnsky) | https://unsplash.com/photos/MSzGw5V0ui8 |
| `light-road-ember.jpg` | Light trails of a night drive | Jahanzeb Ahsan (@jahan_photobox) | https://unsplash.com/photos/NHxa-piVOlc |
| `light-city-traces.jpg` | City light traces | Egor Litvinov (@litvinov) | https://unsplash.com/photos/6-QINjM3DSM |

The former orange line photo `ambient-orange.jpg` (Ryunosuke Kikuno, Unsplash) is no longer shown by any mode; it stays in
the repository as the CSS token fallback (`--cb-scene-photo`).

## Later: live Unsplash source (prepared, not active)

A dynamic source must follow the Unsplash API guidelines:

- The access key stays on a server-side proxy (e.g. a Cloudflare Worker); it is never embedded in the frontend.
- Use the returned `urls.*` for display (hotlinking is required), and call the photo's `download_location` once when a
  photo is actually shown.
- Attribute photographer and Unsplash with links carrying `utm_source=copyboard&utm_medium=referral`.
- Fetch a small batch rarely (respect the hourly rate limit), cache it, and keep the bundled list in
  `src/next/features/shell/scenes.ts` as the offline fallback: a failing API must never affect the workspace.
- The isolation test (`tests/unit/preview-isolation.test.ts`) currently allows only attribution links; a live source would
  need its own confined network module.

## Font

Instrument Serif (regular and italic, latin subset) by Rodrigo Fuenzalida and Jordan Egstad, from Google Fonts, under the
[SIL Open Font License 1.1](https://openfontlicense.org). Self-hosted in `src/next/assets/fonts/`.
