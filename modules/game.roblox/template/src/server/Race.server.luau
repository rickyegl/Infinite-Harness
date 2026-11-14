-- The race server. Builds the track from Track.luau (road slabs that follow the loops and twists, kerbs, glowing
-- rails on hover sections, pillars, lamps, the start gantry), then runs the race: karts move in track space
-- (studs along the line, studs from the centre) so they stay glued to the road upside down; players drive with
-- the Drive remote, the rest are AI. Every rider has a class with its own attack, the same four as the Unity game:
--   volt     SPACE: an electric dash (0.7 s at 1.55x top speed); every kart it runs into is zapped
--   sniper   mouse to aim, click to shoot, once every 10 s; the server hits the kart nearest the aim ray
--   shrink   SPACE: small and fast for 4 s (1.3x top speed), but a kart that touches it squashes it (big slow)
--   thrower  throws an item forward on its own every 3 s; the item hits the first kart in its lane
-- Generated 3D models (Config.models: Roblox asset ids) replace the part-built kart body, riders, and add
-- landmarks and a trophy; a slot without an id keeps its parts. The rider sits in the generated kart's seat.
-- Scenery.luau fills the world round the circuit (mountains, rocks, bushes, flowers, flags, a grandstand,
-- balloons, floating islands, clouds, a blimp, arches).
-- With the crossplay flag on it also posts its karts to the relay and shows the other engine's karts as ghosts.
-- Each piece only exists once its part cell has written it (Config.built).

local CollectionService = game:GetService("CollectionService")
local Debris = game:GetService("Debris")
local HttpService = game:GetService("HttpService")
local InsertService = game:GetService("InsertService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local SoundService = game:GetService("SoundService")
local TweenService = game:GetService("TweenService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config"))
local Flags = require(Shared:WaitForChild("Flags"))
local Look = require(Shared:WaitForChild("Look"))
local Track = require(Shared:WaitForChild("Track"))
local Scenery = require(script.Parent:WaitForChild("Scenery"))

local S = Track.SCALE
local L = Track.length
local HW = Track.halfWidth
local built = Config.built or {}
local look = Config.look or {}

Players.CharacterAutoLoads = false

local remotes = Instance.new("Folder")
remotes.Name = "Race"
local Drive = Instance.new("RemoteEvent")
Drive.Name = "Drive"
Drive.Parent = remotes
local StateEvent = Instance.new("RemoteEvent")
StateEvent.Name = "State"
StateEvent.Parent = remotes
local FeedEvent = Instance.new("RemoteEvent")
FeedEvent.Name = "Feed"
FeedEvent.Parent = remotes
remotes.Parent = ReplicatedStorage

----------------------------------------------------------------------------------------------------------------
-- building blocks

local function make(className: string, props: { [string]: any }, parent: Instance?): any
	local x = Instance.new(className)
	if x:IsA("BasePart") then
		x.Anchored = true
		x.CanCollide = false
		x.TopSurface = Enum.SurfaceType.Smooth
		x.BottomSurface = Enum.SurfaceType.Smooth
	end
	for k, v in props do
		(x :: any)[k] = v
	end
	x.Parent = parent
	return x
end

local function hex(s: string?, fallback: Color3): Color3
	if type(s) ~= "string" then
		return fallback
	end
	local ok, c = pcall(Color3.fromHex, s)
	return if ok then c else fallback
end

local world = make("Folder", { Name = "Track" }, workspace)

----------------------------------------------------------------------------------------------------------------
-- the track

local ROAD = Color3.fromRGB(52, 54, 60)
local HOVER_ROAD = Color3.fromRGB(38, 34, 70)
local RAIL = Color3.fromRGB(80, 230, 255)

local function buildTrack()
	local n = Track.count
	local pts, ups = Track.points, Track.ups
	local minY, minX, maxX, minZ, maxZ = math.huge, math.huge, -math.huge, math.huge, -math.huge
	for _, p in pts do
		minY, minX, maxX = math.min(minY, p.Y), math.min(minX, p.X), math.max(maxX, p.X)
		minZ, maxZ = math.min(minZ, p.Z), math.max(maxZ, p.Z)
	end
	local groundY = minY - 3

	local road = make("Folder", { Name = "Road" }, world)
	local deco = make("Folder", { Name = "Deco" }, world)
	for i = 1, n do
		local a, b = pts[i], pts[i % n + 1]
		local seg = b - a
		local len = seg.Magnitude
		if len < 1e-3 then
			continue
		end
		local t = seg.Unit
		local up = (ups[i] + ups[i % n + 1])
		up = (up - t * up:Dot(t)).Unit
		local right = t:Cross(up)
		local mid = (a + b) * 0.5
		local hovering = Track.hover(Track.distOf(i)) > 0.5
		local slab = make("Part", {
			Name = "Road" .. i,
			Size = Vector3.new(HW * 2, 1.2, len + 0.35),
			CFrame = CFrame.fromMatrix(mid - up * 0.6, right, up, -t),
			Color = if hovering then HOVER_ROAD else ROAD,
			Material = Enum.Material.SmoothPlastic,
		}, road)
		CollectionService:AddTag(slab, "Road")
		for side = -1, 1, 2 do
			local edge = mid + right * side * (HW + 0.8)
			if hovering then
				local rail = make("Part", {
					Name = "Rail",
					Size = Vector3.new(0.7, 0.7, len + 0.35),
					CFrame = CFrame.fromMatrix(edge + up * 0.6, right, up, -t),
					Color = RAIL,
					Material = Enum.Material.Neon,
				}, deco)
				CollectionService:AddTag(rail, "HoverRail")
			else
				make("Part", {
					Name = "Kerb",
					Size = Vector3.new(1.6, 1.5, len + 0.35),
					CFrame = CFrame.fromMatrix(edge - up * 0.45, right, up, -t),
					Color = if (i // 2) % 2 == 0 then Color3.fromRGB(220, 40, 40) else Color3.new(1, 1, 1),
					Material = Enum.Material.SmoothPlastic,
				}, deco)
			end
		end
		-- pillars under raised, upright road
		local base = mid - up * 1.2
		if i % 6 == 0 and up.Y > 0.85 and base.Y - groundY > 6 then
			local h = base.Y - groundY
			make("Part", {
				Name = "Pillar",
				Size = Vector3.new(2.4, h, 2.4),
				CFrame = CFrame.new(base.X, groundY + h / 2, base.Z),
				Color = Color3.fromRGB(150, 150, 158),
				Material = Enum.Material.Concrete,
			}, deco)
		end
		-- lamps along the plain road; they light up at night
		if i % 8 == 4 and not hovering and up.Y > 0.9 then
			local side = if (i // 8) % 2 == 0 then 1 else -1
			local foot = mid + right * side * (HW + 4)
			local post = make("Part", {
				Name = "LampPost",
				Size = Vector3.new(0.8, 16, 0.8),
				CFrame = CFrame.new(foot + Vector3.new(0, 8, 0)),
				Color = Color3.fromRGB(60, 62, 70),
				Material = Enum.Material.Metal,
			}, deco)
			local head = make("Part", {
				Name = "Lamp",
				Size = Vector3.new(3, 0.8, 1.6),
				CFrame = post.CFrame * CFrame.new(-side * 1.2, 8, 0),
				Color = Color3.fromRGB(255, 226, 160),
				Material = Enum.Material.SmoothPlastic,
			}, deco)
			CollectionService:AddTag(head, "NightGlow")
			local light = make("PointLight", { Range = 45, Brightness = 2, Color = Color3.fromRGB(255, 214, 150), Enabled = false }, head)
			CollectionService:AddTag(light, "NightLight")
		end
	end

	-- the grass reaches the ring of mountains (Scenery puts them at 1.3x the circuit's radius)
	local cx, cz = (minX + maxX) / 2, (minZ + maxZ) / 2
	local rad = 0
	for _, p in pts do
		rad = math.max(rad, Vector2.new(p.X - cx, p.Z - cz).Magnitude)
	end
	local margin = 140
	local span = math.min(rad * 2 * 1.5, 2048) -- a part is at most 2048 studs on a side
	make("Part", {
		Name = "Ground",
		Size = Vector3.new(math.max(maxX - minX + margin * 2, span), 2, math.max(maxZ - minZ + margin * 2, span)),
		CFrame = CFrame.new((minX + maxX) / 2, groundY - 1, (minZ + maxZ) / 2),
		Color = hex(look.ground, Color3.fromRGB(95, 158, 74)),
		Material = Enum.Material.Grass,
		CanCollide = true,
	}, world)

	-- start gantry and chequered line at distance 0
	local start = Track.poseAt(0, 0)
	for side = -1, 1, 2 do
		make("Part", {
			Name = "GantryPost",
			Size = Vector3.new(1.6, 20, 1.6),
			CFrame = start * CFrame.new(side * (HW + 2.5), 10, 0),
			Color = Color3.fromRGB(40, 40, 46),
			Material = Enum.Material.Metal,
		}, world)
	end
	local bar = make("Part", {
		Name = "GantryBar",
		Size = Vector3.new(HW * 2 + 6.6, 3.6, 1.4),
		CFrame = start * CFrame.new(0, 19, 0),
		Color = Color3.fromRGB(24, 24, 30),
		Material = Enum.Material.SmoothPlastic,
	}, world)
	for _, face in { Enum.NormalId.Front, Enum.NormalId.Back } do
		local gui = make("SurfaceGui", { Face = face, PixelsPerStud = 24, LightInfluence = 0 }, bar)
		make("TextLabel", {
			Size = UDim2.fromScale(1, 1),
			BackgroundTransparency = 1,
			Text = string.upper(Config.title or "Race"),
			TextColor3 = hex(Config.hud and Config.hud.accent, Color3.fromRGB(255, 210, 60)),
			TextScaled = true,
			Font = Enum.Font.GothamBlack,
		}, gui)
	end
	local cells = 10
	for c = 0, cells - 1 do
		for r = 0, 1 do
			make("Part", {
				Name = "Chequer",
				Size = Vector3.new(HW * 2 / cells, 0.1, 1.4),
				CFrame = start * CFrame.new(-HW + (c + 0.5) * HW * 2 / cells, 0.05, (r - 0.5) * 1.4),
				Color = if (c + r) % 2 == 0 then Color3.new(1, 1, 1) else Color3.fromRGB(20, 20, 20),
				Material = Enum.Material.SmoothPlastic,
			}, world)
		end
	end
end

if built.track then
	buildTrack()
end

----------------------------------------------------------------------------------------------------------------
-- generated models: Config.models maps a slot (kart, rider.<class>, landmark.<n>, trophy) to { id = asset id,
-- yaw = degrees }. Each asset loads once; a slot without an id, or one that does not load, keeps its parts.

local MC = Config.models or {}
local templates: { [string]: { model: Model, longest: number } | false } = {}

local function modelSpec(slot: string): (number?, number)
	local spec = MC[slot]
	if type(spec) == "number" then
		return spec, 0
	elseif type(spec) == "table" then
		return tonumber(spec.id), tonumber(spec.yaw) or 0
	end
	return nil, 0
end

-- the slot's asset with its pivot at its bottom centre (InsertService loads assets the place's owner owns)
local function template(slot: string): { model: Model, longest: number }?
	local cached = templates[slot]
	if cached ~= nil then
		return cached or nil
	end
	templates[slot] = false
	local id = modelSpec(slot)
	if not id then
		return nil
	end
	local ok, asset = pcall(InsertService.LoadAsset, InsertService, id)
	if not ok or not asset then
		warn(string.format("model %s (asset %d) did not load: %s", slot, id, tostring(asset)))
		return nil
	end
	local m = Instance.new("Model")
	m.Name = slot
	for _, d in asset:GetDescendants() do
		if d:IsA("LuaSourceContainer") then
			d:Destroy()
		elseif d:IsA("BasePart") then
			d.Anchored = true
			d.CanCollide = false
			d.CanQuery = false
			d.CanTouch = false
		end
	end
	for _, c in asset:GetChildren() do
		c.Parent = m
	end
	asset:Destroy()
	if not m:FindFirstChildWhichIsA("BasePart", true) then
		warn(string.format("model %s (asset %d) has no parts", slot, id))
		return nil
	end
	m.WorldPivot = CFrame.new()
	local cf, size = m:GetBoundingBox()
	m.WorldPivot = CFrame.new(cf.Position - Vector3.new(0, size.Y / 2, 0))
	m:PivotTo(CFrame.new())
	local t = { model = m, longest = math.max(size.X, size.Y, size.Z, 1e-3) }
	templates[slot] = t
	return t
end

--- a copy of the slot's model, longest side `size` studs, standing at `at` and facing its -Z (turned by the yaw)
local function spawnModel(slot: string, parent: Instance, at: CFrame, size: number): Model?
	local t = template(slot)
	if not t then
		return nil
	end
	local _, yaw = modelSpec(slot)
	local m = t.model:Clone()
	m.Name = "Model_" .. slot
	m:ScaleTo(m:GetScale() * size / t.longest)
	m:PivotTo(at * CFrame.Angles(0, math.rad(yaw), 0))
	m.Parent = parent
	return m
end

----------------------------------------------------------------------------------------------------------------
-- set pieces: the landmarks off the road where nothing of the circuit passes, turned to face it, and the
-- trophy on a podium beside the finish line (only with generated models)

local trophy: Model? = nil

local function setPieces()
	local pts = Track.points
	local groundY = math.huge
	for _, p in pts do
		groundY = math.min(groundY, p.Y)
	end
	groundY -= 3
	local folder = make("Folder", { Name = "Landmarks" }, world)
	for n = 1, 4 do
		local slot = "landmark." .. n
		if not modelSpec(slot) then
			continue
		end
		local size = 26 * S
		for k = 0, 39 do
			local d = (L * (0.12 + 0.45 * (n - 1) + 0.03 * k)) % L
			local side = if (k + n) % 2 == 0 then 1 else -1
			local off = side * (HW + size * 0.6 + 6 * S + (k // 2) * 3 * S)
			local pos = Track.poseAt(d, off).Position
			pos = Vector3.new(pos.X, groundY, pos.Z)
			local clear = math.huge
			for _, p in pts do
				clear = math.min(clear, Vector2.new(p.X - pos.X, p.Z - pos.Z).Magnitude)
			end
			if clear < HW + size * 0.55 + 3 * S then
				continue
			end
			local centre = Track.poseAt(d, 0).Position
			spawnModel(slot, folder, CFrame.lookAt(pos, Vector3.new(centre.X, groundY, centre.Z)), size)
			break
		end
	end
	if modelSpec("trophy") then
		local pose = Track.poseAt(6 * S, HW + 6.5 * S)
		local base = CFrame.lookAt(pose.Position, pose.Position - pose.RightVector)
		local stand = make("Model", { Name = "Trophy" }, world)
		make("Part", {
			Name = "Podium",
			Shape = Enum.PartType.Cylinder,
			Size = Vector3.new(1.2 * S, 3.2 * S, 3.2 * S),
			CFrame = base * CFrame.new(0, 0.6 * S, 0) * CFrame.Angles(0, 0, math.rad(90)),
			Color = Color3.fromRGB(230, 230, 235),
			Material = Enum.Material.Marble,
		}, stand)
		make("Part", {
			Name = "Rim",
			Shape = Enum.PartType.Cylinder,
			Size = Vector3.new(0.15, 2.4 * S, 2.4 * S),
			CFrame = base * CFrame.new(0, 1.25 * S, 0) * CFrame.Angles(0, 0, math.rad(90)),
			Color = hex(Config.hud and Config.hud.accent, Color3.fromRGB(255, 210, 60)),
			Material = Enum.Material.Neon,
		}, stand)
		trophy = spawnModel("trophy", stand, base * CFrame.new(0, 1.3 * S, 0), 3.6 * S)
		if not trophy then
			stand:Destroy()
		end
	end
end

if built.track then
	setPieces()
	-- scenery round the circuit, clear of the road, the landmarks and the trophy
	local groundY = math.huge
	for _, p in Track.points do
		groundY = math.min(groundY, p.Y)
	end
	local taken = {}
	local marks = world:FindFirstChild("Landmarks")
	for _, m in if marks then marks:GetChildren() else {} do
		if m:IsA("Model") then
			table.insert(taken, { pos = m:GetPivot().Position, r = 18 * S })
		end
	end
	if trophy then
		table.insert(taken, { pos = trophy:GetPivot().Position, r = 6 * S })
	end
	Scenery.build(world, groundY - 3, taken)
end

----------------------------------------------------------------------------------------------------------------
-- karts, riders and their classes

type Kart = {
	index: number,
	name: string,
	color: Color3,
	kind: string,
	gear: Color3,
	cooldownMax: number,
	model: Model,
	root: BasePart,
	glow: BasePart?,
	aura: BasePart?,
	highlight: Highlight?,
	dist: number,
	lat: number,
	latVel: number,
	speed: number,
	steer: number,
	throttle: number,
	cool: number,
	dash: number,
	small: number,
	size: number,
	scaled: number,
	stun: number,
	spin: number,
	flash: number,
	lane: number,
	pace: number,
	wander: number,
	owner: Player?,
	finished: number?,
	bumpedBy: any,
}

local KC = Config.karts or {}
local RC = Config.riders or {}
local CC = Config.combat or {}
local TOP = (KC.topSpeed or 26) * S
local ACCEL = (KC.accel or 9) * S
local STEER = (KC.steer or 9) * S
local KNOCK = (CC.knock or 7) * S
local SLOW = math.clamp(CC.slow or 0.45, 0.1, 0.95) -- the share of its speed a hit kart keeps
local karts: { Kart } = {}
local kartFolder = make("Folder", { Name = "Karts" }, workspace)
local fxFolder = make("Folder", { Name = "Fx" }, workspace)

-- the four classes (same numbers as the Unity game); Config.riders.classes can override cooldowns and colours
local DASH_TIME, DASH_BOOST, SMALL_TIME, SMALL_BOOST, SMALL_SCALE = 0.7, 1.55, 4, 1.3, 0.55
local SHOT_RANGE, SHOT_RADIUS, THROW_SPEED, THROW_LIFE = 150 * S, 1.8 * S, 22 * S, 2.2
local CLASSES = {
	{ kind = "volt", name = "Volt", cooldown = 4, color = "#3cd6ff" },
	{ kind = "sniper", name = "Sniper", cooldown = 10, color = "#ff3c5a" },
	{ kind = "shrink", name = "Shrink", cooldown = 9, color = "#c45cff" },
	{ kind = "thrower", name = "Thrower", cooldown = 3, color = "#ffb23c" },
}
if type(RC.classes) == "table" and #RC.classes > 0 then
	local list = {}
	for _, c in RC.classes do
		for _, d in CLASSES do
			if type(c) == "table" and c.kind == d.kind then
				table.insert(list, {
					kind = d.kind,
					name = if type(c.name) == "string" and c.name ~= "" then c.name else d.name,
					cooldown = math.clamp(tonumber(c.cooldown) or d.cooldown, 0.5, 30),
					color = if type(c.color) == "string" and c.color ~= "" then c.color else d.color,
				})
			end
		end
	end
	if #list > 0 then
		CLASSES = list
	end
end

local function classOf(kind: string)
	for _, c in CLASSES do
		if c.kind == kind then
			return c
		end
	end
	return CLASSES[1]
end

-- kart 1 (the first player to join) drives riders.player; the others go round the class list
local function classFor(i: number)
	if i == 1 then
		return classOf(if type(RC.player) == "string" then RC.player else "sniper")
	end
	return CLASSES[(i - 1) % #CLASSES + 1]
end

-- the gear that shows a rider's class: volt a coil pack and charged hands, sniper a scoped rifle and goggles,
-- shrink a potion and a propeller cap, thrower a satchel and an item in hand
local function classGear(model: Model, kind: string, gear: Color3, h: number): { BasePart }
	local out = {}
	local metal = Color3.fromRGB(56, 56, 66)
	local top = 3.4 + 1.75 * h
	local function add(name: string, size: Vector3, at: CFrame, color: Color3, material: Enum.Material?, shape: Enum.PartType?)
		local p = make("Part", { Name = name, Size = size * h, Color = color, Material = material or Enum.Material.SmoothPlastic }, model)
		if shape then
			p.Shape = shape
		end
		p.CFrame = at
		table.insert(out, p)
		return p
	end
	local up = CFrame.Angles(0, 0, math.rad(90)) -- a cylinder standing up
	local along = CFrame.Angles(0, math.rad(90), 0) -- a cylinder pointing forward
	local ball = Enum.PartType.Ball
	local cyl = Enum.PartType.Cylinder
	local neon = Enum.Material.Neon
	if kind == "volt" then
		add("Coil", Vector3.new(1.4, 1.1, 1.1), CFrame.new(0, 3.5, 1.45) * up, metal, Enum.Material.Metal, cyl)
		add("Charge", Vector3.one, CFrame.new(0, 4.6, 1.45), gear, neon, ball)
		add("Antenna", Vector3.new(0.15, 0.9, 0.15), CFrame.new(0.4, top + 1, 0.6), metal)
		add("SparkR", Vector3.one * 0.8, CFrame.new(1.4, 2.6, 0.4), gear, neon, ball)
		add("SparkL", Vector3.one * 0.8, CFrame.new(-1.4, 2.7, -0.7), gear, neon, ball)
	elseif kind == "sniper" then
		add("Barrel", Vector3.new(3.2, 0.35, 0.35), CFrame.new(1.4, 2.9, -1.2) * along, metal, Enum.Material.Metal, cyl)
		add("Stock", Vector3.new(0.4, 0.6, 1.2), CFrame.new(1.4, 2.8, 0.6), Color3.fromRGB(110, 70, 38))
		add("Scope", Vector3.new(1, 0.45, 0.45), CFrame.new(1.4, 3.3, -0.6) * along, metal, Enum.Material.Metal, cyl)
		add("Lens", Vector3.one * 0.35, CFrame.new(1.4, 3.3, -1.15), gear, neon, ball)
		add("Goggles", Vector3.new(1.3, 0.3, 0.2), CFrame.new(0, top + 0.1, -0.15), gear, neon)
	elseif kind == "shrink" then
		local flask = add("Flask", Vector3.one * 1.1, CFrame.new(1.4, 2.5, 0.2), Color3.new(1, 1, 1), Enum.Material.Glass, ball)
		flask.Transparency = 0.5
		add("Potion", Vector3.one * 0.8, CFrame.new(1.4, 2.5, 0.2), gear, neon, ball)
		add("Neck", Vector3.new(0.4, 0.35, 0.35), CFrame.new(1.4, 3.15, 0.2) * up, metal, Enum.Material.Metal, cyl)
		add("Mast", Vector3.new(0.15, 0.5, 0.15), CFrame.new(0, top + 1, 0.65), metal)
		add("Propeller", Vector3.new(1.8, 0.1, 0.25), CFrame.new(0, top + 1.3, 0.65), gear, neon)
	else
		add("Satchel", Vector3.new(1.8, 1.5, 0.8), CFrame.new(0, 3.3, 1.45), Color3.fromRGB(115, 77, 41))
		add("Spare", Vector3.one * 0.7, CFrame.new(0.4, 4.2, 1.45), gear, nil, ball)
		add("Item", Vector3.one, CFrame.new(1.4, 2.5, 0.4), gear, nil, ball)
	end
	return out
end

-- where the rider sits in the generated kart: Config.models.kart.seat holds the seat height (share of the kart's
-- height) and its distance behind the front (share of its length), found from the model's vertices when the place
-- was written. The kart faces -Z.
local function seatIn(shell: Model): CFrame?
	local spec = MC.kart
	local seat = type(spec) == "table" and spec.seat or nil
	if type(seat) ~= "table" or not tonumber(seat.y) or not tonumber(seat.back) then
		return nil
	end
	local lo, hi = Vector3.one * math.huge, -Vector3.one * math.huge
	for _, p in shell:GetDescendants() do
		if p:IsA("BasePart") then
			for _, c in { Vector3.new(-1, -1, -1), Vector3.new(-1, -1, 1), Vector3.new(-1, 1, -1), Vector3.new(-1, 1, 1), Vector3.new(1, -1, -1), Vector3.new(1, -1, 1), Vector3.new(1, 1, -1), Vector3.new(1, 1, 1) } do
				local w = p.CFrame:PointToWorldSpace(p.Size * c / 2)
				lo, hi = lo:Min(w), hi:Max(w)
			end
		end
	end
	if lo.X == math.huge then
		return nil
	end
	local size = hi - lo
	local len = math.max(size.X, size.Z)
	return CFrame.new((lo.X + hi.X) / 2, lo.Y + size.Y * seat.y - 0.04 * len, lo.Z + size.Z * seat.back - 0.05 * len)
end

local function buildKart(i: number): Kart
	local colors = KC.colors or {}
	local names = KC.names or {}
	local color = hex(colors[(i - 1) % math.max(1, #colors) + 1], Color3.fromHSV((i * 0.17) % 1, 0.7, 0.9))
	local name = names[i] or ("Kart " .. i)
	local cls = classFor(i)
	local gear = hex(cls.color, color)
	local model = make("Model", { Name = name }, nil)
	model:SetAttribute("Class", cls.kind)
	local root = make("Part", { Name = "Root", Size = Vector3.new(1, 1, 1), Transparency = 1 }, model)
	model.PrimaryPart = root
	local function at(className: string, props: { [string]: any }, offset: CFrame): BasePart
		local p = make(className, props, model)
		p.CFrame = offset
		return p
	end
	local body = {
		at("Part", { Name = "Body", Size = Vector3.new(4, 1.2, 6), Color = color, Material = Enum.Material.SmoothPlastic }, CFrame.new(0, 1.3, 0)),
		at("WedgePart", { Name = "Nose", Size = Vector3.new(3.6, 0.9, 1.8), Color = color, Material = Enum.Material.SmoothPlastic }, CFrame.new(0, 1.15, -3.9)),
		at("Part", { Name = "Spoiler", Size = Vector3.new(4.4, 0.25, 1.1), Color = Color3.fromRGB(30, 30, 34) }, CFrame.new(0, 2.7, 2.8)),
		at("Part", { Name = "Seat", Size = Vector3.new(2.2, 1.4, 1.6), Color = Color3.fromRGB(30, 30, 34) }, CFrame.new(0, 2.2, 0.9)),
	}
	-- the generated kart body replaces the part body (the wheels stay: the model has none)
	local riderAt = CFrame.new(0, 1.9, 0.5)
	local shell = spawnModel("kart", model, CFrame.new(0, 0.5, 0), 7.8)
	if shell then
		for _, p in body do
			p:Destroy()
		end
		riderAt = seatIn(shell) or riderAt
	end
	for _, w in { { -2.3, -2 }, { 2.3, -2 }, { -2.3, 2 }, { 2.3, 2 } } do
		local wheel = at("Part", { Name = "Wheel", Shape = Enum.PartType.Cylinder, Size = Vector3.new(1, 1.7, 1.7), Color = Color3.fromRGB(22, 22, 24) }, CFrame.new(w[1], 0.85, w[2]))
		CollectionService:AddTag(wheel, "Wheel")
	end
	local glow = at("Part", { Name = "HoverGlow", Size = Vector3.new(3.6, 0.15, 5.4), Color = RAIL, Material = Enum.Material.Neon, Transparency = 1 }, CFrame.new(0, 0.35, 0))
	local aura = at("Part", { Name = "Aura", Size = Vector3.new(5.4, 3.2, 8.2), Color = gear, Material = Enum.Material.ForceField, Transparency = 1, CastShadow = false }, CFrame.new(0, 1.9, 0))
	if built.riders then
		local skin = hex(RC.skin, Color3.fromRGB(241, 194, 125))
		local h = math.clamp(RC.height or 1, 0.7, 1.4)
		local parts = {
			at("Part", { Name = "Torso", Size = Vector3.new(2, 2, 1) * h, Color = color:Lerp(Color3.new(1, 1, 1), 0.2) }, CFrame.new(0, 3.4, 0.6)),
			at("Part", { Name = "Helmet", Shape = Enum.PartType.Ball, Size = Vector3.new(1.55, 1.55, 1.55) * h, Color = color, Transparency = 0.15 }, CFrame.new(0, 3.55 + 1.75 * h, 0.65)),
			at("Part", { Name = "LeftArm", Size = Vector3.new(0.6, 1.8, 0.6) * h, Color = skin }, CFrame.new(-1.4, 3.2, -0.2) * CFrame.Angles(math.rad(-50), 0, 0)),
			at("Part", { Name = "RightArm", Size = Vector3.new(0.6, 1.8, 0.6) * h, Color = skin }, CFrame.new(1.4, 3.6, 0.4)),
		}
		local head = at("Part", { Name = "Head", Shape = Enum.PartType.Ball, Size = Vector3.new(1.4, 1.4, 1.4) * h, Color = skin }, CFrame.new(0, 3.4 + 1.75 * h, 0.6))
		for _, p in classGear(model, cls.kind, gear, h) do
			table.insert(parts, p)
		end
		-- the class's generated rider replaces the part rider; the head stays (invisible) to carry the name tag
		if spawnModel("rider." .. cls.kind, model, riderAt, 4.4 * h) then
			for _, p in parts do
				p:Destroy()
			end
			head.Transparency = 1
		end
		local tag = make("BillboardGui", { Size = UDim2.fromOffset(160, 34), StudsOffset = Vector3.new(0, 2.2, 0), AlwaysOnTop = false, MaxDistance = 220 }, head)
		make("TextLabel", {
			Size = UDim2.fromScale(1, 1),
			BackgroundTransparency = 1,
			Text = name,
			TextColor3 = Color3.new(1, 1, 1),
			TextStrokeTransparency = 0.3,
			TextScaled = true,
			Font = Enum.Font.GothamBold,
		}, tag)
	end
	local highlight = make("Highlight", {
		Enabled = false,
		FillColor = hex(CC.hitColor, Color3.fromRGB(255, 210, 60)),
		FillTransparency = 0.35,
		OutlineColor = Color3.new(1, 1, 1),
	}, model)
	model.Parent = kartFolder
	return {
		index = i,
		name = name,
		color = color,
		kind = cls.kind,
		gear = gear,
		cooldownMax = cls.cooldown,
		model = model,
		root = root,
		glow = glow,
		aura = aura,
		highlight = highlight,
		dist = 0,
		lat = 0,
		latVel = 0,
		speed = 0,
		steer = 0,
		throttle = 0,
		cool = 0,
		dash = 0,
		small = 0,
		size = 1,
		scaled = 1,
		stun = 0,
		spin = 0,
		flash = 0,
		lane = 0,
		pace = 1,
		wander = math.random() * 10,
		owner = nil,
		finished = nil,
		bumpedBy = nil,
	}
end

if built.karts then
	for i = 1, math.clamp(KC.count or 6, 1, 12) do
		table.insert(karts, buildKart(i))
	end
end

----------------------------------------------------------------------------------------------------------------
-- race state

local laps = math.max(1, Config.laps or 2)
local phase = "countdown"
local clock = 3
local order: { Kart } = {}

type Item = { owner: Kart, dist: number, lat: number, speed: number, life: number, ball: BasePart, band: BasePart }
local items: { Item } = {}

local function grid()
	order = {}
	for _, it in items do
		it.ball:Destroy()
		it.band:Destroy()
	end
	table.clear(items)
	for i, k in karts do
		local row = (i - 1) // 2
		k.dist = -(row + 1) * 14
		k.lat = (if i % 2 == 1 then -1 else 1) * HW * 0.4
		k.speed, k.latVel, k.cool, k.flash, k.stun, k.spin = 0, 0, 0, 0, 0, 0
		k.dash, k.small, k.size = 0, 0, 1
		k.bumpedBy = nil
		k.finished = nil
		k.lane = (math.random() * 2 - 1) * HW * 0.5
		k.pace = 0.9 + math.random() * 0.08
	end
	phase, clock = "countdown", 3
end

local function lapOf(k: Kart): number
	return math.clamp(math.floor(k.dist / L) + 1, 1, laps)
end

local function feed(text: string)
	FeedEvent:FireAllClients(text)
end

----------------------------------------------------------------------------------------------------------------
-- attacks: every landed attack goes through land(), which writes the hit feed and the per-class counts
-- (attributes Uses_<class> and Hits_<class> on workspace.Karts; for shrink, hits are squashes)

local uses: { [string]: number } = {}
local hits: { [string]: number } = {}

local function count(t: { [string]: number }, kind: string, attr: string)
	t[kind] = (t[kind] or 0) + 1
	kartFolder:SetAttribute(attr .. "_" .. kind, t[kind])
end

local function fx(name: string, size: Vector3, cf: CFrame, color: Color3, shape: Enum.PartType?): BasePart
	local p = make("Part", { Name = name, Size = size, CFrame = cf, Color = color, Material = Enum.Material.Neon, CastShadow = false, CanQuery = false, CanTouch = false }, fxFolder)
	if shape then
		p.Shape = shape
	end
	return p
end

local function burst(at: Vector3, color: Color3)
	local p = fx("HitFx", Vector3.one * 2, CFrame.new(at), color, Enum.PartType.Ball)
	TweenService:Create(p, TweenInfo.new(0.35, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { Size = Vector3.one * 9, Transparency = 1 }):Play()
	Debris:AddItem(p, 0.4)
end

local function beam(a: Vector3, b: Vector3, color: Color3, width: number, life: number)
	local len = (b - a).Magnitude
	if len < 0.1 then
		return
	end
	local p = fx("Beam", Vector3.new(width, width, len), CFrame.lookAt((a + b) / 2, b), color)
	TweenService:Create(p, TweenInfo.new(life), { Size = Vector3.new(0.05, 0.05, len), Transparency = 1 }):Play()
	Debris:AddItem(p, life + 0.05)
end

-- a jagged electric bolt in three pieces
local function bolt(a: Vector3, b: Vector3, color: Color3)
	local prev = a
	for s = 1, 3 do
		local q = if s == 3 then b else a:Lerp(b, s / 3) + Vector3.new(math.random() - 0.5, math.random() - 0.5, math.random() - 0.5) * 3
		beam(prev, q, color, 0.4, 0.3)
		prev = q
	end
end

local function upOf(k: Kart, h: number): Vector3
	return k.root.Position + k.root.CFrame.UpVector * h
end

local function land(by: Kart, target: Kart, kind: string, knock: number, keep: number, stun: number, verb: string, color: Color3)
	target.speed *= keep
	target.latVel += knock
	target.stun = stun
	target.flash = 0.35
	target.dash = 0
	burst(upOf(target, 3.6), color)
	count(hits, kind, "Hits")
	feed(string.format("%s %s %s!", by.name, verb, target.name))
end

local function side(by: Kart, target: Kart): number
	return if target.lat - by.lat + 0.001 >= 0 then 1 else -1
end

--- the closest kart ahead in track space, between min and max metres, within lat metres sideways
local function ahead(k: Kart, min: number, max: number, lat: number): Kart?
	local best, bd = nil, max * S
	for _, o in karts do
		if o ~= k and o.stun <= 0 and not o.finished then
			local ds = o.dist - k.dist
			if ds >= min * S and ds < bd and math.abs(o.lat - k.lat) < lat * S then
				best, bd = o, ds
			end
		end
	end
	return best
end

local function nearest(k: Kart): number
	local best = math.huge
	for _, o in karts do
		if o ~= k then
			best = math.min(best, Vector2.new(o.dist - k.dist, o.lat - k.lat).Magnitude / S)
		end
	end
	return best
end

local function chance(dt: number, rate: number): boolean
	return math.random() < (CC.aiAggression or 0.6) * dt * rate
end

local function used(k: Kart)
	k.cool = k.cooldownMax
	count(uses, k.kind, "Uses")
end

local function dash(k: Kart)
	used(k)
	k.dash = DASH_TIME
	burst(upOf(k, 1.8), k.gear)
end

local function shrink(k: Kart)
	used(k)
	k.small = SMALL_TIME
	burst(upOf(k, 2.4), k.gear)
end

local function throw(k: Kart)
	used(k)
	local ball = fx("Item", Vector3.one * 1.65, k.root.CFrame, k.gear, Enum.PartType.Ball)
	ball.Material = Enum.Material.SmoothPlastic
	local band = fx("Band", Vector3.new(3.75, 0.75, 0.75), k.root.CFrame, k.gear)
	table.insert(items, { owner = k, dist = k.dist + 1.6 * S, lat = k.lat, speed = k.speed + THROW_SPEED, life = THROW_LIFE, ball = ball, band = band })
end

--- the kart nearest the aim ray's origin within SHOT_RADIUS of the ray
local function underAim(k: Kart, origin: Vector3, dir: Vector3): Kart?
	local best, bt = nil, SHOT_RANGE
	for _, o in karts do
		if o ~= k and not o.finished then
			local v = upOf(o, 2.7) - origin
			local t = v:Dot(dir)
			if t > 0 and t < bt and (v - dir * t).Magnitude < SHOT_RADIUS then
				best, bt = o, t
			end
		end
	end
	return best
end

--- fire the sniper beam: target is the kart hit (nil for a miss); a missed AI shot goes past aimedAt
local function shoot(k: Kart, target: Kart?, aimedAt: Kart?, origin: Vector3?, dir: Vector3?)
	used(k)
	local from = (k.root.CFrame * CFrame.new(1.4 * k.size, 2.9 * k.size, -2.9 * k.size)).Position
	local to
	if target then
		to = upOf(target, 2.7)
	elseif aimedAt then
		to = upOf(aimedAt, 7.5) + aimedAt.root.CFrame.RightVector * (if math.random() < 0.5 then -9 else 9)
	elseif origin and dir then
		to = origin + dir * SHOT_RANGE
	else
		to = from + k.root.CFrame.LookVector * SHOT_RANGE
	end
	beam(from, to, k.gear, 0.6, 0.35)
	if target then
		land(k, target, "sniper", KNOCK * 0.5 * side(k, target), SLOW * 0.75, 1.0, "sniped", k.gear)
	end
end

----------------------------------------------------------------------------------------------------------------
-- players

type Input = { throttle: number, steer: number, attack: boolean, origin: Vector3?, dir: Vector3? }
local inputs: { [Player]: Input } = {}

local function assign(player: Player)
	for _, k in karts do
		if not k.owner then
			k.owner = player
			k.model:SetAttribute("Owner", player.UserId)
			player:SetAttribute("Kart", k.name)
			player:SetAttribute("Class", k.kind)
			return
		end
	end
end

Players.PlayerAdded:Connect(assign)
for _, p in Players:GetPlayers() do
	assign(p)
end
Players.PlayerRemoving:Connect(function(player)
	inputs[player] = nil
	for _, k in karts do
		if k.owner == player then
			k.owner = nil
			k.model:SetAttribute("Owner", nil)
		end
	end
end)

local function finite(v: Vector3): boolean
	return v.X == v.X and v.Y == v.Y and v.Z == v.Z and math.abs(v.X) < 1e6 and math.abs(v.Y) < 1e6 and math.abs(v.Z) < 1e6
end

-- throttle and steer in -1..1, attack once per press; a sniper also sends its aim ray (camera through the mouse)
Drive.OnServerEvent:Connect(function(player, throttle, steer, attack, origin, dir)
	if type(throttle) ~= "number" or type(steer) ~= "number" then
		return
	end
	if throttle ~= throttle or steer ~= steer then
		return
	end
	local prev = inputs[player]
	local input: Input = {
		throttle = math.clamp(throttle, -1, 1),
		steer = math.clamp(steer, -1, 1),
		attack = attack == true or (prev ~= nil and prev.attack),
	}
	if typeof(origin) == "Vector3" and typeof(dir) == "Vector3" and finite(origin) and finite(dir) and dir.Magnitude > 0.5 then
		-- the ray must start near the player's own kart (the chase camera)
		for _, k in karts do
			if k.owner == player and (origin - k.root.Position).Magnitude < 120 then
				input.origin, input.dir = origin, dir.Unit
			end
		end
	end
	inputs[player] = input
end)

----------------------------------------------------------------------------------------------------------------
-- the loop

local function aiDrive(k: Kart, dt: number)
	k.wander += dt
	local target = k.lane + math.sin(k.wander * 0.7 + k.index) * HW * 0.25
	k.steer = math.clamp((target - k.lat) / 8, -1, 1)
	k.throttle = 1
end

-- before the karts move: who attacks (players press, AI riders follow simple rules, throwers throw on their own)
local function decide(dt: number)
	local on = built.combat and phase == "race" and clock >= 3 -- let the pack spread out first
	for _, k in karts do
		local input = if k.owner then inputs[k.owner] else nil
		local want = input ~= nil and input.attack
		if input then
			input.attack = false
		end
		if not on or k.finished or k.stun > 0 then
			continue
		end
		local human = k.owner ~= nil
		if not human then
			if k.dash > 0 then
				-- an AI volt steers into whoever it is dashing at
				local t = ahead(k, 0, 20, 4)
				if t then
					k.steer = math.clamp((t.lat - k.lat) / S * 0.6, -1, 1)
				end
				k.throttle = 1
			else
				-- a shrunken kart just ahead is fair game: AI riders try to touch it
				local t = ahead(k, 0, 14, 5)
				if t and t.small > 0 then
					k.steer = math.clamp((t.lat - k.lat) / S * 0.5, -1, 1)
				end
			end
		end
		if k.cool > 0 then
			continue
		end
		if k.kind == "volt" then
			local go = if human then want else ahead(k, 3, 16, 3) ~= nil and chance(dt, 3)
			if go then
				dash(k)
			end
		elseif k.kind == "sniper" then
			if human then
				if want then
					local origin = if input and input.origin then input.origin else upOf(k, 3)
					local dir = if input and input.dir then input.dir else k.root.CFrame.LookVector
					shoot(k, underAim(k, origin, dir), nil, origin, dir)
				end
			else
				local t = ahead(k, 8, 70, 99)
				if t and chance(dt, 1.5) then
					shoot(k, if math.random() < 0.7 then t else nil, t, nil, nil)
				end
			end
		elseif k.kind == "shrink" then
			local go = if human then want else nearest(k) > 6 and chance(dt, 0.6)
			if go then
				shrink(k)
			end
		else
			throw(k) -- on its own, whenever the cooldown is up
		end
	end
end

-- after the karts move: volt zaps, shrink squashes, thrown items
local function resolve(dt: number)
	-- volt: zap every kart the dash runs into (a zapped kart is stunned, so once per dash)
	for _, k in karts do
		if k.dash <= 0 then
			continue
		end
		for _, o in karts do
			if o ~= k and o.stun <= 0 and not o.finished and math.abs(o.dist - k.dist) < 7 and math.abs(o.lat - k.lat) < 5 then
				bolt(upOf(k, 3.6), upOf(o, 3), k.gear)
				land(k, o, "volt", KNOCK * side(k, o), SLOW, 0.8, "zapped", k.gear)
			end
		end
	end
	-- shrink: a touch while small squashes it flat
	for _, k in karts do
		if k.small > 0 and k.bumpedBy and k.stun <= 0 then
			k.small, k.size = 0, 1
			land(k.bumpedBy, k, "shrink", 0, 0.25, 1.2, "squashed", k.gear)
		end
		k.bumpedBy = nil
	end
	-- thrower: items fly down the track and hit the first kart in their lane
	for i = #items, 1, -1 do
		local it = items[i]
		it.life -= dt
		it.dist += it.speed * dt
		local victim: Kart? = nil
		for _, o in karts do
			if o ~= it.owner and not o.finished and o.stun <= 0 and math.abs(o.dist - it.dist) < 5.4 and math.abs(o.lat - it.lat) < 4.2 then
				victim = o
				break
			end
		end
		if victim then
			land(it.owner, victim, "thrower", KNOCK * 0.6 * side(it.owner, victim), SLOW + (1 - SLOW) * 0.3, 0.6, "beaned", it.owner.gear)
		end
		if victim or it.life <= 0 then
			it.ball:Destroy()
			it.band:Destroy()
			table.remove(items, i)
			continue
		end
		local age = THROW_LIFE - it.life
		local cf = Track.poseAt(it.dist, it.lat) * CFrame.new(0, (1.1 + math.sin(math.min(age * 3, math.pi)) * 0.8) * S, 0) * CFrame.Angles(-age * 4 * math.pi, 0, 0)
		it.ball.CFrame = cf
		it.band.CFrame = cf
	end
end

local function place(k: Kart, now: number)
	local hover = Track.hover(k.dist)
	local lift = hover * (0.8 + math.sin(now * 6 + k.index) * 0.25)
	local bob = if k.stun > 0 then math.abs(math.sin(k.stun * 12)) * 0.75 else 0
	local heading = if k.stun > 0 then k.spin else k.steer * 10
	if math.abs(k.size - k.scaled) > 0.005 then
		k.model:ScaleTo(k.size)
		k.scaled = k.size
	end
	local cf = Track.poseAt(k.dist, k.lat, heading) * CFrame.new(0, lift + bob, 0)
	k.model:PivotTo(cf)
	if k.glow then
		k.glow.Transparency = 1 - hover * 0.75
	end
	if k.aura then
		k.aura.Transparency = if k.dash > 0 or k.small > 0 then 0.55 + 0.15 * math.sin(now * (if k.dash > 0 then 60 else 8)) else 1
	end
	if k.highlight then
		k.highlight.Enabled = k.flash > 0
	end
end

local function step(dt: number)
	if phase == "countdown" then
		clock -= dt
		if clock <= 0 then
			phase, clock = "race", 0
		end
	elseif phase == "race" then
		clock += dt
	elseif phase == "finished" then
		clock -= dt
		if clock <= 0 then
			grid()
		end
	end

	for _, k in karts do
		k.cool = math.max(0, k.cool - dt)
		k.flash = math.max(0, k.flash - dt)
		k.dash = math.max(0, k.dash - dt)
		k.small = math.max(0, k.small - dt)
		if k.stun > 0 then
			k.stun = math.max(0, k.stun - dt)
			k.spin = if k.stun > 0 then k.spin + dt * 720 else 0
		end
		local target = if k.small > 0 then SMALL_SCALE else 1
		k.size = if k.size < target then math.min(target, k.size + dt * 3) else math.max(target, k.size - dt * 3)
		if k.owner then
			local i = inputs[k.owner]
			k.throttle = if i then i.throttle else 0
			k.steer = if i then i.steer else 0
		else
			aiDrive(k, dt)
		end
	end

	decide(dt)

	for _, k in karts do
		if phase ~= "race" or k.finished then
			k.throttle = if k.finished then 0.3 else 0
			if phase == "countdown" then
				k.speed = 0
			end
		end
		local hover = Track.hover(k.dist)
		local boost = if k.dash > 0 then DASH_BOOST elseif k.small > 0 then SMALL_BOOST else 1
		local top = TOP * (if k.owner then 1 else k.pace) * (1 + hover * 0.15) * boost
		if k.stun > 0 then
			k.speed = math.max(0, k.speed - 6 * S * dt)
		elseif k.throttle > 0 then
			k.speed += ACCEL * k.throttle * dt
		elseif k.throttle < 0 then
			k.speed += ACCEL * 1.8 * k.throttle * dt
		else
			k.speed -= k.speed * 0.6 * dt
		end
		if k.dash > 0 and k.stun <= 0 then
			k.speed = math.min(top, k.speed + ACCEL * 3 * dt) -- the electric dash kicks in at once
		end
		if k.speed > top then
			k.speed = math.max(top, k.speed - ACCEL * 1.5 * dt)
		end
		k.speed = math.max(k.speed, -TOP * 0.25)
		local grip = math.clamp(math.abs(k.speed) / TOP, 0.25, 1)
		local steer = if k.stun > 0 then 0 else k.steer
		k.lat += (steer * STEER * grip + k.latVel) * dt
		k.latVel -= k.latVel * math.min(1, 5 * dt)
		local edge = HW - 2.5
		if math.abs(k.lat) > edge then
			k.lat = math.clamp(k.lat, -edge, edge)
			k.latVel = -k.latVel * 0.4
			k.speed *= 1 - 0.8 * dt
		end
		k.dist += k.speed * dt
		if phase == "race" and not k.finished and k.dist >= laps * L then
			k.finished = clock
			table.insert(order, k)
			feed(string.format("%s finished %s (%.1f s)", k.name, if #order == 1 then "first" else "#" .. #order, clock))
		end
	end

	-- karts side by side push each other apart; a small (shrink) rider gets squashed by the touch
	for a = 1, #karts do
		for b = a + 1, #karts do
			local ka, kb = karts[a], karts[b]
			if math.abs(ka.dist - kb.dist) < 6 and math.abs(ka.lat - kb.lat) < 4.4 then
				local push = (4.4 - math.abs(ka.lat - kb.lat)) * 0.5
				local s = if ka.lat >= kb.lat then 1 else -1
				ka.lat += s * push
				kb.lat -= s * push
				ka.bumpedBy, kb.bumpedBy = kb, ka
			end
		end
	end

	if built.combat then
		resolve(dt)
	end

	if phase == "race" and #karts > 0 then
		local everyone = #order == #karts
		local humansDone = true
		local anyHuman = false
		for _, k in karts do
			if k.owner then
				anyHuman = true
				humansDone = humansDone and k.finished ~= nil
			end
		end
		local timeUp = #order > 0 and clock - (order[1].finished or clock) > 20
		if everyone or (anyHuman and humansDone) or timeUp then
			phase, clock = "finished", 8
		end
	end

	local now = os.clock()
	for _, k in karts do
		place(k, now)
	end
	if trophy then
		trophy:PivotTo(trophy:GetPivot() * CFrame.Angles(0, dt * 0.8, 0))
	end
end

local sorted: { Kart } = {}
local function standings(): { Kart }
	table.clear(sorted)
	for _, k in karts do
		table.insert(sorted, k)
	end
	table.sort(sorted, function(a, b)
		if a.finished and b.finished then
			return a.finished < b.finished
		end
		if a.finished or b.finished then
			return a.finished ~= nil
		end
		return a.dist > b.dist
	end)
	return sorted
end

grid()
local sendEvery, sendT = 0.1, 0
RunService.Heartbeat:Connect(function(dt)
	dt = math.min(dt, 0.1)
	step(dt)
	sendT += dt
	if sendT >= sendEvery then
		sendT = 0
		local list = {}
		for place_, k in standings() do
			table.insert(list, {
				n = k.name,
				c = k.color:ToHex(),
				d = k.dist,
				l = k.lat,
				lap = lapOf(k),
				pl = place_,
				v = k.speed / S,
				o = if k.owner then k.owner.UserId else 0,
				f = k.finished,
				cd = k.cool,
				k = k.kind,
				cm = k.cooldownMax,
				a = k.dash > 0 or k.small > 0,
				g = k.gear:ToHex(),
			})
		end
		StateEvent:FireAllClients({ phase = phase, clock = clock, laps = laps, karts = list })
	end
end)

----------------------------------------------------------------------------------------------------------------
-- look and music

local function applyLook()
	Look.apply(Flags.night == true or look.night == true, Flags.realistic == true or look.realistic == true, look)
	for _, r in CollectionService:GetTagged("HoverRail") do
		(r :: BasePart).Material = Enum.Material.Neon
	end
end
applyLook()

if type(Flags.musicId) == "string" and Flags.musicId ~= "" then
	make("Sound", {
		Name = "RaceMusic",
		SoundId = "rbxassetid://" .. Flags.musicId:gsub("%D", ""),
		Looped = true,
		Volume = 0.45,
		Playing = true,
	}, SoundService)
end

----------------------------------------------------------------------------------------------------------------
-- crossplay: post our karts to the relay, draw the other engine's karts as ghosts

local ghosts: { [string]: { model: Model, p: number, l: number, h: number, v: number, seen: number } } = {}
local ghostFolder = make("Folder", { Name = "Ghosts" }, workspace)

local function ghostModel(name: string, color: Color3): Model
	local m = make("Model", { Name = "Ghost " .. name }, nil)
	local root = make("Part", { Name = "Root", Size = Vector3.new(1, 1, 1), Transparency = 1 }, m)
	m.PrimaryPart = root
	local body = make("Part", { Name = "Body", Size = Vector3.new(4, 1.6, 6), Color = color, Material = Enum.Material.ForceField, Transparency = 0.2 }, m)
	body.CFrame = CFrame.new(0, 1.4, 0)
	local shell = make("Part", { Name = "Rider", Size = Vector3.new(2, 2.6, 1.2), Color = color, Material = Enum.Material.Neon, Transparency = 0.55 }, m)
	shell.CFrame = CFrame.new(0, 3.4, 0.6)
	local tag = make("BillboardGui", { Size = UDim2.fromOffset(220, 36), StudsOffset = Vector3.new(0, 3.2, 0), AlwaysOnTop = true }, shell)
	make("TextLabel", {
		Size = UDim2.fromScale(1, 1),
		BackgroundTransparency = 1,
		Text = name .. " [Unity]",
		TextColor3 = color:Lerp(Color3.new(1, 1, 1), 0.5),
		TextStrokeTransparency = 0.2,
		TextScaled = true,
		Font = Enum.Font.GothamBold,
	}, tag)
	m.Parent = ghostFolder
	return m
end

local function relayLoop(url: string)
	local httpUrl = url:gsub("^ws", "http")
	while true do
		local states = {}
		for _, k in karts do
			if k.owner or #states == 0 then
				table.insert(states, {
					id = if k.owner then "rbx-" .. k.owner.UserId else "rbx-ai-" .. k.index,
					eng = "roblox",
					name = if k.owner then k.owner.DisplayName else k.name,
					c = "#" .. k.color:ToHex(),
					p = (k.dist % L) / L,
					l = k.lat / HW,
					h = k.steer * 10,
					v = k.speed / L,
					lap = lapOf(k),
				})
			end
			if #states >= 8 then
				break
			end
		end
		local ok, res = pcall(function()
			return HttpService:PostAsync(httpUrl, HttpService:JSONEncode({ states = states }), Enum.HttpContentType.ApplicationJson)
		end)
		if ok then
			local decoded = HttpService:JSONDecode(res)
			for _, s in decoded.states or {} do
				if type(s) == "table" and type(s.id) == "string" and s.eng ~= "roblox" and type(s.p) == "number" then
					local g = ghosts[s.id]
					if not g then
						g = { model = ghostModel(tostring(s.name or "Rider"), hex(s.c, RAIL)), p = 0, l = 0, h = 0, v = 0, seen = 0 }
						ghosts[s.id] = g
					end
					g.p, g.l, g.h, g.v, g.seen = s.p, tonumber(s.l) or 0, tonumber(s.h) or 0, tonumber(s.v) or 0, os.clock()
				end
			end
		end
		task.wait(0.2)
	end
end

if Flags.relay == true and type(Flags.relayUrl) == "string" and Flags.relayUrl ~= "" then
	task.spawn(relayLoop, Flags.relayUrl)
	RunService.Heartbeat:Connect(function(dt)
		local now = os.clock()
		for id, g in ghosts do
			if now - g.seen > 3 then
				g.model:Destroy()
				ghosts[id] = nil
			else
				g.p = (g.p + g.v * dt) % 1
				g.model:PivotTo(Track.poseAt(g.p * L, math.clamp(g.l, -1, 1) * HW, g.h))
			end
		end
	end)
end
