-- The centre line in studs, with an up vector per sample (the road loops, twists and banks). Karts live in
-- track space (studs along the line, studs from the centre), exactly like the Unity game, so laps are exact and
-- the crossplay relay can place a remote kart by progress (0..1) and lateral offset (-1..1).
--
-- TrackData holds metres in Unity axes (left-handed, +Z forward). Mirroring Z gives right-handed axes; "right"
-- is then worked out natively (tangent x up), so +lateral is the driver's right in both games.

local Data = require(script.Parent.TrackData)

local Track = {}
Track.SCALE = 3 -- studs per metre
local S = Track.SCALE

local pts: { Vector3 } = {}
local ups: { Vector3 } = {}
local hov: { number } = {}
local n = math.floor(#Data.points / 3)
for i = 0, n - 1 do
	local x, y, z = Data.points[i * 3 + 1], Data.points[i * 3 + 2], Data.points[i * 3 + 3]
	pts[i + 1] = Vector3.new(x * S, y * S, -z * S)
	local ux, uy, uz = Data.ups[i * 3 + 1] or 0, Data.ups[i * 3 + 2] or 1, Data.ups[i * 3 + 3] or 0
	local u = Vector3.new(ux, uy, -uz)
	ups[i + 1] = if u.Magnitude > 1e-4 then u.Unit else Vector3.yAxis
	hov[i + 1] = Data.hover[i + 1] or 0
end

local cum: { number } = { 0 }
for i = 1, n do
	cum[i + 1] = cum[i] + (pts[i % n + 1] - pts[i]).Magnitude
end

Track.count = n
Track.points = pts
Track.ups = ups
Track.length = cum[n + 1]
Track.halfWidth = Data.width * S * 0.5

local function P(i: number): Vector3
	return pts[(i - 1) % n + 1]
end
local function U(i: number): Vector3
	return ups[(i - 1) % n + 1]
end

local function find(dist: number): (number, number)
	local d = dist % Track.length
	local lo, hi = 1, n + 1
	while hi - lo > 1 do
		local mid = (lo + hi) // 2
		if cum[mid] <= d then
			lo = mid
		else
			hi = mid
		end
	end
	local u = (d - cum[lo]) / math.max(1e-4, cum[lo + 1] - cum[lo])
	return lo, u
end

--- studs along the line where sample i (1-based) sits; i = count + 1 is the full lap
function Track.distOf(i: number): number
	return cum[math.clamp(i, 1, n + 1)]
end

--- centre, tangent, right and up at a distance along the line (wraps)
function Track.sample(dist: number): (Vector3, Vector3, Vector3, Vector3)
	local lo, u = find(dist)
	local centre = P(lo):Lerp(P(lo + 1), u)
	local tangent = (P(lo + 1) - P(lo - 1)):Lerp(P(lo + 2) - P(lo), u).Unit
	local up = U(lo):Lerp(U(lo + 1), u)
	up = (up - tangent * up:Dot(tangent)).Unit
	local right = tangent:Cross(up)
	return centre, tangent, right, up
end

--- world CFrame for a kart at (studs along, studs from centre, heading offset in degrees, + = right)
function Track.poseAt(dist: number, lateral: number, headingDeg: number?): CFrame
	local c, t, r, up = Track.sample(dist)
	local cf = CFrame.fromMatrix(c + r * lateral, r, up, -t)
	if headingDeg and headingDeg ~= 0 then
		cf *= CFrame.Angles(0, -math.rad(headingDeg), 0)
	end
	return cf
end

--- 0 on plain road, 1 on loops, twists and steep banks (hover sections)
function Track.hover(dist: number): number
	local lo, u = find(dist)
	return hov[lo] + (hov[lo % n + 1] - hov[lo]) * u
end

--- loops, twists and drops as {kind, from, to} in studs along the line
Track.features = {}
for _, f in Data.features do
	table.insert(Track.features, { kind = f.kind, from = cum[f.from + 1], to = cum[f.to + 1] })
end

function Track.featureMid(kind: string): number
	for _, f in Track.features do
		if f.kind == kind then
			return (f.from + f.to) * 0.5
		end
	end
	return -1
end

return Track
