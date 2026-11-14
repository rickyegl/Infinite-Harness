-- Scenery round the circuit, the same set as the Unity game's Scenery.cs, so the world never looks empty.
-- On the ground: a ring of terrain mountains with snow on the tall ones, rock clusters, bushes, flower beds, flag
-- poles beside the road, and a grandstand with a crowd by the start.
-- In the air: hot-air balloons, floating islands, clouds (Roblox's own cloud layer and low puffs), a blimp circling
-- the circuit, and glowing arches over the straights.
-- Everything is seeded from the track, so a rebuild looks the same. Nothing collides: karts follow the track path.
-- The motion is local to each player: the client bobs the models tagged SceneryBob, turns the ones tagged
-- ScenerySpin about their Centre and waves the flags tagged SceneryWave.

local CollectionService = game:GetService("CollectionService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config"))
local Track = require(Shared:WaitForChild("Track"))

local S = Track.SCALE
local HW = Track.halfWidth

local Scenery = {}

local function hex(s: string?, fallback: Color3): Color3
	if type(s) == "string" then
		local ok, c = pcall(Color3.fromHex, s)
		if ok then
			return c
		end
	end
	return fallback
end

local function part(parent: Instance, props: { [string]: any }): BasePart
	local p = Instance.new(props.ClassName or "Part")
	p.Anchored = true
	p.CanCollide = false
	p.CanQuery = false
	p.CanTouch = false
	p.Material = Enum.Material.SmoothPlastic
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	local any: any = p
	for k, v in props do
		if k ~= "ClassName" then
			any[k] = v
		end
	end
	p.Parent = parent
	return p
end

local function group(name: string, parent: Instance, at: CFrame?): Model
	local m = Instance.new("Model")
	m.Name = name
	m.ModelStreamingMode = Enum.ModelStreamingMode.Atomic
	m.WorldPivot = at or CFrame.new()
	m.Parent = parent
	return m
end

local UPRIGHT = CFrame.Angles(0, 0, math.rad(90)) -- turns a cylinder (axis X) to stand on Y

--- the road near d is level, upright and not a hover section
local function plain(d: number): boolean
	for k = -3, 3 do
		local dd = d + k * 6 * S
		if Track.hover(dd) > 0.3 or Track.poseAt(dd, 0).UpVector.Y < 0.96 then
			return false
		end
	end
	return true
end

--- a pose on the road turned upright (yaw only)
local function upright(cf: CFrame): CFrame
	local look = cf.LookVector
	local flat = Vector3.new(look.X, 0, look.Z)
	if flat.Magnitude < 1e-3 then
		return CFrame.new(cf.Position)
	end
	return CFrame.lookAt(cf.Position, cf.Position + flat.Unit)
end

--- world: where to build; groundY: the grass top; taken: big things already placed, as {pos, radius}
function Scenery.build(world: Instance, groundY: number, taken: { { pos: Vector3, r: number } })
	local track = Config.track or {}
	local rnd = Random.new((tonumber(track.seed) or 7) * 97 + 3)
	local function R(): number
		return rnd:NextNumber()
	end
	local pal: { Color3 } = {}
	for _, c in (Config.karts and Config.karts.colors) or {} do
		table.insert(pal, hex(c, Color3.new(1, 1, 1)))
	end
	if #pal == 0 then
		pal = { Color3.fromRGB(232, 70, 60), Color3.fromRGB(60, 142, 232), Color3.fromRGB(242, 194, 48) }
	end
	local accent = hex(Config.hud and Config.hud.accent, Color3.fromRGB(255, 210, 60))
	local grass = hex(Config.look and Config.look.ground, Color3.fromRGB(95, 158, 74))

	-- the road, thinned out, for clearance checks; the circuit's middle and radius
	local road: { Vector3 } = {}
	local topY = -math.huge
	local lo, hi = Vector3.one * math.huge, -Vector3.one * math.huge
	for i = 1, Track.count, 3 do
		local p = Track.points[i]
		table.insert(road, p)
		topY = math.max(topY, p.Y)
		lo, hi = lo:Min(p), hi:Max(p)
	end
	local mid = Vector3.new((lo.X + hi.X) / 2, groundY, (lo.Z + hi.Z) / 2)
	local rad = 0
	for _, p in road do
		rad = math.max(rad, Vector2.new(p.X - mid.X, p.Z - mid.Z).Magnitude)
	end
	local function clear(p: Vector3): number
		local m = math.huge
		for _, q in road do
			m = math.min(m, Vector2.new(q.X - p.X, q.Z - p.Z).Magnitude)
		end
		return m
	end
	local function free(p: Vector3, r: number): boolean
		for _, t in taken do
			if Vector2.new(t.pos.X - p.X, t.pos.Z - p.Z).Magnitude < r + t.r then
				return false
			end
		end
		return true
	end
	-- a random ground spot on the grass, clear of the road by `margin` and of the big things by `keep`
	local function spot(margin: number, keep: number): Vector3?
		for _ = 1, 30 do
			local a, r = R() * math.pi * 2, math.sqrt(R()) * rad * 1.15
			local p = Vector3.new(mid.X + math.cos(a) * r, groundY, mid.Z + math.sin(a) * r)
			if clear(p) >= HW + margin and free(p, keep) then
				return p
			end
		end
		return nil
	end

	local root = Instance.new("Folder")
	root.Name = "Scenery"
	root.Parent = world

	------------------------------------------------------------------------------------------------------------
	-- ground

	-- mountains on the rim, pushed out until clear of the road: terrain rock in shrinking layers, snow on top
	local terrain = workspace.Terrain
	local peaks = 26
	for i = 0, peaks - 1 do
		local a = (i + R() * 0.6) / peaks * math.pi * 2
		local h = (45 + R() * 85) * S
		local br = h * (0.6 + R() * 0.35)
		local r = rad * 1.3 + br * 0.15
		local function at(rr: number): Vector3
			return Vector3.new(mid.X + math.cos(a) * rr, groundY, mid.Z + math.sin(a) * rr)
		end
		local p = at(r)
		for _ = 1, 20 do
			if clear(p) >= HW + br * 0.8 + 8 * S then
				break
			end
			r += 8 * S
			p = at(r)
		end
		local layers = 7
		for k = 0, layers - 1 do
			local f = k / layers
			local rr = br * (1 - f) * 0.62 + 4
			local material = if h > 85 * S and f > 0.62 then Enum.Material.Snow else Enum.Material.Rock
			terrain:FillBall(p + Vector3.new(0, h * f - br * 0.12, 0), rr, material)
		end
	end

	local greys = { Color3.fromRGB(133, 133, 140), Color3.fromRGB(158, 153, 148), Color3.fromRGB(107, 110, 120) }
	local bushes = { Color3.fromRGB(43, 115, 51), Color3.fromRGB(61, 140, 56), grass:Lerp(Color3.new(0, 0, 0), 0.35) }
	local ground = Instance.new("Folder")
	ground.Name = "Ground"
	ground.Parent = root
	for i = 1, 45 do
		local p = spot(8 * S, 10 * S)
		if not p then
			continue
		end
		local m = group("Rocks" .. i, ground, CFrame.new(p))
		for k = 0, rnd:NextInteger(0, 2) do
			local s = (1.2 + R() * 2.8) * S
			part(m, {
				Name = "Rock",
				Shape = Enum.PartType.Ball,
				Size = Vector3.one * s,
				CFrame = CFrame.new(p + Vector3.new((k * 1.6 - 1.5) * S, s * 0.15, R() * 1.5 * S)),
				Color = greys[rnd:NextInteger(1, #greys)],
				Material = Enum.Material.Slate,
			})
		end
	end
	for i = 1, 80 do
		local p = spot(6 * S, 8 * S)
		if not p then
			continue
		end
		local m = group("Bush" .. i, ground, CFrame.new(p))
		for _ = 1, rnd:NextInteger(2, 4) do
			local s = (1 + R() * 1.4) * S
			part(m, {
				Name = "Leaves",
				Shape = Enum.PartType.Ball,
				Size = Vector3.one * s,
				CFrame = CFrame.new(p + Vector3.new((R() - 0.5) * 2.2 * S, s * 0.3, (R() - 0.5) * 2.2 * S)),
				Color = bushes[rnd:NextInteger(1, #bushes)],
				Material = Enum.Material.Grass,
			})
		end
	end
	for i = 1, 30 do
		local p = spot(7 * S, 9 * S)
		if not p then
			continue
		end
		local m = group("Flowers" .. i, ground, CFrame.new(p))
		part(m, {
			Name = "Bed",
			Shape = Enum.PartType.Cylinder,
			Size = Vector3.new(0.3, 10 * S, 10 * S),
			CFrame = CFrame.new(p + Vector3.new(0, 0.15, 0)) * UPRIGHT,
			Color = grass:Lerp(Color3.new(0, 0, 0), 0.45),
			Material = Enum.Material.Ground,
		})
		local fc = pal[rnd:NextInteger(1, #pal)]:Lerp(Color3.new(1, 1, 1), 0.15)
		local fc2 = accent:Lerp(Color3.new(1, 1, 1), 0.2)
		for k = 1, 10 do
			local a, r = R() * math.pi * 2, math.sqrt(R()) * 4.4 * S
			part(m, {
				Name = "Flower",
				Shape = Enum.PartType.Ball,
				Size = Vector3.one * (0.35 + R() * 0.25) * S,
				CFrame = CFrame.new(p + Vector3.new(math.cos(a) * r, 0.9, math.sin(a) * r)),
				Color = if k % 3 == 0 then fc2 else fc,
			})
		end
	end

	-- flag poles beside the road, on level stretches near the ground, in the karts' colours
	local flagsFolder = Instance.new("Folder")
	flagsFolder.Name = "Flags"
	flagsFolder.Parent = root
	local count = math.clamp(math.round(Track.length / (38 * S)), 8, 50)
	local fi = 0
	for i = 0, count - 1 do
		local d = Track.length * (i + 0.7) / count
		if not plain(d) then
			continue
		end
		local side = if i % 2 == 0 then 1 else -1
		local pose = Track.poseAt(d, side * (HW + 8.5 * S))
		if pose.Position.Y - groundY > 1.2 * S then
			continue
		end
		local p = Vector3.new(pose.Position.X, groundY, pose.Position.Z)
		if clear(p) < HW + 6 * S then
			continue
		end
		local base = upright(CFrame.new(p) * pose.Rotation)
		local m = group("Flag" .. fi, flagsFolder, base)
		part(m, { Name = "Pole", Shape = Enum.PartType.Cylinder, Size = Vector3.new(9 * S, 0.36 * S, 0.36 * S), CFrame = base * CFrame.new(0, 4.5 * S, 0) * UPRIGHT, Color = Color3.fromRGB(217, 219, 230), Material = Enum.Material.Metal })
		part(m, { Name = "Knob", Shape = Enum.PartType.Ball, Size = Vector3.one * 0.5 * S, CFrame = base * CFrame.new(0, 9.1 * S, 0), Color = accent, Material = Enum.Material.Metal })
		local banner = part(m, {
			Name = "Banner",
			Size = Vector3.new(0.15, 1.6 * S, 2.6 * S),
			CFrame = base * CFrame.new(0, 8 * S, 1.3 * S),
			Color = pal[fi % #pal + 1],
			Material = Enum.Material.Fabric,
		})
		banner:SetAttribute("Hinge", base * CFrame.new(0, 8 * S, 0))
		banner:SetAttribute("Phase", R() * 6)
		CollectionService:AddTag(banner, "SceneryWave")
		fi += 1
	end

	-- a stepped grandstand facing the start straight, with a crowd in the karts' colours and an accent roof
	do
		local pose = Track.poseAt(-14 * S, -(HW + 13 * S))
		local p = Vector3.new(pose.Position.X, groundY, pose.Position.Z)
		if clear(p) >= HW + 9 * S then
			-- its front (-Z) to the road
			local base = upright(CFrame.new(p) * pose.Rotation) * CFrame.Angles(0, math.rad(90), 0)
			table.insert(taken, { pos = p, r = 26 * S })
			local m = group("Grandstand", root, base)
			local len = 40 * S
			for row = 0, 5 do
				local z, h = (-3 + row * 1.6) * S, (0.6 + row * 0.9) * S
				part(m, {
					Name = "Step" .. row,
					Size = Vector3.new(len, h, 1.6 * S),
					CFrame = base * CFrame.new(0, h / 2, z),
					Color = if row % 2 == 0 then Color3.fromRGB(199, 199, 204) else Color3.fromRGB(64, 77, 102),
					Material = Enum.Material.Concrete,
				})
				for k = 0, 25 do
					if R() < 0.18 then
						continue
					end
					local x = -len / 2 + S + k * (len - 2 * S) / 25 + (R() - 0.5) * 0.5 * S
					part(m, { Name = "Fan", Size = Vector3.new(0.55, 1, 0.5) * S, CFrame = base * CFrame.new(x, h + 0.5 * S, z), Color = pal[rnd:NextInteger(1, #pal)] })
					part(m, { Name = "Head", Shape = Enum.PartType.Ball, Size = Vector3.one * 0.5 * S, CFrame = base * CFrame.new(x, h + 1.25 * S, z), Color = Color3.fromRGB(217, 173, 128) })
				end
			end
			for _, x in { -len / 2, 0, len / 2 } do
				part(m, { Name = "Mast", Size = Vector3.new(0.4, 11, 0.4) * S, CFrame = base * CFrame.new(x, 5.5 * S, 6 * S), Color = Color3.fromRGB(77, 77, 87), Material = Enum.Material.Metal })
			end
			part(m, { Name = "Roof", Size = Vector3.new(len + 2 * S, 0.4 * S, 10 * S), CFrame = base * CFrame.new(0, 11 * S, 2 * S) * CFrame.Angles(math.rad(8), 0, 0), Color = accent })
		end
	end

	------------------------------------------------------------------------------------------------------------
	-- air

	-- above everything the road reaches near a spot, with room to spare
	local function airY(p: Vector3, a: number, b: number): number
		local y = groundY + (a + R() * (b - a)) * S
		local near = -math.huge
		for _, q in road do
			if Vector2.new(q.X - p.X, q.Z - p.Z).Magnitude < 40 * S then
				near = math.max(near, q.Y)
			end
		end
		return if near > -math.huge then math.max(y, near + 22 * S) else y
	end
	local function airSpot(spread: number): Vector3
		local a, r = R() * math.pi * 2, (0.25 + 0.85 * math.sqrt(R())) * rad * spread
		return Vector3.new(mid.X + math.cos(a) * r, 0, mid.Z + math.sin(a) * r)
	end
	local function bob(m: Model, amp: number, period: number, spin: number)
		m:SetAttribute("Amp", amp)
		m:SetAttribute("Period", period)
		m:SetAttribute("Phase", R() * 6)
		m:SetAttribute("Spin", spin)
		CollectionService:AddTag(m, "SceneryBob")
	end

	local air = Instance.new("Folder")
	air.Name = "Air"
	air.Parent = root

	-- hot-air balloons: striped envelope, basket on ropes
	for i = 1, 9 do
		local p = airSpot(1.15)
		p = Vector3.new(p.X, airY(p, 38, 85), p.Z)
		local s = (0.8 + R() * 0.6) * S
		local c = CFrame.new(p)
		local m = group("Balloon" .. i, air, c)
		local a = pal[rnd:NextInteger(1, #pal)]
		local b = if i % 2 == 0 then accent else Color3.new(1, 1, 1)
		part(m, { Name = "Envelope", Shape = Enum.PartType.Ball, Size = Vector3.one * 10 * s, CFrame = c, Color = a })
		part(m, { Name = "Band", Shape = Enum.PartType.Cylinder, Size = Vector3.new(1.1 * s, 10.1 * s, 10.1 * s), CFrame = c * CFrame.new(0, 0.6 * s, 0) * UPRIGHT, Color = b })
		part(m, { Name = "Neck", Shape = Enum.PartType.Ball, Size = Vector3.one * 4.6 * s, CFrame = c * CFrame.new(0, -4.4 * s, 0), Color = a })
		part(m, { Name = "Basket", Size = Vector3.new(1.8, 1.3, 1.8) * s, CFrame = c * CFrame.new(0, -9.2 * s, 0), Color = Color3.fromRGB(140, 92, 51), Material = Enum.Material.WoodPlanks })
		for k = 0, 3 do
			local x, z = if k % 2 == 0 then -0.96 else 0.96, if k < 2 then -0.96 else 0.96
			part(m, { Name = "Rope", Size = Vector3.new(0.08, 2.8, 0.08) * s, CFrame = c * CFrame.new(x * s, -7.4 * s, z * s), Color = Color3.fromRGB(77, 64, 51) })
		end
		bob(m, (1.5 + R() * 1.5) * S, 7 + R() * 5, 3)
	end

	-- floating islands: rock in shrinking rings point down, a grass top, a tree or a glowing crystal
	for i = 1, 6 do
		local p = airSpot(1.05)
		p = Vector3.new(p.X, airY(p, 28, 60), p.Z)
		local c = CFrame.new(p)
		local m = group("Island" .. i, air, c)
		local s = (5 + R() * 5) * S
		part(m, { Name = "Top", Shape = Enum.PartType.Cylinder, Size = Vector3.new(0.5 * S, s * 2, s * 2), CFrame = c * UPRIGHT, Color = grass, Material = Enum.Material.Grass })
		for k = 1, 4 do
			local w = s * 2 * (1 - k / 5)
			part(m, {
				Name = "Rock" .. k,
				Shape = Enum.PartType.Cylinder,
				Size = Vector3.new(s * 0.42, w, w),
				CFrame = c * CFrame.new(0, -s * 0.38 * k, 0) * UPRIGHT,
				Color = Color3.fromRGB(122, 102, 87),
				Material = Enum.Material.Slate,
			})
		end
		if i % 2 == 1 then
			part(m, { Name = "Trunk", Shape = Enum.PartType.Cylinder, Size = Vector3.new(2.8, 0.6, 0.6) * S, CFrame = c * CFrame.new(0, 1.6 * S, 0) * UPRIGHT, Color = Color3.fromRGB(107, 74, 46), Material = Enum.Material.Wood })
			part(m, { Name = "Crown", Shape = Enum.PartType.Ball, Size = Vector3.one * 3.8 * S, CFrame = c * CFrame.new(0, 4 * S, 0), Color = bushes[i % #bushes + 1], Material = Enum.Material.Grass })
		else
			local crystal = accent:Lerp(Color3.fromRGB(0, 255, 255), 0.5)
			part(m, { Name = "Crystal", Size = Vector3.new(1.2, 3.6, 1.2) * S, CFrame = c * CFrame.new(0, 2.2 * S, 0) * CFrame.Angles(0, math.rad(45), math.rad(12)), Color = crystal, Material = Enum.Material.Neon })
		end
		bob(m, 1.2 * S, 9 + R() * 6, 2)
	end

	-- clouds: Roblox's own cloud layer high up, and low puffs that drift round the circuit as one carousel
	if not terrain:FindFirstChildOfClass("Clouds") then
		local layer = Instance.new("Clouds")
		layer.Cover = 0.55
		layer.Density = 0.7
		layer.Parent = terrain
	end
	local carousel = group("Clouds", air, CFrame.new(mid))
	carousel:SetAttribute("Speed", 0.7)
	carousel:SetAttribute("Centre", mid)
	CollectionService:AddTag(carousel, "ScenerySpin")
	for _ = 1, 16 do
		local p = airSpot(1.4)
		p = Vector3.new(p.X, math.max(groundY + (85 + R() * 50) * S, topY + 30 * S), p.Z)
		local n = rnd:NextInteger(4, 7)
		for k = 0, n - 1 do
			local s = (7 + R() * 9) * S
			part(carousel, {
				Name = "Puff",
				Shape = Enum.PartType.Ball,
				Size = Vector3.one * s,
				CFrame = CFrame.new(p + Vector3.new((k - n * 0.5) * 6 * S + R() * 3 * S, R() * 3 * S, (R() - 0.5) * 8 * S)),
				Color = Color3.fromRGB(247, 247, 255),
				CastShadow = false,
			})
		end
	end

	-- a blimp circling the circuit
	do
		local centre = Vector3.new(mid.X, math.max(groundY + 70 * S, topY + 25 * S), mid.Z)
		local c = CFrame.new(centre + Vector3.new(rad * 0.75, 0, 0))
		local m = group("Blimp", air, c)
		m:SetAttribute("Speed", 4)
		m:SetAttribute("Centre", centre)
		CollectionService:AddTag(m, "ScenerySpin")
		local hullColor, trim = Color3.fromRGB(235, 237, 245), pal[1]
		-- the hull runs along Z (its direction of travel round the carousel)
		local along = CFrame.Angles(0, math.rad(90), 0)
		part(m, { Name = "Hull", Shape = Enum.PartType.Cylinder, Size = Vector3.new(14, 8, 8) * S, CFrame = c * along, Color = hullColor })
		part(m, { Name = "Nose", Shape = Enum.PartType.Ball, Size = Vector3.one * 8 * S, CFrame = c * CFrame.new(0, 0, -7 * S), Color = hullColor })
		part(m, { Name = "Tail", Shape = Enum.PartType.Ball, Size = Vector3.one * 8 * S, CFrame = c * CFrame.new(0, 0, 7 * S), Color = hullColor })
		part(m, { Name = "Stripe", Shape = Enum.PartType.Cylinder, Size = Vector3.new(1.4, 8.2, 8.2) * S, CFrame = c * along, Color = accent, Material = Enum.Material.Neon })
		part(m, { Name = "Gondola", Size = Vector3.new(2, 1.4, 5) * S, CFrame = c * CFrame.new(0, -4.4 * S, -1 * S), Color = trim })
		for k = 0, 3 do
			part(m, { Name = "Fin" .. k, Size = Vector3.new(0.3, 6, 3.5) * S, CFrame = c * CFrame.new(0, 0, 12 * S) * CFrame.Angles(0, 0, math.rad(k * 90)), Color = trim })
		end
	end

	-- glowing arches over the straights, wall to wall, high above the karts
	local arches = 0
	local d = 90 * S
	while d < Track.length - 60 * S and arches < 7 do
		if not plain(d) then
			d += 37 * S
			continue
		end
		local base = upright(Track.poseAt(d, 0))
		local m = group("Arch" .. arches, air, base)
		local r = HW + 3.4 * S
		for k = 0, 12 do
			local th = math.pi * k / 12
			part(m, {
				Name = "Segment",
				Size = Vector3.new(1.9, 0.55, 0.55) * S,
				CFrame = base * CFrame.new(math.cos(th) * r, 2.4 * S + math.sin(th) * r, 0) * CFrame.Angles(0, 0, th + math.pi / 2),
				Color = if k % 2 == 0 then accent:Lerp(Color3.new(1, 1, 1), 0.15) else Color3.fromRGB(0, 204, 255),
				Material = Enum.Material.Neon,
			})
		end
		for _, x in { -r, r } do
			part(m, { Name = "Leg", Size = Vector3.new(0.55, 2.4, 0.55) * S, CFrame = base * CFrame.new(x, 1.2 * S, 0), Color = accent, Material = Enum.Material.Neon })
		end
		arches += 1
		d += 147 * S
	end
end

return Scenery
