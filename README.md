# midi-mixer

A browser-based rehearsal studio for singers learning parts from MIDI files. Follow the score, bring your part forward in the mix and loop tricky passages at a comfortable tempo. Three songs are included so you can try it before importing your own.

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

## Use the practice piano

Play the on-screen keys with a mouse, touch or the computer shortcuts shown on the keys. **Shortcut octave** changes where the computer shortcuts start. Use **−8ve** and **+8ve** to scroll the piano by an octave. The computer mapping uses **A–'** for naturals and **W–P** for sharps and flats. Press **Z** or **X** to shift its octave. The sidebar lists the playback and piano shortcuts.

Use **Sound** to search for and choose Piano, Electric piano, Organ, Guitar, Bass, Strings, Choir, Brass, Reed or Flute. The selection applies to the next notes you play.

Turn on **Sustain** to keep notes sounding after you let go, so you can build a chord one note at a time. Play a sustained note again to retrigger it. Choose **Release notes** to clear the chord and keep Sustain on. Turning Sustain off releases notes you’ve already let go of.

## Score engraving

Scroll horizontally to read the whole song on one continuous score. The arrows move the view by roughly one screen. Turn **Follow** off to browse independently during playback.

MIDI files are engraved in the browser as grouped staves with connected barlines, beams, rests and ties. The display uses part names, key signatures, lyrics and rehearsal markers when the MIDI provides them. MIDI playback uses the original timing.

The PDFs in `reference/scores/` are kept outside the app’s public assets. The bundled **這裡** uses `here-from-score.mid`, which combines the original MIDI performance with verified part names, lyrics and rehearsal marks recovered from its PDF. The bundled **載我走** and **心的小島** also use MIDI files with lyrics and section marks recovered from their PDFs. **載我走** uses the printed opening tempo, and its scanned backing lyrics are partial. **心的小島** includes the four sung parts. The original exports are saved as `here.mid`, `carry-me.mid` and `heart-island.mid`. For a closer match, export MIDI with named tracks, key signatures and lyric events enabled. Exact editorial details such as dynamics, written repeats and enharmonic spelling are best preserved in MusicXML.

## Local storage

Imported files stay in your browser’s IndexedDB and are restored when you revisit the same address. A different browser profile, hostname or port has its own library. Clearing site data removes the imported copies.

## Build and preview

```sh
npm run build
npm run preview
```

Astro writes the static site to `dist/`. The pages live in `src/pages/`. Browser scripts, styles and bundled MIDI files live in `public/`.
