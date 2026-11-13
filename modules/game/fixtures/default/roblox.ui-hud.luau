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
