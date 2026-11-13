-- The player's side: keys (or touch) to the Drive remote, a chase camera that rolls with the road through loops
-- and twists, and the HUD (lap, place, speed, countdown, hit feed, results, minimap).

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

UserInputService.InputBegan:Connect(function(input, processed)
	if processed then
		return
	end
	if input.UserInputType == Enum.UserInputType.Keyboard or input.UserInputType.Name:find("Gamepad") then
		keys[input.KeyCode] = true
		if input.KeyCode == Enum.KeyCode.Space or input.KeyCode == Enum.KeyCode.F or input.KeyCode == Enum.KeyCode.ButtonX then
			attackQueued = true
		end
	elseif input.UserInputType == Enum.UserInputType.Touch then
		touching = true
		local w = camera.ViewportSize.X
		touchSteer = math.clamp((input.Position.X - w / 2) / (w / 4), -1, 1)
		if input.Position.Y < camera.ViewportSize.Y * 0.4 then
			attackQueued = true
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
		Drive:FireServer(throttle, steer, attackQueued)
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
local hint = label({ Text = "W/S drive   A/D steer   SPACE swing", Size = UDim2.fromOffset(520, 22), Position = UDim2.new(0.5, -260, 1, -36), Font = Enum.Font.GothamMedium }, gui)
title.ZIndex, hint.TextTransparency = 2, 0.3

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
