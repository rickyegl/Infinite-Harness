# music

Hands over the run's chosen song. Nothing is generated: the author picked the song, and this cell delivers it to
whoever asked. Examples are the "add music" follow-up (`game.music`) and a design's music piece.

- **Song:** the largest audio file (`.mp3`, `.wav`, `.ogg`) in `assets/music/`, where the author can put a longer
  version. Otherwise `video/makeasong.mp3` (about 2 s). The prompt only names the use and does not change the song.
- **Commands:** `ffprobe -v error -show_entries format=duration -of csv=p=0 <song>` (next to `paths.ffmpeg`) for
  the length shown in the step.
- **Files:** `song.mp3` (or the song's own extension), which is what `request()` delivers.

Mock: `fixtures/default.jsonl`, recorded from a real run.
