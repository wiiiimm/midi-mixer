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
4. Use **Staff labels** to show note names, note names with their octave number (scientific pitch notation, so middle C is C4), or movable-do sol-fa beneath the staves. The default is **None**. Sol-fa follows the MIDI key signature and uses C as Do when the file has no key signature.
5. If the MIDI file has section markers (such as V1, PC1, C1 or Bridge), tap a section under **Sections** to jump there. This also sets the start cue and the loop bars to that section, so turning on **Loop** repeats just that section. Otherwise, set the **A** and **B** bar numbers and turn on **Loop** to repeat a passage. Use **Click** for a beat aligned with the song, or open **Metronome** to set your own tempo and beats per bar.

Open **Tuning fork** for a steady reference pitch. It defaults to A4 at 440 Hz.

Open **Pitch** and tap **Start listening** to check your own pitch through the microphone. It shows the nearest note, how many cents sharp or flat you are (within 10 cents counts as in tune), a trail of the last five seconds and the live waveform of your voice. It hears one voice or instrument at a time, so wear headphones if a song is playing. The microphone is only used in your browser and is released when you close the window.

Note names everywhere (staff labels, the practice piano, the tuning fork and the pitch readout) follow the key signature at the playhead. Flat keys such as F, B♭ and E♭ show black keys as flats (B♭, E♭), and sharp keys such as G, D and A show them as sharps (F♯, C♯). C major, A minor and files without a key signature use sharps. If the song changes key, the names change as playback reaches the new key.

The [standalone metronome](http://127.0.0.1:8000/metronome.html) also works without loading a song.

## Rehearse with an a cappella group

Use a multitrack MIDI arrangement with each vocal part on its own track. Choose **Oohs** or **Aahs** at the top of the mixer to switch the melodic tracks to a vocal sound. **By part** mixes Oohs for upper voices with Aahs for tenor and bass, using each track’s pitch range when its name doesn’t identify the part. **Reset sounds** restores the MIDI instruments and keeps your volume, mute and solo settings. Solo your part to learn it, bring the other parts back in to hear the harmony, then mute your part and sing it against the rest of the arrangement. For sectionals, solo the parts you’re rehearsing together and loop tricky entries or harmonies.

## Use the practice piano

Play the on-screen keys with a mouse, touch or the computer shortcuts shown on the keys. **Shortcut octave** changes where the computer shortcuts start. Use **−8ve** and **+8ve** to scroll the piano by an octave. The computer mapping uses **A–'** for naturals and **W–P** for sharps and flats. Press **Z** or **X** to shift its octave. The sidebar lists the playback and piano shortcuts.

Use **Sound** to choose any of the 128 General MIDI instruments, grouped by family, or type to filter the list. The same picker sets each track’s instrument in the mixer. Sampled sounds download the first time you use them; until then, or if a download fails, a built-in synth plays instead. The selection applies to the next notes you play.

Turn on **Sustain** to keep notes sounding after you let go, so you can build a chord one note at a time. Play a sustained note again to retrigger it. Turn Sustain off to release the notes you’ve let go of.

## Score engraving

Scroll horizontally to read the whole song on one continuous score. The arrows move the view by roughly one screen. Turn **Follow** off to browse independently during playback.

Pinch the score to zoom in or out, between 40% and 300%. On a computer, pinch on the trackpad, hold Ctrl and scroll, or use the zoom slider and **−**/**+** buttons beside **Follow**. Click the percentage to return to 100%. The slider is hidden on phones, where pinching does the same job. Your zoom level is remembered in this browser. Pinching anywhere else does not zoom the page, so the controls stay where they are; keyboard zoom (Ctrl/⌘ with + or −) and your device's own zoom and text-size settings still work.

Turn on **Scrub** to scrub through the song as you would in an audio or video editor: press anywhere on the score to move the playhead there and hear the notes under it, then drag sideways to keep scrubbing. Notes keep sounding while the playhead rests on them. Drag to either edge to scroll the score along. If the song was playing, it pauses while you scrub and carries on from where you let go. Shift-drag also moves the cue to where you let go. On a touch screen, sideways drags scrub, swiping up or down still scrolls, and pinching still zooms.

## Edit the notes

Turn on **Edit** (the pencil beside Scrub) to change the notes of the loaded song on the score. The original MIDI file is always kept as it was, so you can go back to it at any time.

- **Add a note:** tap or click an empty spot on a staff. The note goes into that part, at the line or space you tapped, using the key signature’s sharps or flats. Choose its length from **Length** first; it snaps to that length within the bar.
- **Select a note:** tap or click it. It turns orange and you hear it. Changing **Length** then changes the selected note too.
- **Change its pitch:** drag the note up or down. It moves along the scale of the key, and you hear each step. **♭** and **♯** move it by a semitone instead. On a computer, the arrow keys move it by a step, or a semitone with Shift.
- **Tie or slur:** select a note, tap **Link**, then tap another note in the same part. Two notes of the same pitch are tied and play as one sustained note; notes of different pitches are slurred. **Unlink** removes the selected note’s ties and slurs. Dragging a tied note moves the whole tie with it.
- **Delete:** tap **✕ Delete** or press Delete or Backspace.
- **Undo, redo and reset:** **↶** and **↷** step back and forward through your edits (Ctrl/⌘ Z and Shift Ctrl/⌘ Z on a computer). **Reset to original** goes back to the song’s original MIDI; Undo brings your edits back.

Edits are saved with the song in this browser, and the song shows **Edited** beside its bar count. Playback, the practice piano highlights and the staff labels all follow the edited notes. On a touch screen in Edit mode, sideways swipes still scroll the score, up and down drags move notes (or scroll the staves when you start on an empty spot), and pinching still zooms. Editing needs the engraved score, and drum parts can’t be edited.

MIDI files are engraved in the browser as grouped staves with connected barlines, beams, rests and ties. The display uses part names, key signatures, lyrics and rehearsal markers when the MIDI provides them. MIDI playback uses the original timing.

The PDFs in `reference/scores/` are kept outside the app’s public assets. The bundled **這裡** uses `here-from-score.mid`, which combines the original MIDI performance with verified part names, lyrics and rehearsal marks recovered from its PDF. The bundled **載我走** and **心的小島** also use MIDI files with lyrics and section marks recovered from their PDFs. **載我走** uses the printed opening tempo, and its scanned backing lyrics are partial. **心的小島** includes the four sung parts. The original exports are saved as `here.mid`, `carry-me.mid` and `heart-island.mid`. For a closer match, export MIDI with named tracks, key signatures and lyric events enabled. Exact editorial details such as dynamics, written repeats and enharmonic spelling are best preserved in MusicXML.

## Local storage

Your playlist is kept in this browser’s IndexedDB. On your first visit the three sample songs are copied in alongside anything you import, and every song, samples included, can be removed with the **×** on its row. **Undo** appears briefly after a removal, and **Restore sample songs** brings back any samples you removed. The playlist belongs to this browser only: a different browser profile, hostname or port has its own playlist, and clearing site data empties it. The app asks the browser to keep this storage persistent so it is not cleared to free space.

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
| `src/scripts/midi/` | MIDI file parsing, the editing model (`edit.ts`) and the bundled song list. |
| `src/scripts/score/` | Verovio engraving (loaded on demand as its own chunk) and fallback clef shapes. |
| `src/scripts/tools/` | Practice piano, tuning fork, pitch detector and metronome. |
| `src/scripts/ui/` | Loading screen, responsive drawer, floating windows, instrument picker and offline support. |
| `public/` | Styles, bundled MIDI files, icons, the web app manifest and the service worker. |

## Licence

Copyright © 2026 wiiiimm.

The `midi-mixer` source code is licensed under the **GNU General Public License v3.0 or later** (`GPL-3.0-or-later`). See [LICENSE](LICENSE) for the full licence text.

### Bundled songs and reference scores

The bundled MIDI files in `public/` (`*.mid`) and score PDFs in `reference/scores/` are musical works whose copyright remains with their respective rights holders. They are **not** covered by the GPL-3.0 licence.

### Third-party notices

This project uses open-source libraries, font glyph outlines and General MIDI soundfont samples. See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) and [public/font-licence.txt](public/font-licence.txt) for details.
