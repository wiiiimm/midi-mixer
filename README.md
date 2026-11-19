# midi-mixer

A browser-based MIDI rehearsal player for singers. Import MIDI files locally, follow the score, solo and mute parts, loop bars and play along with the virtual piano. The metronome also opens as a standalone tool.

## Run locally

From the repository root, run `python3 -m http.server 8000 --directory dist` and open `http://localhost:8000`. No build step or backend is required. Imported MIDI files are stored in the browser’s IndexedDB.
