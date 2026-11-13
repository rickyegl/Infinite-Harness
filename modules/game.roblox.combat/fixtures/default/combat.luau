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
