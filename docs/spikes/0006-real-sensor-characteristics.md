# Spike 0006. Real characteristics of joint sensors

- Date: 2026-09-30. Web research only: no sensor was measured.
- Scope: what datasheets give for the sensors that watch a machine's own
  motion (inductive, magnetic cylinder, mechanical limit switch), and what
  Pantin must model so that a PLC program sees realistic signals. Narrowed on
  the user's request: capacitive and photoelectric sensors are left to phase 6.
- Context: ADR 0023 models a switch as an ideal range of the joint coordinate,
  stateless, without hysteresis or delay.

## Verdict

**The ideal range misses the one effect every family shares: hysteresis.**
Each sensor switches on at one point and off at another. A range of the joint
coordinate can still carry the geometry, as long as each switch gets a
switch-on point, a hysteresis and, for inductive sensors, a sensing distance
scaled by the target's material. Delays and contact bounce are shorter than
one simulation step (8.3 ms at 120 Hz) and than a WAGO input filter (3 ms):
not worth simulating now. Cones and detection lobes only matter for a sensor
that detects another body, which is phase 6.

## Findings

### Inductive proximity sensors

- **Sensing distances** (IEC 60947-5-2 vocabulary, as used by the Bernstein
  guide):
  - nominal Sn: the catalogue value, measured with a standard square target of
    Fe360 steel, 1 mm thick;
  - real Sr: 0.9 to 1.1 × Sn at rated voltage and temperature;
  - usable Su: 0.9 to 1.1 × Sr over the temperature and voltage range;
  - assured Sa: 0 to 0.81 × Sn, where switching is guaranteed.
- **Hysteresis:** the gap between switch-on on approach and switch-off on
  retreat. Typically 10 % of Sn (Bernstein); its purpose is to prevent
  chatter from a slow target.
- **Material correction factors:** they multiply Sn when the target is not
  steel. Values differ between sources:

  | Material | Factor (single values) | Range across sources |
  | --- | --- | --- |
  | Steel Fe360 | 1.0 | 1.0 |
  | Stainless steel | 0.85 | 0.6 to 1.0 |
  | Brass | 0.4 | 0.35 to 0.5 |
  | Aluminium | 0.4 | 0.3 to 0.45 |
  | Copper | 0.3 | 0.25 to 0.45 |

  Balluff and autosen give these tables. "Factor 1" sensors exist and treat
  all metals the same.
- **Switching frequency:** it is specified with the standard target at
  0.5 × Sn. It limits how fast a toothed wheel can be counted, not a cylinder
  end position.
- **NON VÉRIFIÉ:**
  - the exact shape of the detection lobe for a lateral approach (target
    passing in front of the face);
  - how much flush mounting reduces the lobe width.

  Neither was found with numbers.

### Magnetic cylinder sensors (reed or magnetoresistive, in the T-slot)

- A cylinder sensor detects the piston magnet over a window of the stroke,
  with hysteresis. It is on while the piston is inside the window.
- **Festo SMT-8M (magnetoresistive), from its datasheet at a distributor:**
  - repeatability 0.2 mm;
  - switch-on ≤ 1.3 ms, switch-off ≤ 1.4 ms;
  - 180 Hz maximum.
- **Other published values:**
  - reed sensors: hysteresis of about 1 mm on cylinder sensors, and a
    2 mm example on a generic reed switch;
  - reed operate time 0.4 ms, release time 0.1 ms.
- **Minimum dwell:** the piston must stay in the window long enough, which
  matters at high speed. Sources mention reed sensors that detect travel
  above 10 m/s.
- **NON VÉRIFIÉ:** a typical width of the switching window along the stroke.
  It depends on the magnet and on the cylinder, and manufacturers publish it
  per cylinder, not per sensor.

### Mechanical limit switches

Definitions from the Omron technical guide and Apem datasheets:

- **Pretravel (PT):** from the free position to the operating position (OP),
  where the contact changes over.
- **Overtravel (OT):** from OP to the total travel position. Going beyond it
  damages the switch.
- **Differential travel (MD):** from OP back to the release position (RP).
  This is the switch's hysteresis.
- **Contact bounce:**
  - usually 5 to 8 ms for standard mechanical contacts, up to 10 to 20 ms
    when worn (general sources, not a limit switch datasheet);
  - PLC programs filter it with an input filter (3 ms on a WAGO 750-430) or
    a timer.
- **NON VÉRIFIÉ:** typical PT, OT and MD values for a roller lever (Omron
  D4N). The datasheets were not readable in this spike.

## What Pantin should model

1. **Switch-on point and hysteresis for every switch.** The switch turns on
   when the joint reaches its operating point from the free side, and off
   only once it has moved back by the hysteresis. This needs state: the last
   output. Sensors would then be evaluated at each simulation step, like
   drives, instead of at each tag read as ADR 0023 point 4 decided.
2. **One folder per real technology**, each translating its datasheet
   parameters into a switch-on point and a hysteresis along the joint
   coordinate:
   - **Mechanical limit switch:** operating position, direction of
     actuation, differential travel (default 0.5 mm, NON VÉRIFIÉ) and
     overtravel. Pushing past the overtravel could raise a fault.
   - **Cylinder sensor:** its position along the stroke, its switching
     window (NON VÉRIFIÉ default 4 mm) and its hysteresis (default 1 mm).
   - **Inductive sensor, axial approach:**
     - the coordinate where the target touches the face;
     - Sn;
     - the target material (effective distance = factor × Sn, factor from
       the table above);
     - hysteresis as a percentage of the effective distance (default 10 %).
   - The encoder stays as it is. The ideal range stays as the simplest type,
     "ideal switch".
3. **Not simulated now:**
   - switching delays and contact bounce, which are shorter than a step;
   - the spread between Sr and Sn, and temperature drift.

   A "worn switch" fault with bounce could come later, with the injectable
   faults of ADR 0022.
4. **Cones and lateral lobes:**
   - A sensor that detects another body (a product, or a part not linked by
     the watched joint) needs geometry: a detection zone on a body and ray
     casts or shape overlaps. That is phase 6, and the inductive family
     parameters above (Sn, material factor, hysteresis) carry over to it.
   - A joint sensor can only express a lateral pass as a window along the
     coordinate, which is what the cylinder sensor already does.

## Sources

- Bernstein, inductive sensors general information:
  https://altechcorp.com/bernstein/sensors-bernstein/Files/A1-Inductive%20General.pdf
- Balluff, "Inductive proximity sensor targets: material does matter":
  https://www.balluff.com/en-us/blog/inductive-proximity-sensor-targets-material-does-matter
- autosen, correction factors for inductive sensors:
  https://autosen.com/en/Category/ListArticles/323
- Pepperl+Fuchs catalogue, proximity sensors:
  https://files.pepperl-fuchs.com/online-catalogs/245613/files/assets/basic-html/page32.html
- Festo SMT-8M datasheet (distributor copies):
  https://klefinghaus.de/datasheet/00574339.html
- Reed switch hysteresis and timing, Standex-Meder white paper:
  https://www.newark.com/site/binaries/content/assets/common/storefront-pdfs/standexmeder/whitepaper-industrial-an-essential-design-decision.pdf
- ipf electronic, magnetic sensors: https://www.ipf-electronic.de/fileadmin/PIM/assets/kdb/ma/gn/ipf_kdb_MAGN1900_en.pdf
- Omron, limit switch technical guide:
  https://www.ia.omron.com/data_pdf/guide/30/limit_switches_tg(further_info).pdf
- Contact bounce and PLC debouncing:
  https://industrialmonitordirect.com/blogs/knowledgebase/automationdirect-koyo-plc-input-debouncing-tutorial
- WAGO 750-430, 8-channel input with 3 ms filter:
  https://jp.farnell.com/en-JP/wago/750-430/8-ch-di-module-dc-24v-pos-switch/dp/2077641
