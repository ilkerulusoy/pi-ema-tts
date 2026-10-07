# pi-ema-tts

A [pi](https://github.com/earendil-works/pi) extension that reads the last assistant reply aloud with local EMA TTS (`ema_lightning`). It is off by default.

## Requirements

- macOS (playback uses `afplay`)
- Python with `ema_lightning` installed

## Install

```
pi install git:github.com/ilkerulusoy/pi-ema-tts
```

To test without installing, run `pi -e ./index.ts` from a clone.

## Commands

- `/tts` toggles TTS on or off
- `/tts on` and `/tts off`
- `/tts minimal` turns TTS on and reads only the `<tts>...</tts>` section
- `/tts full` turns TTS on and reads the full reply
- `/tts stop` stops the current playback

Code blocks are not read.

## Minimal mode

In minimal mode the extension adds a `tts` section to the system prompt. The model then ends each reply with a short spoken summary inside `<tts>...</tts>`, and only that summary is read. `/tts full` and `/tts off` remove the section.

## Configuration

- `EMA_PYTHON`: Python interpreter with `ema_lightning` (default `python3`)
- `EMA_MAX_CHARS`: maximum characters read per reply (default `1500`)

Example:

```
export EMA_PYTHON=/path/to/venv/bin/python
```

## License

MIT
