# AirBeat local audio

AirBeat is currently configured to use the user-supplied file
`nevergonnagiveyouup-30s.mp3`. It is a frame-accurate excerpt beginning at
approximately `00:42.501`; its encoded duration is `30.0147` seconds, while
the game plays the first 30 seconds. The original MP3 is preserved unchanged.

Only distribute audio that you have permission to use. To replace the clip:

1. Put the file in this directory, for example `song-30s.mp3`.
2. In `js/scenes/airbeat/config.js`, set:

   ```js
   audioPath: './media/sound/airbeat/song-30s.mp3',
   ```

3. The current chart expects the clip to begin on a strong downbeat at 113 BPM.
   Adjust `LEAD_IN` or individual beat numbers in `chart.js` if the clip begins
   with silence or a pickup.

If the path is `null` or loading fails, AirBeat automatically uses its built-in
113 BPM practice mix.
