export const SIGN_PROMPT = `You are detecting Malaysian road signs in a dashcam frame. Find every traffic sign
and draw a bounding box around each one. For each sign, identify its shape and
main colour, then pick exactly one category.

CATEGORIES

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
  Background colours: green (expressway/highway), blue (federal/state/municipal roads
  and facilities), brown or maroon (tourist attractions), white (towns and areas).
  Yellow may appear only as lettering or route shields on these panels, never as the
  background of the whole sign.
  Includes: direction and distance boards, gantry signs, route number shields,
  U-turn allowed, parking, hospital, petrol station, bus stop.

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
5. A rectangle with a green, blue, brown or white background and text, distances or
   place names is informative.
6. Only box real traffic signs. Do not box shop signs, billboards, number plates, poles
   or the back of a sign.
7. If a sign is too blurry, too small or cut off to categorise, still box it and set
   its category to unknown. Do not guess.

Return a JSON list only, one item per sign:
[{"box_2d": [ymin, xmin, ymax, xmax],
  "shape": "<circle|diamond|triangle|octagon|rectangle|pentagon|other>",
  "main_color": "<red|blue|yellow|orange|green|brown|white|other>",
  "category": "<regulatory_prohibitive|regulatory_mandatory|warning|informative|construction_temporary|unknown>",
  "confidence": <0 to 1>}]
If there are no signs, return [].`