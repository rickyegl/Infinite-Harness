-- The track's centre line, written by the Track cell from the same generator the Unity game uses (exported by
-- the Unity editor in metres and Unity axes; Track.luau converts). This default is a plain oval so the
-- template builds and plays on its own.
local points, ups, hover = {}, {}, {}
local n = 160
for i = 0, n - 1 do
	local a = i / n * math.pi * 2
	table.insert(points, math.cos(a) * 110)
	table.insert(points, 0)
	table.insert(points, math.sin(a) * 70)
	table.insert(ups, 0)
	table.insert(ups, 1)
	table.insert(ups, 0)
	table.insert(hover, 0)
end
return { width = 14, points = points, ups = ups, hover = hover, features = {} }
