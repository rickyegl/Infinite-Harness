-- The player's side: keys (or touch) to the Drive remote, a chase camera that rolls with the road through loops
-- and twists, and the HUD (lap, place, speed, countdown, hit feed, results, minimap, and the rider's class with
-- its cooldown). A sniper aims with a crosshair that follows the mouse: each send carries the ray from the camera
-- through it, and the server picks the kart under it. It also moves the scenery, locally: balloons and islands bob,
-- the clouds and the blimp circle the circuit, and the flags wave. On joining, the player picks a rider class.

local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config"))
local Track = require(Shared:WaitForChild("Track"))
local Race = ReplicatedStorage:WaitForChild("Race")
local Drive = Race:WaitForChild("Drive") :: RemoteEvent
local StateEvent = Race:WaitForChild("State") :: RemoteEvent
local FeedEvent = Race:WaitForChild("Feed") :: RemoteEvent

local player = Players.LocalPlayer
local camera = workspace.CurrentCamera
local hud = Config.hud or {}
local built = Config.built or {}
local accent = Color3.fromHex(hud.accent or "#ffd23c")

----------------------------------------------------------------------------------------------------------------
-- input

local keys: { [Enum.KeyCode]: boolean } = {}
local attackQueued = false
local touchSteer, touching = 0, false
local touchAim: Vector2? = nil

-- the class of the player's rider (set by the server when a kart is handed out)
local function myClass(): string
	return player:GetAttribute("Class") or ""
end

-- where the sniper aims, in viewport pixels (the GUI ignores the top inset, so it is also the crosshair spot)
local function aimPoint(): Vector2
	return touchAim or UserInputService:GetMouseLocation()
end

UserInputService.InputBegan:Connect(function(input, processed)
	if processed then
		return
	end
	if input.UserInputType == Enum.UserInputType.Keyboard or input.UserInputType.Name:find("Gamepad") then
		keys[input.KeyCode] = true
		if input.KeyCode == Enum.KeyCode.Space or input.KeyCode == Enum.KeyCode.F or input.KeyCode == Enum.KeyCode.ButtonX then
			attackQueued = true
		end
	elseif input.UserInputType == Enum.UserInputType.MouseButton1 then
		attackQueued = true
	elseif input.UserInputType == Enum.UserInputType.Touch then
		touching = true
		local w = camera.ViewportSize.X
		touchSteer = math.clamp((input.Position.X - w / 2) / (w / 4), -1, 1)
		if input.Position.Y < camera.ViewportSize.Y * 0.4 then
			attackQueued = true
			touchAim = Vector2.new(input.Position.X, input.Position.Y)
		end
	end
end)
UserInputService.InputEnded:Connect(function(input)
	keys[input.KeyCode] = nil
	if input.UserInputType == Enum.UserInputType.Touch then
		touching, touchSteer = false, 0
	end
end)

local function axis(pos: { Enum.KeyCode }, neg: { Enum.KeyCode }): number
	local v = 0
	for _, k in pos do
		if keys[k] then
			v += 1
			break
		end
	end
	for _, k in neg do
		if keys[k] then
			v -= 1
			break
		end
	end
	return v
end

task.spawn(function()
	while true do
		local throttle = axis({ Enum.KeyCode.W, Enum.KeyCode.Up, Enum.KeyCode.ButtonR2 }, { Enum.KeyCode.S, Enum.KeyCode.Down, Enum.KeyCode.ButtonL2 })
		local steer = axis({ Enum.KeyCode.D, Enum.KeyCode.Right }, { Enum.KeyCode.A, Enum.KeyCode.Left })
		if UserInputService.TouchEnabled and not UserInputService.KeyboardEnabled then
			throttle = 1
			steer = if touching then touchSteer else 0
		end
		if myClass() == "sniper" then
			local p = aimPoint()
			local ray = camera:ViewportPointToRay(p.X, p.Y)
			Drive:FireServer(throttle, steer, attackQueued, ray.Origin, ray.Direction)
		else
			Drive:FireServer(throttle, steer, attackQueued)
		end
		attackQueued = false
		task.wait(1 / 20)
	end
end)

----------------------------------------------------------------------------------------------------------------
-- HUD

local gui = Instance.new("ScreenGui")
gui.Name = "RaceHud"
gui.ResetOnSpawn = false
gui.IgnoreGuiInset = true
gui.Enabled = built.hud ~= false
gui.Parent = player:WaitForChild("PlayerGui")

local function label(props: { [string]: any }, parent: Instance): TextLabel
	local l = Instance.new("TextLabel")
	l.BackgroundTransparency = 1
	l.TextColor3 = Color3.new(1, 1, 1)
	l.TextStrokeTransparency = 0.4
	l.Font = Enum.Font.GothamBlack
	l.TextScaled = true
	for k, v in props do
		(l :: any)[k] = v
	end
	l.Parent = parent
	return l
end

local title = label({ Text = string.upper(hud.title or Config.title or ""), Size = UDim2.fromOffset(360, 34), Position = UDim2.fromOffset(24, 18), TextXAlignment = Enum.TextXAlignment.Left, TextColor3 = accent }, gui)
local lapLabel = label({ Text = "LAP 1/1", Size = UDim2.fromOffset(260, 46), Position = UDim2.fromOffset(24, 56), TextXAlignment = Enum.TextXAlignment.Left }, gui)
local placeLabel = label({ Text = "", Size = UDim2.fromOffset(200, 80), Position = UDim2.new(1, -224, 0, 18), TextXAlignment = Enum.TextXAlignment.Right, TextColor3 = accent }, gui)
local speedLabel = label({ Text = "", Size = UDim2.fromOffset(220, 52), Position = UDim2.new(1, -244, 1, -76), TextXAlignment = Enum.TextXAlignment.Right }, gui)
local bigLabel = label({ Text = "", Size = UDim2.fromScale(0.6, 0.18), Position = UDim2.fromScale(0.2, 0.3), TextColor3 = accent }, gui)
local hint = label({ Text = "W/S drive   A/D steer", Size = UDim2.fromOffset(560, 22), Position = UDim2.new(0.5, -280, 1, -36), Font = Enum.Font.GothamMedium }, gui)
local classLabel = label({ Text = "", Size = UDim2.fromOffset(420, 30), Position = UDim2.new(0.5, -210, 1, -72) }, gui)
title.ZIndex, hint.TextTransparency = 2, 0.3

local HELP = {
	volt = "W/S drive   A/D steer   SPACE electric dash",
	sniper = "W/S drive   A/D steer   MOUSE aim   CLICK shoot",
	shrink = "W/S drive   A/D steer   SPACE shrink (don't get touched)",
	thrower = "W/S drive   A/D steer   items fly forward every 3 s",
}

-- the sniper's crosshair: a ring and a dot that follow the mouse, red over a kart, with the cooldown under it
local cross = Instance.new("Frame")
cross.Name = "Crosshair"
cross.AnchorPoint = Vector2.new(0.5, 0.5)
cross.Size = UDim2.fromOffset(38, 38)
cross.BackgroundTransparency = 1
cross.Visible = false
cross.ZIndex = 5
cross.Parent = gui
local ring = Instance.new("UIStroke")
ring.Thickness = 3
ring.Parent = cross
Instance.new("UICorner", cross).CornerRadius = UDim.new(1, 0)
local pip = Instance.new("Frame")
pip.AnchorPoint = Vector2.new(0.5, 0.5)
pip.Position = UDim2.fromScale(0.5, 0.5)
pip.Size = UDim2.fromOffset(6, 6)
pip.BorderSizePixel = 0
pip.ZIndex = 5
pip.Parent = cross
Instance.new("UICorner", pip).CornerRadius = UDim.new(1, 0)
local crossText = label({ Text = "", Size = UDim2.fromOffset(120, 18), Position = UDim2.new(0.5, -60, 1, 6), Font = Enum.Font.GothamBold, ZIndex = 5 }, cross)

-- the same test the server makes: a kart whose middle is within 1.8 m of the aim ray
local function kartUnderAim(myName: string): boolean
	local folder = workspace:FindFirstChild("Karts")
	if not folder then
		return false
	end
	local p = aimPoint()
	local ray = camera:ViewportPointToRay(p.X, p.Y)
	for _, m in folder:GetChildren() do
		local root = if m:IsA("Model") then m.PrimaryPart else nil
		if root and m.Name ~= myName then
			local v = root.Position + root.CFrame.UpVector * 2.7 - ray.Origin
			local t = v:Dot(ray.Direction)
			if t > 0 and t < 150 * Track.SCALE and (v - ray.Direction * t).Magnitude < 1.8 * Track.SCALE then
				return true
			end
		end
	end
	return false
end

local feedBox = Instance.new("Frame")
feedBox.BackgroundTransparency = 1
feedBox.Size = UDim2.fromOffset(380, 140)
feedBox.Position = UDim2.fromOffset(24, 112)
feedBox.Parent = gui
local feedLayout = Instance.new("UIListLayout")
feedLayout.SortOrder = Enum.SortOrder.LayoutOrder
feedLayout.Parent = feedBox
local feedN = 0
FeedEvent.OnClientEvent:Connect(function(text: string)
	feedN += 1
	local l = label({ Text = text, Size = UDim2.new(1, 0, 0, 24), TextXAlignment = Enum.TextXAlignment.Left, Font = Enum.Font.GothamBold, LayoutOrder = feedN }, feedBox)
	local items = feedBox:GetChildren()
	if #items > 6 then
		for _, c in items do
			if c:IsA("TextLabel") and c.LayoutOrder <= feedN - 5 then
				c:Destroy()
			end
		end
	end
	task.delay(4, function()
		if l.Parent then
			l:Destroy()
		end
	end)
end)

local results = Instance.new("Frame")
results.BackgroundColor3 = Color3.fromRGB(14, 16, 24)
results.BackgroundTransparency = 0.2
results.Size = UDim2.fromOffset(360, 300)
results.Position = UDim2.new(0.5, -180, 0.5, -120)
results.Visible = false
results.Parent = gui
local resultsText = label({ Text = "", Size = UDim2.new(1, -40, 1, -30), Position = UDim2.fromOffset(20, 15), TextScaled = false, TextSize = 22, Font = Enum.Font.GothamBold, TextYAlignment = Enum.TextYAlignment.Top, TextXAlignment = Enum.TextXAlignment.Left }, results)

-- minimap: the centre line seen from above, a dot per kart
local mapSize = 190
local map = Instance.new("Frame")
map.BackgroundColor3 = Color3.fromRGB(10, 12, 18)
map.BackgroundTransparency = 0.45
map.Size = UDim2.fromOffset(mapSize, mapSize)
map.Position = UDim2.new(0, 24, 1, -mapSize - 24)
map.Visible = hud.minimap ~= false
map.Parent = gui
local minX, maxX, minZ, maxZ = math.huge, -math.huge, math.huge, -math.huge
for _, p in Track.points do
	minX, maxX, minZ, maxZ = math.min(minX, p.X), math.max(maxX, p.X), math.min(minZ, p.Z), math.max(maxZ, p.Z)
end
local span = math.max(maxX - minX, maxZ - minZ, 1)
local function toMap(p: Vector3): UDim2
	local pad = 12
	local s = (mapSize - pad * 2) / span
	local cx, cz = (minX + maxX) / 2, (minZ + maxZ) / 2
	return UDim2.fromOffset(mapSize / 2 + (p.X - cx) * s, mapSize / 2 + (p.Z - cz) * s)
end
for i = 1, Track.count, 2 do
	local d = Instance.new("Frame")
	d.Size = UDim2.fromOffset(3, 3)
	d.AnchorPoint = Vector2.new(0.5, 0.5)
	d.BorderSizePixel = 0
	d.BackgroundColor3 = Color3.fromRGB(200, 205, 215)
	d.Position = toMap(Track.points[i])
	d.Parent = map
end
local dots: { [string]: Frame } = {}

----------------------------------------------------------------------------------------------------------------
-- state from the server

local state: any = nil
StateEvent.OnClientEvent:Connect(function(s)
	state = s
end)

----------------------------------------------------------------------------------------------------------------
-- the rider pick: four cards when the player joins (and on C between races). 1-4, Left/Right and Enter, or a
-- click. The server swaps the kart's rider and the countdown waits until everyone has picked.

local PickClass = Race:WaitForChild("PickClass") :: RemoteEvent
local classInfo: { any } = {}
do
	local ok, list = pcall(function()
		local raw = Race:GetAttribute("Classes")
		local t0 = os.clock()
		while raw == nil and os.clock() - t0 < 10 do
			task.wait(0.1)
			raw = Race:GetAttribute("Classes")
		end
		return game:GetService("HttpService"):JSONDecode(raw or "[]")
	end)
	if ok and type(list) == "table" then
		classInfo = list
	end
end
local DESCRIBE = {
	volt = "SPACE: an electric dash. Every kart you run into is zapped.",
	sniper = "Aim with the mouse, CLICK to fire. The shot hits the kart under the crosshair.",
	shrink = "SPACE: small and fast for a few seconds. Get touched and you are squashed.",
	thrower = "Throws an item forward on its own. It hits the first kart in your lane.",
}
local CARD_W, CARD_H, GAP = 230, 290, 22

local pickGui = Instance.new("ScreenGui")
pickGui.Name = "RiderPick"
pickGui.ResetOnSpawn = false
pickGui.IgnoreGuiInset = true
pickGui.DisplayOrder = 10
pickGui.Enabled = false
pickGui.Parent = player:WaitForChild("PlayerGui")
local dim = Instance.new("Frame")
dim.Size = UDim2.fromScale(1, 1)
dim.BackgroundColor3 = Color3.fromRGB(5, 8, 15)
dim.BackgroundTransparency = 0.38
dim.BorderSizePixel = 0
dim.Parent = pickGui
label({ Text = string.upper(hud.title or Config.title or ""), Size = UDim2.fromOffset(600, 28), Position = UDim2.new(0.5, -300, 0.5, -258), TextColor3 = accent }, pickGui)
label({ Text = "CHOOSE YOUR RIDER", Size = UDim2.fromOffset(800, 54), Position = UDim2.new(0.5, -400, 0.5, -226) }, pickGui)
local row = Instance.new("Frame")
row.BackgroundTransparency = 1
row.AnchorPoint = Vector2.new(0.5, 0.5)
row.Position = UDim2.fromScale(0.5, 0.52)
row.Size = UDim2.fromOffset(#classInfo * CARD_W + math.max(0, #classInfo - 1) * GAP, CARD_H)
row.Parent = pickGui
local rowScale = Instance.new("UIScale")
rowScale.Parent = row
label({ Text = "1-4 or LEFT/RIGHT to choose      ENTER to race      or click a rider", Size = UDim2.fromOffset(700, 22), Position = UDim2.new(0.5, -350, 0.5, 196), Font = Enum.Font.GothamMedium, TextTransparency = 0.2 }, pickGui)

local pickOpen = false
local sel = 1
local cards: { { stroke: UIStroke, scale: UIScale, color: Color3 } } = {}

local function showPick()
	for i, c in cards do
		c.scale.Scale = if i == sel then 1.07 else 0.95
		c.stroke.Transparency = if i == sel then 0 else 0.65
	end
end

local function choose(i: number)
	local c = classInfo[i]
	if not c then
		return
	end
	pickOpen, pickGui.Enabled = false, false
	PickClass:FireServer(c.kind)
end

for i, c in classInfo do
	local col = Color3.fromHex(c.color or "#ffffff")
	local card = Instance.new("TextButton")
	card.Name = "Card_" .. c.kind
	card.AutoButtonColor = false
	card.Text = ""
	card.BackgroundColor3 = Color3.fromRGB(18, 20, 30)
	card.Size = UDim2.fromOffset(CARD_W, CARD_H)
	card.Position = UDim2.fromOffset((i - 1) * (CARD_W + GAP), 0)
	card.Parent = row
	Instance.new("UICorner").Parent = card
	local stroke = Instance.new("UIStroke")
	stroke.Thickness = 4
	stroke.Color = col
	stroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
	stroke.Parent = card
	local scale = Instance.new("UIScale")
	scale.Parent = card
	local band = Instance.new("Frame")
	band.BackgroundColor3 = col
	band.BorderSizePixel = 0
	band.Size = UDim2.new(1, 0, 0, 62)
	band.Parent = card
	Instance.new("UICorner").Parent = band
	label({ Text = tostring(i), Size = UDim2.fromOffset(26, 22), Position = UDim2.fromOffset(8, 6), TextColor3 = Color3.new(0, 0, 0), TextTransparency = 0.45, TextStrokeTransparency = 1 }, card)
	label({ Text = string.upper(c.name or c.kind), Size = UDim2.new(1, -64, 0, 40), Position = UDim2.fromOffset(32, 11) }, card)
	label({
		Text = DESCRIBE[c.kind] or "",
		Size = UDim2.new(1, -28, 0, 140),
		Position = UDim2.fromOffset(14, 78),
		TextScaled = false,
		TextSize = 19,
		TextWrapped = true,
		Font = Enum.Font.GothamMedium,
		TextYAlignment = Enum.TextYAlignment.Top,
	}, card)
	local every = if c.kind == "thrower" then "an item every %s s" else "ready every %s s"
	label({ Text = string.format(every, tostring(c.cooldown)), Size = UDim2.new(1, -20, 0, 22), Position = UDim2.new(0, 10, 1, -40), TextColor3 = col }, card)
	card.Activated:Connect(function()
		choose(i)
	end)
	card.MouseEnter:Connect(function()
		sel = i
		showPick()
	end)
	table.insert(cards, { stroke = stroke, scale = scale, color = col })
end

local function openPick()
	if #classInfo == 0 or player:GetAttribute("Picked") == nil then
		return
	end
	sel = 1
	for i, c in classInfo do
		if c.kind == myClass() then
			sel = i
		end
	end
	rowScale.Scale = math.min(1, (camera.ViewportSize.X - 40) / math.max(1, row.Size.X.Offset))
	showPick()
	pickOpen, pickGui.Enabled = true, true
end

player:GetAttributeChangedSignal("Picked"):Connect(function()
	if player:GetAttribute("Picked") == false then
		openPick()
	elseif pickOpen then
		pickOpen, pickGui.Enabled = false, false
	end
end)
if player:GetAttribute("Picked") == false then
	openPick()
end

local NUMBER_KEYS = { Enum.KeyCode.One, Enum.KeyCode.Two, Enum.KeyCode.Three, Enum.KeyCode.Four }
UserInputService.InputBegan:Connect(function(input, processed)
	if processed or input.UserInputType ~= Enum.UserInputType.Keyboard and not input.UserInputType.Name:find("Gamepad") then
		return
	end
	local key = input.KeyCode
	if pickOpen then
		for i, k in NUMBER_KEYS do
			if key == k then
				choose(i)
				return
			end
		end
		if key == Enum.KeyCode.Left or key == Enum.KeyCode.DPadLeft then
			sel = (sel - 2) % #cards + 1
			showPick()
		elseif key == Enum.KeyCode.Right or key == Enum.KeyCode.DPadRight then
			sel = sel % #cards + 1
			showPick()
		elseif key == Enum.KeyCode.Return or key == Enum.KeyCode.KeypadEnter or key == Enum.KeyCode.ButtonA then
			choose(sel)
		end
	elseif key == Enum.KeyCode.C and state and state.phase ~= "race" then
		openPick()
	end
end)

local function ordinal(n: number): string
	local suffix = "th"
	if n % 100 < 11 or n % 100 > 13 then
		suffix = ({ "st", "nd", "rd" })[n % 10] or "th"
	end
	return n .. suffix
end

local function myKart(): any
	if not state then
		return nil
	end
	for _, k in state.karts do
		if k.o == player.UserId then
			return k
		end
	end
	return state.karts[1]
end

----------------------------------------------------------------------------------------------------------------
-- camera

camera.CameraType = Enum.CameraType.Scriptable
local camCF: CFrame? = nil
RunService.RenderStepped:Connect(function(dt)
	local me = myKart()
	local target: CFrame
	if me then
		local model = workspace:FindFirstChild("Karts") and workspace.Karts:FindFirstChild(me.n)
		local pose = if model then model:GetPivot() else Track.poseAt(me.d, me.l)
		-- behind and above in the kart's own frame, so the camera rolls through loops with it
		local eye = pose * CFrame.new(0, 7.5, 17)
		target = CFrame.lookAt(eye.Position, (pose * CFrame.new(0, 2.5, -10)).Position, pose.UpVector)
	else
		local c = Track.poseAt(os.clock() * 30, 0)
		target = CFrame.lookAt((c * CFrame.new(0, 40, 80)).Position, c.Position, Vector3.yAxis)
	end
	camCF = if camCF then camCF:Lerp(target, math.clamp(dt * 8, 0, 1)) else target
	camera.CFrame = camCF :: CFrame
	camera.FieldOfView = 70 + math.clamp((me and me.v or 0) / 3, 0, 14)

	if not state then
		return
	end
	local kind = if me and me.k then me.k else myClass()
	local sniping = kind == "sniper" and built.combat ~= false and state.phase ~= "finished" and not (me and me.f)
	hint.Text = (HELP[kind] or "W/S drive   A/D steer") .. (if player:GetAttribute("Picked") ~= nil and state.phase ~= "race" then "   C change rider" else "")
	if me and me.k and built.combat ~= false then
		classLabel.TextColor3 = Color3.fromHex(me.g or "ffffff")
		classLabel.Text = string.upper(me.k) .. "   " .. (if me.a then "ACTIVE" elseif me.cd > 0 then string.format("%.1f s", me.cd) else "READY")
		cross.Visible = sniping and not pickOpen
		UserInputService.MouseIconEnabled = pickOpen or not sniping or touchAim ~= nil
		if sniping then
			local p = aimPoint()
			cross.Position = UDim2.fromOffset(p.X, p.Y)
			local hot = kartUnderAim(me.n)
			local c = if me.cd > 0 then Color3.fromRGB(170, 170, 180) elseif hot then Color3.fromRGB(255, 60, 80) else Color3.new(1, 1, 1)
			ring.Color, pip.BackgroundColor3 = c, c
			crossText.Text = if me.cd > 0 then string.format("%.1f", me.cd) else ""
		end
	else
		classLabel.Text = ""
		cross.Visible = false
		UserInputService.MouseIconEnabled = true
	end
	lapLabel.Text = if me then string.format("LAP %d/%d", me.lap, state.laps) else ""
	placeLabel.Text = if me then ordinal(me.pl) else ""
	speedLabel.Text = if me then string.format("%d km/h", math.floor(math.abs(me.v) * 3.6)) else ""
	if state.phase == "countdown" then
		bigLabel.Text = tostring(math.max(1, math.ceil(state.clock)))
	elseif state.phase == "race" and state.clock < 1 then
		bigLabel.Text = "GO!"
	elseif me and me.f and state.phase == "race" then
		bigLabel.Text = "FINISHED " .. ordinal(me.pl)
	else
		bigLabel.Text = ""
	end
	results.Visible = state.phase == "finished"
	if results.Visible then
		local lines = { "RESULTS", "" }
		for _, k in state.karts do
			table.insert(lines, string.format("%s  %s%s", ordinal(k.pl), k.n, if k.f then string.format("   %.1f s", k.f) else ""))
		end
		resultsText.Text = table.concat(lines, "\n")
	end
	for _, k in state.karts do
		local dot = dots[k.n]
		if not dot then
			dot = Instance.new("Frame")
			dot.Size = UDim2.fromOffset(9, 9)
			dot.AnchorPoint = Vector2.new(0.5, 0.5)
			dot.BorderSizePixel = 0
			dot.BackgroundColor3 = Color3.fromHex(k.c)
			dot.ZIndex = 3
			local corner = Instance.new("UICorner")
			corner.CornerRadius = UDim.new(1, 0)
			corner.Parent = dot
			dot.Parent = map
			dots[k.n] = dot
		end
		dot.Position = toMap((Track.sample(k.d)))
		dot.Size = if me and k.n == me.n then UDim2.fromOffset(13, 13) else UDim2.fromOffset(9, 9)
	end
end)

----------------------------------------------------------------------------------------------------------------
-- scenery motion (local only; the server built it anchored and never moves it)

local homes: { [Instance]: CFrame } = {}
local function homeOf(x: Instance, now: CFrame): CFrame
	local h = homes[x]
	if not h then
		h = now
		homes[x] = h
		x.Destroying:Once(function()
			homes[x] = nil
		end)
	end
	return h
end

RunService.RenderStepped:Connect(function()
	local t = os.clock()
	for _, m in CollectionService:GetTagged("SceneryBob") do
		if m:IsA("Model") then
			local home = homeOf(m, m:GetPivot())
			local amp, period = m:GetAttribute("Amp") or 1, m:GetAttribute("Period") or 8
			local phase, spin = m:GetAttribute("Phase") or 0, m:GetAttribute("Spin") or 0
			local y = math.sin(t * math.pi * 2 / period + phase) * amp
			m:PivotTo(home * CFrame.new(0, y, 0) * CFrame.Angles(0, math.rad(spin * t), 0))
		end
	end
	for _, m in CollectionService:GetTagged("ScenerySpin") do
		local centre = m:GetAttribute("Centre")
		if m:IsA("Model") and typeof(centre) == "Vector3" then
			local home = homeOf(m, m:GetPivot())
			local turn = CFrame.new(centre) * CFrame.Angles(0, -math.rad((m:GetAttribute("Speed") or 1) * t), 0) * CFrame.new(-centre)
			m:PivotTo(turn * home)
		end
	end
	for _, b in CollectionService:GetTagged("SceneryWave") do
		local hinge = b:GetAttribute("Hinge")
		if b:IsA("BasePart") and typeof(hinge) == "CFrame" then
			local home = homeOf(b, b.CFrame)
			local phase = b:GetAttribute("Phase") or 0
			local swing = CFrame.Angles(0, math.rad(math.sin(t * 2.3 + phase) * 18), math.rad(math.sin(t * 3.1 + phase) * 4))
			b.CFrame = hinge * swing * hinge:ToObjectSpace(home)
		end
	end
end)
