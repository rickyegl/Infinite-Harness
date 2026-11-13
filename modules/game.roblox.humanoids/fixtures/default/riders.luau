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
