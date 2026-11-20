# Third-Party Notices

`midi-mixer` is licensed under the GNU General Public License v3.0 or later (`GPL-3.0-or-later`); see [LICENSE](LICENSE).

This repository also incorporates or loads the following third-party software, fonts and audio assets under their own licences:

## Runtime libraries

| Component | Licence | Source |
| --- | --- | --- |
| [Verovio](https://www.verovio.org) | `LGPL-3.0-only` | https://github.com/rism-digital/verovio |
| [Astro](https://astro.build) | `MIT` | https://github.com/withastro/astro |

## Fonts and notation glyph outlines

- **Noto Fonts (`OFL-1.1`)** — Copyright © Google Inc. / Google LLC. The fallback treble and bass clef SVG outlines in `src/scripts/score/clefs.ts` are derived from Noto font glyphs. The full SIL Open Font License 1.1 notice is included in [public/font-licence.txt](public/font-licence.txt).

## Audio samples (loaded at runtime)

- **FluidR3_GM SoundFont (`MIT`)** — Created by Frank Wen and packaged in MIDI.js MP3 format by Benjamin Gleitzman ([gleitz/midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts)). Individual instrument samples are fetched at runtime from `https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/`.

## Bundled songs and reference scores

- The MIDI files in `public/` (`*.mid`) and PDFs in `reference/scores/` are musical compositions/arrangements and rehearsal reference scores. Copyright remains with their respective rights holders, and these files are excluded from the GPL-3.0 licence.
