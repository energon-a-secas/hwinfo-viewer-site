/* ── LogScope: sensor dictionary + tutorials ──────────────────
 * SENSOR_DEFS drives three things at once:
 *   1. Column detection when a HWiNFO CSV is parsed (match[] tokens).
 *   2. The plain-language "Translate" glossary table.
 *   3. Chart series metadata (label, unit, color, thresholds).
 *
 * `match` is an array of token-groups. A header matches a def when its
 * lowercased name contains EVERY token of ANY one group. Groups are tried
 * top to bottom, so put the most specific groups first.
 */
window.LS = window.LS || {};

LS.SENSOR_DEFS = [
  // ── GPU thermals ──────────────────────────────────────────
  {
    key: 'gpuTemp', label: 'GPU Temperature', unit: '°C', kind: 'gpu', color: '#fb7185',
    match: [['gpu', 'temperature'], ['gpu temp']],
    exclude: ['junction', 'hot spot', 'hotspot', 'memory'],
    plain: 'Core die temperature of the graphics chip.',
    normal: 'Idle 30–50 °C · gaming 60–80 °C.',
    concern: 'Sustained 84 °C+ means it is thermal throttling. A sudden freeze at a value (stops changing) points to a hang/crash, not heat.',
  },
  {
    key: 'gpuHotspot', label: 'GPU Hot Spot Temperature', unit: '°C', kind: 'gpu', color: '#f97316',
    match: [['hot spot'], ['hotspot']],
    exclude: ['memory'],
    plain: 'Hottest single point on the GPU die (worst-case sensor).',
    normal: 'Usually 10–20 °C above the core temp.',
    concern: '110 °C+ or a gap over ~25 °C vs core suggests dried paste or bad mounting.',
  },
  {
    key: 'gpuJunction', label: 'GPU Memory Junction Temp', unit: '°C', kind: 'gpu', color: '#f59e0b',
    match: [['memory', 'junction'], ['mem', 'junction'], ['vram', 'temp']],
    plain: 'Temperature of the GDDR memory modules (VRAM).',
    normal: 'Under load 70–95 °C.',
    concern: '95 °C throttles memory. If it drops to 0 or freezes while other sensors die, that is the crash signature.',
  },
  // ── GPU power / voltage ───────────────────────────────────
  {
    key: 'gpuPower', label: 'GPU Power (Total)', unit: 'W', kind: 'power', color: '#22d3ee',
    match: [['gpu', 'power', 'total'], ['total board power'], ['gpu power'], ['board power']],
    exclude: ['limit', 'rail', '12v', 'pcie'],
    plain: 'Total board power draw of the whole card.',
    normal: 'Idle 10–40 W · gaming up to the card TDP (e.g. ~575 W on a 5090).',
    concern: 'Repeated spikes to the power limit, or an instant drop to 0 W mid-session, indicate a hang or a power-delivery fault.',
  },
  {
    key: 'gpuVcore', label: 'GPU Core Voltage', unit: 'V', kind: 'power', color: '#a78bfa',
    match: [['gpu core voltage'], ['gpu', 'voltage'], ['core voltage']],
    exclude: ['soc', 'cpu'],
    plain: 'Voltage feeding the GPU core.',
    normal: '~0.7–1.1 V, moving with clock speed.',
    concern: 'Sudden sag (a sharp dip) right before a freeze can mean the card asked for more power than the rail could deliver.',
  },
  {
    key: 'gpu12vhpwr', label: '12VHPWR / PCIe Rail Voltage', unit: 'V', kind: 'power', color: '#e879f9',
    match: [['12vhpwr'], ['12v', 'hpwr'], ['pcie', '12v', 'input'], ['+12v', 'input']],
    exclude: ['power', 'current', 'w]'],
    plain: 'Voltage on the 12VHPWR / 12V-2x6 power connector rail.',
    normal: 'Should stay near 12.0 V (11.4–12.6 V).',
    concern: 'Dipping below ~11.4 V under load points to a bad cable seat, connector, or PSU rail — a known failure area on 40/50-series cards.',
  },
  // ── Motherboard power rails (PSU/UPS health) ──────────────
  {
    key: 'mobo12v', label: 'Motherboard +12V Rail', unit: 'V', kind: 'power', color: '#fda4af',
    match: [['+12v']],
    exclude: ['gpu', 'pcie', 'hpwr', 'input', 'power', 'current', 'fan'],
    plain: 'The PSU main 12V rail as read by the motherboard — feeds everything, including the CPU and (via the slot) part of the GPU.',
    normal: '11.4–12.6 V (ATX ±5 %), barely moving.',
    concern: 'A sag below ~11.4 V that lines up with a crash points at the PSU or the UPS feeding it — not the GPU. Cross-check against the 12VHPWR rail: if both dip together, blame the source, not the card.',
  },
  {
    key: 'mobo5v', label: 'Motherboard +5V Rail', unit: 'V', kind: 'power', color: '#fca5a5',
    match: [['+5v']],
    exclude: ['gpu', 'pcie', 'power', 'current', 'vsb', 'standby'],
    plain: 'The PSU 5V rail (logic, USB, SATA) as read by the motherboard.',
    normal: '4.75–5.25 V.',
    concern: 'Out-of-range readings alongside 12V sag strengthen the PSU/UPS theory.',
  },
  {
    key: 'mobo3v3', label: 'Motherboard +3.3V Rail', unit: 'V', kind: 'power', color: '#fecaca',
    match: [['+3.3v'], ['3.3vcc']],
    exclude: ['power', 'current'],
    plain: 'The PSU 3.3V rail (chipset, memory logic) as read by the motherboard.',
    normal: '3.14–3.47 V.',
    concern: 'Rarely the culprit, but wild swings here plus 12V sag = PSU on the way out.',
  },
  {
    key: 'sysPower', label: 'System Power (CPU+GPU)', unit: 'W', kind: 'power', color: '#f0abfc',
    derived: true,
    match: [],
    plain: 'Estimated total draw: CPU package + GPU board power summed per sample. Add ~50–100 W for the rest of the system.',
    normal: 'Idle 50–150 W · gaming commonly 400–800 W on a high-end rig.',
    concern: 'A peak near or above your PSU/UPS rating explains shutdowns on transients — brief spikes run well above the logged average, and an undersized UPS trips exactly on those.',
  },
  // ── GPU clocks / load ─────────────────────────────────────
  {
    key: 'gpuClock', label: 'GPU Core Clock', unit: 'MHz', kind: 'gpu', color: '#60a5fa',
    match: [['gpu clock'], ['gpu core clock'], ['core clock']],
    exclude: ['memory', 'mem', 'ratio', 'effective'],
    plain: 'Current core clock frequency.',
    normal: 'Idle a few hundred MHz · boost 2500–3000+ MHz.',
    concern: 'Never leaving stock boost even after you set a negative offset means your undervolt/underclock did not apply.',
  },
  {
    key: 'gpuEffectiveClock', label: 'GPU Effective Clock', unit: 'MHz', kind: 'gpu', color: '#93c5fd',
    match: [['effective clock']],
    exclude: ['memory', 'mem'],
    plain: 'The clock the GPU actually delivered, versus the requested boost clock.',
    normal: 'Tracks the core clock closely under steady load.',
    concern: 'Requested says 2800 MHz but effective collapses = real throttling or instability, not just a nominal dip. Compare both lines on the chart.',
  },
  {
    key: 'gpuMemClock', label: 'GPU Memory Clock', unit: 'MHz', kind: 'gpu', color: '#818cf8',
    match: [['gpu memory clock'], ['memory clock'], ['mem clock']],
    plain: 'Effective VRAM clock frequency.',
    normal: 'Steps up under load; GDDR7 runs very high effective rates.',
    concern: 'Bouncing to idle clocks during gameplay = driver power-state flapping (a 50-series bug pattern).',
  },
  {
    key: 'gpuLoad', label: 'GPU Utilization', unit: '%', kind: 'gpu', color: '#0080ff',
    match: [['gpu utilization'], ['gpu core load'], ['gpu', 'usage'], ['d3d usage']],
    exclude: ['memory', 'controller', 'bus', 'video'],
    plain: 'How busy the GPU is. Used by LogScope to bucket samples into load zones.',
    normal: 'Idle < 15 % · light 15–50 % · heavy 50–100 %.',
    concern: 'Load pinned at a flat value while FPS is 0 usually means the render pipeline stalled (a hang).',
  },
  {
    key: 'gpuMemUsed', label: 'GPU Memory Used', unit: 'MB', kind: 'mem', color: '#34d399',
    match: [['gpu memory used'], ['memory used'], ['vram', 'used'], ['memory allocated']],
    plain: 'VRAM currently in use.',
    normal: 'Depends on game and resolution; up to the card capacity.',
    concern: 'Hitting the physical VRAM ceiling causes stutter and can trigger crashes in some titles.',
  },
  {
    key: 'gpuFan', label: 'GPU Fan Speed', unit: 'RPM', kind: 'gpu', color: '#2dd4bf',
    match: [['gpu fan'], ['fan1'], ['fan speed']],
    plain: 'Fan speed of the card.',
    normal: '0 RPM at idle (zero-fan mode) up to a few thousand under load.',
    concern: 'Fans stuck at 0 while temps climb, or ramping to 100 % with low temps, hints at a sensor/firmware fault.',
  },
  // ── PCIe link ─────────────────────────────────────────────
  {
    key: 'pcieRecovery', label: 'PCIe Recovery / Error Count', unit: '', kind: 'pcie', color: '#f43f5e',
    match: [['recovery count'], ['pci', 'error'], ['pcie', 'error'], ['correctable error'], ['link recovery']],
    plain: 'How many times the PCIe link had to re-train or recover from an error.',
    normal: 'Ideally 0, and it should never keep climbing.',
    concern: 'A count that keeps rising = an unstable PCIe link (riser cable, Gen5 signal integrity, dirty slot). Forcing Gen4 in BIOS often stabilizes it.',
  },
  {
    key: 'pcieLinkSpeed', label: 'PCIe Link Speed', unit: 'GT/s', kind: 'pcie', color: '#fb923c',
    match: [['link speed'], ['pcie', 'speed']],
    plain: 'Active PCIe generation speed (2.5 / 5 / 8 / 16 / 32 GT/s = Gen1…Gen5).',
    normal: 'Steady at the negotiated max (16 GT/s = Gen4, 32 = Gen5).',
    concern: 'Flapping between speeds mid-session means the link keeps renegotiating — a stability red flag.',
  },
  {
    key: 'gpuBusLoad', label: 'GPU Bus Load', unit: '%', kind: 'pcie', color: '#fdba74',
    match: [['gpu bus load'], ['bus load'], ['pcie bandwidth']],
    plain: 'How much of the PCIe bandwidth the GPU is using.',
    normal: 'Varies with the workload; rarely maxed for long.',
    concern: 'Not a fault by itself, but sudden zeroing lines up with a stalled link.',
  },
  // ── Performance-limit flags: WHY the card held clocks back ─
  {
    key: 'perfLimitPower', label: 'Perf Limit · Power', unit: '', kind: 'limit', color: '#f472b6',
    match: [['performance limit', 'power'], ['perfcap', 'power']],
    exclude: ['thermal', 'voltage', 'reliab', 'util'],
    plain: 'Yes/No flag: the card cut clocks because it hit its power budget.',
    normal: 'Flickers on under boost — modern cards boost straight into the power wall by design.',
    concern: 'Active most of the time under load = the card is power-starved: power limit set too low, a sagging rail, or a PSU/cable that cannot feed it.',
  },
  {
    key: 'perfLimitThermal', label: 'Perf Limit · Thermal', unit: '', kind: 'limit', color: '#fb7185',
    match: [['performance limit', 'thermal']],
    exclude: ['power', 'voltage', 'util'],
    plain: 'Yes/No flag: the card cut clocks because a temperature hit its limit.',
    normal: 'Should basically never be active if cooling is adequate.',
    concern: 'Active under load = heat-capped clocks. Pair with core/hot-spot/VRAM temps to find which sensor tripped it.',
  },
  {
    key: 'perfLimitVoltage', label: 'Perf Limit · Voltage', unit: '', kind: 'limit', color: '#c4b5fd',
    match: [['performance limit', 'voltage'], ['performance limit', 'reliability']],
    exclude: ['power', 'thermal', 'util'],
    plain: 'Yes/No flag: clocks held back by the voltage/reliability limit (Vrel) — the card reached its allowed voltage.',
    normal: 'Common at max boost on a healthy card.',
    concern: 'Mostly informational; combined with power-limit flags it tells you the card is simply at its design ceiling, not failing.',
  },
  {
    key: 'perfLimitUtil', label: 'Perf Limit · Utilization', unit: '', kind: 'limit', color: '#94a3b8',
    match: [['performance limit', 'utilization']],
    exclude: ['power', 'thermal', 'voltage'],
    plain: 'Yes/No flag: clocks dropped because there was not enough work (utilization limit) — the GPU down-clocked to save power.',
    normal: 'Active at idle and in light scenes. Expected.',
    concern: 'If it is active while a game stutters at low FPS, the GPU is down-clocking when it should be boosting — a driver power-state problem.',
  },
  // ── Framerate ─────────────────────────────────────────────
  {
    key: 'fps', label: 'Framerate (FPS)', unit: 'FPS', kind: 'fps', color: '#4ade80',
    match: [['framerate'], ['frame rate'], ['fps']],
    exclude: ['min', 'max', 'avg', '1%', '0.1', 'time', 'presented'],
    plain: 'Frames rendered per second (needs RTSS / PresentMon feeding HWiNFO).',
    normal: 'Whatever your game targets.',
    concern: 'Dropping to 0 and staying there while the app is open is the clearest "the GPU stopped rendering" marker.',
  },
  {
    key: 'frameTime', label: 'Frame Time', unit: 'ms', kind: 'fps', color: '#86efac',
    match: [['frame time'], ['frametime']],
    exclude: ['min', 'max', 'avg'],
    plain: 'Milliseconds to render each frame (lower and flatter is smoother).',
    normal: '16.7 ms = 60 FPS · 8.3 ms = 120 FPS.',
    concern: 'Tall spikes = stutter. A flatline followed by a gap = a hang.',
  },
  // ── CPU / system (to prove the PC stayed alive) ───────────
  {
    key: 'cpuLoad', label: 'Total CPU Usage', unit: '%', kind: 'cpu', color: '#c084fc',
    match: [['total cpu usage'], ['cpu total'], ['cpu', 'usage', 'total']],
    plain: 'Overall CPU utilization. LogScope uses it to check the PC stayed alive during a GPU freeze.',
    normal: 'Varies wildly by task.',
    concern: 'If the CPU keeps logging normally while every GPU sensor freezes, the GPU died but the PC did not — a textbook hardware hang.',
  },
  {
    key: 'cpuTemp', label: 'CPU Package Temperature', unit: '°C', kind: 'cpu', color: '#e879f9',
    match: [['cpu package'], ['cpu', 'temperature'], ['core temperatures']],
    exclude: ['gpu', 'power', 'limit'],
    plain: 'CPU package temperature.',
    normal: 'Idle 35–55 °C · load 60–90 °C.',
    concern: 'Usually unrelated to a GPU crash, but useful to rule the CPU in or out.',
  },
  {
    key: 'cpuPower', label: 'CPU Package Power', unit: 'W', kind: 'cpu', color: '#d8b4fe',
    match: [['cpu package power'], ['cpu', 'power'], ['package power']],
    exclude: ['gpu', 'limit'],
    plain: 'CPU power draw. Combined with GPU power it estimates total system pull on the PSU/UPS.',
    normal: 'Idle 20–60 W · load up to the CPU limit.',
    concern: 'Simultaneous CPU + GPU spikes can trip an undersized PSU or UPS on a transient.',
  },
];

/* Load-zone thresholds (based on GPU utilization %). */
LS.LOAD_ZONES = [
  { key: 'idle', label: 'Idle', min: 0, max: 15, cls: 'zone-idle', rgba: 'rgba(148,163,184,0.10)' },
  { key: 'low', label: 'Low', min: 15, max: 50, cls: 'zone-low', rgba: 'rgba(34,197,94,0.08)' },
  { key: 'medium', label: 'Medium', min: 50, max: 85, cls: 'zone-medium', rgba: 'rgba(245,158,11,0.09)' },
  { key: 'high', label: 'High', min: 85, max: 101, cls: 'zone-high', rgba: 'rgba(225,29,72,0.10)' },
];

/* ── Tutorials: short, to the point, "what to look for" ──── */
LS.TUTORIALS = [
  {
    tool: 'HWiNFO64', tag: 'logging',
    what: 'The sensor logger that produces the CSV you drop here. Free, Windows.',
    steps: [
      'Open HWiNFO in <strong>Sensors-only</strong> mode.',
      'Click the <strong>logging</strong> button (the ▶ / floppy icon at the bottom) and pick a CSV path.',
      'Set the polling interval to <strong>1000 ms</strong> (1s) — fine enough to catch a crash without huge files.',
      'Reproduce the problem (play the game, sit at idle, etc.), then stop logging.',
    ],
    lookFor: 'The <strong>last rows before the file ends</strong>. If GPU sensors freeze at a fixed value or drop to 0 while the timestamp keeps advancing, the GPU hung. Add RTSS so <code>Framerate</code> is logged too.',
  },
  {
    tool: 'GPU-Z', tag: 'quick check',
    what: 'One-window live view of GPU clocks, temps, power, and PCIe link. Free, Windows.',
    steps: [
      'Open the <strong>Sensors</strong> tab.',
      'Run the <strong>PCIe render test</strong> (the "?" button next to Bus Interface) to force the link to full speed.',
      'Watch <strong>Bus Interface</strong> — it shows the current vs max PCIe generation.',
    ],
    lookFor: 'Bus Interface reading a <strong>lower generation than the card supports</strong>, or the "PerfCap Reason" flags. Good for a 30-second sanity check before deep logging.',
  },
  {
    tool: 'OCCT', tag: 'stress test',
    what: 'Stress + stability tester with a built-in error detector. Free tier, Windows.',
    steps: [
      'Pick the <strong>3D Adaptive</strong> or <strong>VRAM</strong> test.',
      'Run 10–30 minutes and watch the error counter.',
      'Use the <strong>Power</strong> test to hammer the PSU/connector specifically.',
    ],
    lookFor: 'Any <strong>errors reported</strong>, artifacts, or a crash under a controlled load. If OCCT crashes the card at stock, that is strong RMA evidence.',
  },
  {
    tool: 'MSI Afterburner', tag: 'tuning',
    what: 'Adjust core/memory clock offsets and the power limit to test stability. Free, Windows.',
    steps: [
      'Lower the <strong>Power Limit</strong> slider (e.g. to 80 %) and Apply.',
      'Try a negative <strong>Core Clock</strong> / <strong>Memory Clock</strong> offset (e.g. -300 MHz) to under-clock.',
      'Re-run your log and confirm in HWiNFO that clocks actually dropped.',
    ],
    lookFor: 'Whether crashes <strong>stop</strong> after reducing power/clocks. If they persist even heavily underclocked, the silicon is likely faulty, not overdriven.',
  },
  {
    tool: 'Windows Event Viewer', tag: 'crash log',
    what: 'The OS record of what failed and exactly when. Built into Windows.',
    steps: [
      'Press <code>Win+R</code>, type <code>eventvwr.msc</code>.',
      'Go to <strong>Windows Logs → System</strong>.',
      'Sort by time and match entries to your crash timestamp.',
    ],
    lookFor: 'Sources <code>nvlddmkm</code> / <code>Display</code> (driver reset, TDR) and especially <strong>LiveKernelEvent 141</strong> (Hardware error). A 141 at your crash time is official proof of a GPU hardware fault.',
  },
  {
    tool: 'Reliability Monitor', tag: 'timeline',
    what: 'A friendlier, visual timeline of crashes and hardware errors. Built into Windows.',
    steps: [
      'Open Start, search <strong>"Reliability"</strong>, open <em>View reliability history</em>.',
      'Click a day with a red ✗ to expand the events.',
      'Use <strong>View all problem reports</strong> for the full list.',
    ],
    lookFor: '<strong>Hardware error</strong> rows and <code>LiveKernelEvent</code> codes (e.g. 141, 1B8). Screenshot these — they are gold for an RMA claim.',
  },
];
