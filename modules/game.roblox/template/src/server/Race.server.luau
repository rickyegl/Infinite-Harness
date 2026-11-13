-- The race server. Builds the track from Track.luau (road slabs that follow the loops and twists, kerbs, glowing
-- rails on hover sections, pillars, lamps, the start gantry), then runs the race: karts move in track space
-- (studs along the line, studs from the centre) so they stay glued to the road upside down; players drive with
-- the Drive remote, the rest are AI. Riders swing their weapons at whoever is close; hits slow and shove.
-- With the crossplay flag on it also posts its karts to the relay and shows the other engine's karts as ghosts.
-- Each piece only exists once its part cell has written it (Config.built).

local CollectionService = game:GetService("CollectionService")
local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local SoundService = game:GetService("SoundService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config"))
local Flags = require(Shared:WaitForChild("Flags"))
local Look = require(Shared:WaitForChild("Look"))
local Track = require(Shared:WaitForChild("Track"))

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

	local margin = 140
	make("Part", {
		Name = "Ground",
		Size = Vector3.new(maxX - minX + margin * 2, 2, maxZ - minZ + margin * 2),
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
-- karts and riders

type Kart = {
	index: number,
	name: string,
	color: Color3,
	model: Model,
	root: BasePart,
	weapon: { { part: BasePart, offset: CFrame } },
	glow: BasePart?,
	highlight: Highlight?,
	dist: number,
	lat: number,
	speed: number,
	steer: number,
	throttle: number,
	attack: boolean,
	cool: number,
	swing: number,
	flash: number,
	slowed: number,
	lane: number,
	pace: number,
	wander: number,
	owner: Player?,
	finished: number?,
}

local KC = Config.karts or {}
local RC = Config.riders or {}
local CC = Config.combat or {}
local TOP = (KC.topSpeed or 26) * S
local ACCEL = (KC.accel or 9) * S
local STEER = (KC.steer or 9) * S
local RANGE = (CC.range or 4.5) * S
local karts: { Kart } = {}
local kartFolder = make("Folder", { Name = "Karts" }, workspace)

local function weaponParts(model: Model, root: BasePart, color: Color3): { { part: BasePart, offset: CFrame } }
	local kind = string.lower(RC.weapon or "club")
	local shoulder = CFrame.new(1.4, 3.9, 0.4)
	local out = {}
	local function add(size: Vector3, at: CFrame, c: Color3, shape: Enum.PartType?)
		local p = make("Part", { Name = "Weapon", Size = size, Color = c, Material = Enum.Material.SmoothPlastic }, model)
		if shape then
			p.Shape = shape
		end
		table.insert(out, { part = p, offset = at })
		p.CFrame = root.CFrame * shoulder * at
	end
	local handle = Color3.fromRGB(110, 76, 44)
	if kind == "glove" then
		-- a big boxing glove on a short spring arm
		add(Vector3.new(0.3, 1.6, 0.3), CFrame.new(0, 0.8, 0), Color3.fromRGB(180, 180, 190))
		add(Vector3.new(1.7, 1.7, 1.7), CFrame.new(0, 2.3, 0), Color3.fromRGB(210, 40, 40), Enum.PartType.Ball)
	elseif kind == "noodle" then
		-- a long foam pool noodle in three soft segments
		for s = 0, 2 do
			add(Vector3.new(1.4, 0.7, 0.7), CFrame.new(0, 0.7 + s * 1.3, 0) * CFrame.Angles(0, 0, math.rad(90 + s * 8)), color:Lerp(Color3.new(1, 1, 1), 0.25), Enum.PartType.Cylinder)
		end
	else
		add(Vector3.new(0.4, 2.2, 0.4), CFrame.new(0, 1.1, 0), handle)
		add(Vector3.new(1.1, 1.8, 1.1), CFrame.new(0, 2.8, 0), color, Enum.PartType.Cylinder)
	end
	return out
end

local function buildKart(i: number): Kart
	local colors = KC.colors or {}
	local names = KC.names or {}
	local color = hex(colors[(i - 1) % math.max(1, #colors) + 1], Color3.fromHSV((i * 0.17) % 1, 0.7, 0.9))
	local name = names[i] or ("Kart " .. i)
	local model = make("Model", { Name = name }, nil)
	local root = make("Part", { Name = "Root", Size = Vector3.new(1, 1, 1), Transparency = 1 }, model)
	model.PrimaryPart = root
	local function at(className: string, props: { [string]: any }, offset: CFrame): BasePart
		local p = make(className, props, model)
		p.CFrame = offset
		return p
	end
	at("Part", { Name = "Body", Size = Vector3.new(4, 1.2, 6), Color = color, Material = Enum.Material.SmoothPlastic }, CFrame.new(0, 1.3, 0))
	at("WedgePart", { Name = "Nose", Size = Vector3.new(3.6, 0.9, 1.8), Color = color, Material = Enum.Material.SmoothPlastic }, CFrame.new(0, 1.15, -3.9))
	at("Part", { Name = "Spoiler", Size = Vector3.new(4.4, 0.25, 1.1), Color = Color3.fromRGB(30, 30, 34) }, CFrame.new(0, 2.7, 2.8))
	at("Part", { Name = "Seat", Size = Vector3.new(2.2, 1.4, 1.6), Color = Color3.fromRGB(30, 30, 34) }, CFrame.new(0, 2.2, 0.9))
	for _, w in { { -2.3, -2 }, { 2.3, -2 }, { -2.3, 2 }, { 2.3, 2 } } do
		local wheel = at("Part", { Name = "Wheel", Shape = Enum.PartType.Cylinder, Size = Vector3.new(1, 1.7, 1.7), Color = Color3.fromRGB(22, 22, 24) }, CFrame.new(w[1], 0.85, w[2]))
		CollectionService:AddTag(wheel, "Wheel")
	end
	local glow = at("Part", { Name = "HoverGlow", Size = Vector3.new(3.6, 0.15, 5.4), Color = RAIL, Material = Enum.Material.Neon, Transparency = 1 }, CFrame.new(0, 0.35, 0))
	local weapon = {}
	if built.riders then
		local skin = hex(RC.skin, Color3.fromRGB(241, 194, 125))
		local h = math.clamp(RC.height or 1, 0.7, 1.4)
		at("Part", { Name = "Torso", Size = Vector3.new(2, 2, 1) * h, Color = color:Lerp(Color3.new(1, 1, 1), 0.2) }, CFrame.new(0, 3.4, 0.6))
		local head = at("Part", { Name = "Head", Shape = Enum.PartType.Ball, Size = Vector3.new(1.4, 1.4, 1.4) * h, Color = skin }, CFrame.new(0, 3.4 + 1.75 * h, 0.6))
		at("Part", { Name = "Helmet", Shape = Enum.PartType.Ball, Size = Vector3.new(1.55, 1.55, 1.55) * h, Color = color, Transparency = 0.15 }, CFrame.new(0, 3.55 + 1.75 * h, 0.65))
		at("Part", { Name = "LeftArm", Size = Vector3.new(0.6, 1.8, 0.6) * h, Color = skin }, CFrame.new(-1.4, 3.2, -0.2) * CFrame.Angles(math.rad(-50), 0, 0))
		at("Part", { Name = "RightArm", Size = Vector3.new(0.6, 1.8, 0.6) * h, Color = skin }, CFrame.new(1.4, 3.6, 0.4))
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
		weapon = weaponParts(model, root, color)
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
		model = model,
		root = root,
		weapon = weapon,
		glow = glow,
		highlight = highlight,
		dist = 0,
		lat = 0,
		speed = 0,
		steer = 0,
		throttle = 0,
		attack = false,
		cool = 0,
		swing = 0,
		flash = 0,
		slowed = 0,
		lane = 0,
		pace = 1,
		wander = math.random() * 10,
		owner = nil,
		finished = nil,
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

local function grid()
	order = {}
	for i, k in karts do
		local row = (i - 1) // 2
		k.dist = -(row + 1) * 14
		k.lat = (if i % 2 == 1 then -1 else 1) * HW * 0.4
		k.speed, k.cool, k.swing, k.flash, k.slowed = 0, 0, 0, 0, 0
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

local function hit(by: Kart, target: Kart)
	target.speed *= 1 - math.clamp(CC.slow or 0.45, 0, 0.9)
	target.slowed = 1.2
	local away = if target.lat >= by.lat then 1 else -1
	target.lat = math.clamp(target.lat + away * (CC.knock or 7) * S * 0.25, -HW + 2.5, HW - 2.5)
	target.flash = 0.45
	feed(by.name .. " bonked " .. target.name)
end

local function tryAttack(k: Kart)
	if not built.combat or k.cool > 0 or phase ~= "race" then
		return
	end
	k.cool = CC.cooldown or 1.6
	k.swing = 0.35
	local best, bestD = nil, RANGE
	local p = k.root.Position
	for _, o in karts do
		if o ~= k and not o.finished then
			local d = (o.root.Position - p).Magnitude
			if d < bestD then
				best, bestD = o, d
			end
		end
	end
	if best then
		hit(k, best)
	end
end

----------------------------------------------------------------------------------------------------------------
-- players

local inputs: { [Player]: { throttle: number, steer: number } } = {}

local function assign(player: Player)
	for _, k in karts do
		if not k.owner then
			k.owner = player
			k.model:SetAttribute("Owner", player.UserId)
			player:SetAttribute("Kart", k.name)
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

Drive.OnServerEvent:Connect(function(player, throttle, steer, attack)
	if type(throttle) ~= "number" or type(steer) ~= "number" then
		return
	end
	if throttle ~= throttle or steer ~= steer then
		return
	end
	inputs[player] = { throttle = math.clamp(throttle, -1, 1), steer = math.clamp(steer, -1, 1) }
	if attack == true then
		for _, k in karts do
			if k.owner == player then
				tryAttack(k)
			end
		end
	end
end)

----------------------------------------------------------------------------------------------------------------
-- the loop

local function aiDrive(k: Kart, dt: number)
	k.wander += dt
	local target = k.lane + math.sin(k.wander * 0.7 + k.index) * HW * 0.25
	k.steer = math.clamp((target - k.lat) / 8, -1, 1)
	k.throttle = 1
	if built.combat and k.cool <= 0 then
		for _, o in karts do
			if o ~= k and (o.root.Position - k.root.Position).Magnitude < RANGE * 0.9 then
				if math.random() < (CC.aiAggression or 0.6) * dt * 3 then
					tryAttack(k)
				end
				break
			end
		end
	end
end

local function place(k: Kart, now: number)
	local hover = Track.hover(k.dist)
	local lift = hover * (0.8 + math.sin(now * 6 + k.index) * 0.25)
	local heading = k.steer * 10
	local cf = Track.poseAt(k.dist, k.lat, heading) * CFrame.new(0, lift, 0)
	k.model:PivotTo(cf)
	if k.glow then
		k.glow.Transparency = 1 - hover * 0.75
	end
	local swing = if k.swing > 0 then math.sin((1 - k.swing / 0.35) * math.pi) else 0
	local shoulder = CFrame.new(1.4, 3.9, 0.4) * CFrame.Angles(-math.rad(25) - swing * math.rad(110), 0, -swing * math.rad(40))
	for _, w in k.weapon do
		w.part.CFrame = cf * shoulder * w.offset
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
		k.swing = math.max(0, k.swing - dt)
		k.flash = math.max(0, k.flash - dt)
		k.slowed = math.max(0, k.slowed - dt)
		if k.owner then
			local i = inputs[k.owner]
			k.throttle = if i then i.throttle else 0
			k.steer = if i then i.steer else 0
		else
			aiDrive(k, dt)
		end
		if phase ~= "race" or k.finished then
			k.throttle = if k.finished then 0.3 else 0
			if phase == "countdown" then
				k.speed = 0
			end
		end
		local hover = Track.hover(k.dist)
		local top = TOP * (if k.owner then 1 else k.pace) * (1 + hover * 0.15) * (if k.slowed > 0 then 0.75 else 1)
		if k.throttle > 0 then
			k.speed += ACCEL * k.throttle * dt
		elseif k.throttle < 0 then
			k.speed += ACCEL * 1.8 * k.throttle * dt
		else
			k.speed -= k.speed * 0.6 * dt
		end
		if k.speed > top then
			k.speed = math.max(top, k.speed - ACCEL * 1.5 * dt)
		end
		k.speed = math.max(k.speed, -TOP * 0.25)
		local grip = math.clamp(math.abs(k.speed) / TOP, 0.25, 1)
		k.lat += k.steer * STEER * grip * dt
		local edge = HW - 2.5
		if math.abs(k.lat) > edge then
			k.lat = math.clamp(k.lat, -edge, edge)
			k.speed *= 1 - 0.8 * dt
		end
		k.dist += k.speed * dt
		if phase == "race" and not k.finished and k.dist >= laps * L then
			k.finished = clock
			table.insert(order, k)
			feed(string.format("%s finished %s (%.1f s)", k.name, if #order == 1 then "first" else "#" .. #order, clock))
		end
	end

	-- karts side by side push each other apart
	for a = 1, #karts do
		for b = a + 1, #karts do
			local ka, kb = karts[a], karts[b]
			if math.abs(ka.dist - kb.dist) < 6 and math.abs(ka.lat - kb.lat) < 4.4 then
				local push = (4.4 - math.abs(ka.lat - kb.lat)) * 0.5
				local s = if ka.lat >= kb.lat then 1 else -1
				ka.lat += s * push
				kb.lat -= s * push
			end
		end
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
