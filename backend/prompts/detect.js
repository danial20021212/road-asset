export const DETECT_PROMPT = `You are detecting road assets in a dashcam frame from Malaysia. Find every object
that belongs to one of the LABELS below and draw a bounding box around each one.
Only use these labels, and ignore everything else.

LABELS
- traffic sign
- expressway sign
- traffic light
- left turn arrow road marking
- right turn arrow road marking
- straight arrow road marking
- left and straight arrow road marking
- right and straight arrow road marking
- left and u-turn arrow road marking
- right and u-turn arrow road marking
- u-turn arrow road marking
- yellow box junction
- feeder pillar
- bus stop
- traffic island

ROAD MARKINGS
Arrow road markings are white arrows painted flat on the road surface, seen in
perspective. They are not signs on poles. Choose the label that matches the
arrow's shape. A single arrow combining two directions (for example a left arrow
joined to a straight arrow) uses the combined label.

YELLOW BOX JUNCTION
A box of yellow criss-cross (diagonal grid) lines painted on the road surface at a
junction. Box the whole painted grid. Plain yellow centre lines, edge lines and
yellow painted kerbs are not yellow box junctions.

TRAFFIC LIGHT
Use for signal heads with red, amber or green lamps. Do not use it for the
"traffic signal ahead" warning sign, which is a yellow diamond and counts as a
traffic sign.

EXPRESSWAY SIGN
Use for guide signs with a GREEN background and white lettering, symbols or arrows:
expressway and highway direction boards, exit boards, distance boards and gantry
signs. Blue guide signs (federal, state and municipal roads) are NOT expressway
signs; they stay "traffic sign" with category informative.

FEEDER PILLAR
A free-standing metal electrical cabinet standing at the roadside or on the
pavement, usually grey, green or beige, roughly waist to head height, with a door
panel and often warning stickers or utility markings. Box the whole cabinet. Poles,
bins, signboards and small boxes fixed to a wall are not feeder pillars.

BUS STOP
A bus stop sign (a flag-style sign on a pole showing a bus symbol or the words
BUS STOP or BAS) or a bus shelter. Box the sign or the shelter. Always use this
label for bus stops, never "traffic sign".

TRAFFIC ISLAND
A raised (kerbed) or painted island that separates flows of traffic at junctions,
roundabouts, slip roads and crossings, often with painted kerb stripes, bollards or
a keep-left sign on it. Box the whole island. Long continuous road medians between
carriageways are not traffic islands.

SIGN CATEGORIES (only for objects labelled "traffic sign")
For each traffic sign, identify its shape and main colour, then pick exactly one
category.

regulatory_prohibitive
  Signs that forbid or limit something.
  Normally round, white background, red border, black symbol or number.
  Includes: no entry (red circle with a white horizontal bar), no U-turn, no left/right turn,
  no overtaking, speed limits, height/weight/width limits, no entry for certain vehicles.
  Exceptions that are still prohibitive: STOP (red octagon), GIVE WAY (red inverted triangle),
  and blue discs with a red border and a red slash or cross (No Parking, No Stopping).

regulatory_mandatory
  Signs that order a required action.
  Round, solid blue background, white arrow or pictogram, no red border.
  Includes: keep left, keep right, pass either side, turn left/right only,
  compulsory lane for motorcycles, bicycles, etc.

warning
  Signs that warn of a hazard or condition ahead.
  Yellow background with black border, black symbol or black text.
  Most are diamonds (square rotated 45 degrees), but yellow RECTANGLES and a yellow
  house-shaped pentagon are also warning signs.
  Includes: junctions and crossroads, bends, hump, slippery road, narrow bridge,
  roundabout ahead, traffic signal ahead, pedestrian crossing, children crossing,
  animal crossing, divided road ends, falling rocks,
  chevron direction signs (black chevron arrow on a yellow rectangle, marks a bend),
  and school area plates (yellow rectangle with "SEKOLAH" and a speed number such as 30 km/h).

informative
  Signs that give directions, distances, place names or facilities.
  Rectangular or square panels with text, route numbers or arrows.
  Background colours: blue (federal/state/municipal roads and facilities),
  brown or maroon (tourist attractions), white (towns and areas).
  Green panels are labelled "expressway sign" instead, not traffic sign.
  Yellow may appear only as lettering or route shields on these panels, never as the
  background of the whole sign.
  Includes: direction and distance boards, blue or white gantry signs, route number
  shields, U-turn allowed, parking, hospital, petrol station.
  Bus stop signs are labelled "bus stop" instead.

construction_temporary
  Signs used for road works or temporary conditions.
  Orange background (diamond or rectangle) with black text or symbols.
  Includes: road works, detour, lane closed, obstruction ahead, workers ahead,
  temporary stop/go signs.

DECISION RULES
1. Decide the background colour first, then the shape.
2. A sign whose whole background is yellow with a black border or black symbol is warning,
   whatever its shape (diamond, rectangle or pentagon). A yellow rectangle with a speed
   number is a school area warning, NOT a speed limit.
3. Orange background = construction_temporary. If you cannot tell yellow from orange,
   choose construction_temporary only if the symbol is about road works, lane closure
   or diversion; otherwise choose warning.
4. A round sign with a red border or red slash is prohibitive, even if the inside is blue.
   A round solid-blue sign with no red is mandatory.
5. A rectangle with a GREEN background and white lettering is an "expressway sign"
   (its own label, no category). A rectangle with a blue, brown or white background
   and text, distances or place names is a "traffic sign" with category informative.
6. Only box real objects from the LABELS list. Do not box shop signs, billboards,
   number plates, poles, the back of a sign, or arrows painted on other vehicles.
7. If a traffic sign is too blurry, too small or cut off to categorise, still box it
   and set its category to unknown. Do not guess.

OUTPUT
Return a JSON list only, one item per object:
[{"label": "<one of the LABELS>",
  "box_2d": [ymin, xmin, ymax, xmax],
  "shape": "<circle|diamond|triangle|octagon|rectangle|pentagon|other>" or null,
  "main_color": "<red|blue|yellow|orange|green|brown|white|other>" or null,
  "category": "<regulatory_prohibitive|regulatory_mandatory|warning|informative|construction_temporary|unknown>" or null,
  "confidence": <0 to 1>}]
shape, main_color and category are filled in only when label is "traffic sign".
For every other label, set all three to null.
Coordinates in box_2d are 0 to 1000, relative to the image size.
If nothing is found, return [].`