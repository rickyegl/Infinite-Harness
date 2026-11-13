-- The game design, written by the engine cells from design.json. Each part cell switches its piece on in
-- `built` once it has written its section, so the place grows the same way the Unity game does.
return {
	title = "Brawl Karts",
	laps = 2,
	karts = {
		count = 6,
		topSpeed = 26,
		accel = 9,
		grip = 6,
		steer = 9,
		colors = { "#e8463c", "#3c8ee8", "#f2c230", "#3cc47a", "#b25ce8", "#f08a3c" },
		names = { "Blaze", "Volt", "Sunny", "Moss", "Grape", "Ember" },
	},
	riders = { weapon = "club", height = 1, skin = "#f1c27d" },
	combat = { range = 4.5, cooldown = 1.6, knock = 7, slow = 0.45, aiAggression = 0.6, hitColor = "#ffd23c" },
	hud = { title = "Brawl Karts", accent = "#ffd23c", minimap = true },
	look = { sky = "#7fb4e6", ground = "#5f9e4a" },
	built = { track = true, karts = true, riders = true, combat = true, hud = true },
}
