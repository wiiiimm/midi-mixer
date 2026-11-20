# midi-mixer

A browser-based MIDI rehearsal studio for singers and a cappella groups. Follow the score, bring your part forward in the mix and loop tricky passages at a comfortable tempo. Three songs are included so you can try it before importing your own.

## Run locally

Use Node.js 22.23.4 or later on a supported even-numbered release line.

```sh
npm install
npm run dev
```

Open [midi-mixer](http://127.0.0.1:8000). The Astro dev server refreshes open pages when you save changes to a page, script or stylesheet.

## Rehearse a song

1. Pick a song from the rehearsal playlist or choose **Load MIDI files** to import one or more `.mid` or `.midi` files.
2. Use the **Track mixer** to solo your part, mute other parts or adjust their levels. Click a track’s instrument to search for a different sound. Select several tracks to mute or solo them together.
3. Click a note or measure to move the green playhead. Use **Cue Here**, Shift-click the score or enter a **Start bar** to set the orange cue. Press **R** to return to it. Adjust **BPM** or **Speed** to practise more slowly without changing pitch.
4. Use **Staff labels** to show note names or movable-do sol-fa beneath the staves. The default is **None**. Sol-fa follows the MIDI key signature and uses C as Do when the file has no key signature.
5. Set the **A** and **B** bar numbers and turn on **Loop** to repeat a passage. Use **Click** for a beat aligned with the song, or open **Metronome** to set your own tempo and beats per bar.

Open **Tuning fork** for a steady reference pitch. It defaults to A4 at 440 Hz.

The [standalone metronome](http://127.0.0.1:8000/metronome.html) also works without loading a song.

## Rehearse with an a cappella group

Use a multitrack MIDI arrangement with each vocal part on its own track. Choose **Oohs** or **Aahs** at the top of the mixer to switch the melodic tracks to a vocal sound. **By part** mixes Oohs for upper voices with Aahs for tenor and bass, using each track’s pitch range when its name doesn’t identify the part. **Reset sounds** restores the MIDI instruments and keeps your volume, mute and solo settings. Solo your part to learn it, bring the other parts back in to hear the harmony, then mute your part and sing it against the rest of the arrangement. For sectionals, solo the parts you’re rehearsing together and loop tricky entries or harmonies.

## Use the practice piano

Play the on-screen keys with a mouse, touch or the computer shortcuts shown on the keys. **Shortcut octave** changes where the computer shortcuts start. Use **−8ve** and **+8ve** to scroll the piano by an octave. The computer mapping uses **A–'** for naturals and **W–P** for sharps and flats. Press **Z** or **X** to shift its octave. The sidebar lists the playback and piano shortcuts.

Use **Sound** to choose any of the 128 General MIDI instruments, grouped by family, or type to filter the list. The same picker sets each track’s instrument in the mixer. Sampled sounds download the first time you use them; until then, or if a download fails, a built-in synth plays instead. The selection applies to the next notes you play.

Turn on **Sustain** to keep notes sounding after you let go, so you can build a chord one note at a time. Play a sustained note again to retrigger it. Turn Sustain off to release the notes you’ve let go of.

## Score engraving

Scroll horizontally to read the whole song on one continuous score. The arrows move the view by roughly one screen. Turn **Follow** off to browse independently during playback.

MIDI files are engraved in the browser as grouped staves with connected barlines, beams, rests and ties. The display uses part names, key signatures, lyrics and rehearsal markers when the MIDI provides them. MIDI playback uses the original timing.

The PDFs in `reference/scores/` are kept outside the app’s public assets. The bundled **這裡** uses `here-from-score.mid`, which combines the original MIDI performance with verified part names, lyrics and rehearsal marks recovered from its PDF. The bundled **載我走** and **心的小島** also use MIDI files with lyrics and section marks recovered from their PDFs. **載我走** uses the printed opening tempo, and its scanned backing lyrics are partial. **心的小島** includes the four sung parts. The original exports are saved as `here.mid`, `carry-me.mid` and `heart-island.mid`. For a closer match, export MIDI with named tracks, key signatures and lyric events enabled. Exact editorial details such as dynamics, written repeats and enharmonic spelling are best preserved in MusicXML.

## Local storage

Imported files stay in your browser’s IndexedDB and are restored when you revisit the same address. A different browser profile, hostname or port has its own library. Clearing site data removes the imported copies.

In production builds a service worker keeps the app, the bundled songs and any instrument sounds you have used available offline. Sounds that fail to download while offline are fetched again when the connection returns.

## Build and preview

```sh
npm run check    # strict TypeScript and Astro diagnostics
npm run build
npm run preview
```

Astro writes the static site to `dist/`.

| Path | Contents |
| --- | --- |
| `src/pages/` | The studio (`index.astro`) and the standalone metronome. |
| `src/components/` | Astro components for the page markup, the logo and icons. |
| `src/scripts/main.ts` | Studio entry point: calls each module’s `init` function in order. |
| `src/scripts/studio/` | Shared state, playback scheduling, transport, mixer, playlist and score view. |
| `src/scripts/audio/` | Audio context and built-in synth, General MIDI samples and the metronome click. |
| `src/scripts/midi/` | MIDI file parsing and the bundled song list. |
| `src/scripts/score/` | Verovio engraving (loaded on demand as its own chunk) and fallback clef shapes. |
| `src/scripts/tools/` | Practice piano, tuning fork and metronome. |
| `src/scripts/ui/` | Loading screen, responsive drawer, floating windows, instrument picker and offline support. |
| `public/` | Styles, bundled MIDI files, icons, the web app manifest and the service worker. |
