# Call Sounds

This folder contains audio files for call notifications.

## Files:

1. **incoming-call.mp3** - Ringtone played when receiving a call (receiver side)
2. **outgoing-call.mp3** - Dialing tone played when initiating a call (caller side)

## Usage:

These sounds are automatically played by the `useCallSound` hook:
- `incoming-call.mp3`: Played in `IncomingCallPopup` component
- `outgoing-call.mp3`: Played in `OutgoingCallPopup` component

## Sound Sources:

You can replace these files with your own audio files. Recommended:
- Format: MP3 or OGG
- Duration: 2-5 seconds (will loop)
- Volume: Normalized to prevent clipping

## Free Sound Resources:

1. **Freesound.org** - https://freesound.org/
2. **Zapsplat** - https://www.zapsplat.com/
3. **Pixabay** - https://pixabay.com/sound-effects/

## Current Setup:

Since we don't have actual audio files yet, you can:

### Option 1: Use Free Online Sounds
Download free ringtones and place them in this folder:
- incoming-call.mp3
- outgoing-call.mp3

### Option 2: Use Browser Beep (Temporary)
The code will fallback to silent if files are missing.

### Option 3: Generate Simple Tones (JavaScript)
See `generate-call-sounds.js` for a script to generate simple beep tones.
