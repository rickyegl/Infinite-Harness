# game.music

Live follow-up: "add music". It reuses the race music from the design's art, or asks the music kind for a new track
when the request names a style. It copies the file into the build's and the project's `StreamingAssets` and sets
the `music` flag, so the running game starts playing it. A Roblox place needs an uploaded audio id instead.
