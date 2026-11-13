-- Day, night and the realistic look for the place: clock time, ambient light, atmosphere, bloom, colour
-- grading, sun rays, lamps and glowing edges, and a slightly wet road. Applied by the server at start;
-- Lighting replicates to every player.

local CollectionService = game:GetService("CollectionService")
local Lighting = game:GetService("Lighting")

local Look = {}

local function get(className: string, name: string): Instance
	local x = Lighting:FindFirstChild(name)
	if not x then
		x = Instance.new(className)
		x.Name = name
		x.Parent = Lighting
	end
	return x
end

function Look.apply(night: boolean, realistic: boolean, look: { sky: string?, ground: string? })
	local sky = Color3.fromHex(look.sky or "#7fb4e6")
	Lighting.ClockTime = if night then 0.4 elseif realistic then 16.2 else 14.5
	Lighting.Brightness = if night then 0.4 elseif realistic then 3 else 2.2
	Lighting.Ambient = if night then Color3.fromRGB(18, 22, 40) else Color3.fromRGB(90, 96, 104)
	Lighting.OutdoorAmbient = if night then Color3.fromRGB(26, 32, 60) else sky:Lerp(Color3.new(0.6, 0.6, 0.6), 0.5)
	Lighting.EnvironmentDiffuseScale = if realistic then 1 else 0.4
	Lighting.EnvironmentSpecularScale = if realistic then 1 else 0.3
	Lighting.FogEnd = 100000

	local atm = get("Atmosphere", "HarnessAtmosphere") :: Atmosphere
	atm.Density = if night then 0.38 elseif realistic then 0.32 else 0.22
	atm.Haze = if realistic then 1.4 else 0.6
	atm.Color = if night then Color3.fromRGB(40, 50, 90) else sky
	atm.Decay = if night then Color3.fromRGB(20, 20, 40) else Color3.fromRGB(110, 120, 140)

	local bloom = get("BloomEffect", "HarnessBloom") :: BloomEffect
	bloom.Intensity = if night then 1.4 elseif realistic then 0.7 else 0.25
	bloom.Threshold = if night then 0.8 else 0.95
	bloom.Size = 28

	local cc = get("ColorCorrectionEffect", "HarnessGrade") :: ColorCorrectionEffect
	cc.Saturation = if realistic then 0.12 else 0.18
	cc.Contrast = if realistic then 0.14 else 0.05
	cc.TintColor = if night then Color3.fromRGB(215, 225, 255) else Color3.new(1, 1, 1)

	local rays = get("SunRaysEffect", "HarnessSunRays") :: SunRaysEffect
	rays.Enabled = realistic and not night
	rays.Intensity = 0.06

	for _, l in CollectionService:GetTagged("NightLight") do
		if l:IsA("Light") then
			l.Enabled = night
			l.Brightness = if realistic then 3.2 else 2
			l.Range = if realistic then 60 else 45
		end
	end
	for _, p in CollectionService:GetTagged("NightGlow") do
		if p:IsA("BasePart") then
			p.Material = if night then Enum.Material.Neon else Enum.Material.SmoothPlastic
		end
	end
	for _, p in CollectionService:GetTagged("Road") do
		if p:IsA("BasePart") then
			p.Material = if realistic then Enum.Material.Asphalt else Enum.Material.SmoothPlastic
			p.Reflectance = if realistic then (if night then 0.18 else 0.08) else 0
		end
	end
end

return Look
