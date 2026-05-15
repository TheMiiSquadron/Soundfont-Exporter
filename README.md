# Soundfont Exporter

A standalone browser app that turns imported audio samples into a basic `.sf2` SoundFont.

Exports are written as SoundFont 2.01 files for compatibility with FL Studio, LMMS, and other SF2 players that use stricter parsers.

## Use

Open `index.html` in a browser, import audio files, adjust the MIDI key mapping if needed, then export.

The exporter supports 30+ files and writes a single preset where each sample is mapped to its configured key range.

## Notes

- Browser audio decoding decides which file types work on the current machine.
- Samples are resampled to 44.1 kHz mono PCM16 for wider SF2 player compatibility.
- The generated SoundFont is intentionally simple: one preset, one instrument, one sample zone per imported sample, no loop editing.
- In LMMS, make sure the piano roll notes match the exported key ranges. By default, the first imported sample starts at C4 / MIDI 60 and each later sample is mapped to the next key.
