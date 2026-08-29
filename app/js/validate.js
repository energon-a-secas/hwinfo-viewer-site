/* ── HWiNFO Viewer: the validation toolkit (Validate tab) ──────
 * Data for the guide/reference area: a phased PC-validation workflow,
 * from capturing the log to an RMA-grade evidence pack.
 *   phases[] — ordered workflow; each tool card carries what it proves.
 *   xid[]    — the NVIDIA Xid error codes worth knowing, with verdicts.
 */
window.LS = window.LS || {};

LS.VALIDATE = {
  phases: [
    {
      title: 'Capture the log',
      intro: 'Everything starts with a good recording: the CSV this site reads.',
      tools: [
        {
          name: 'HWiNFO64', cost: 'free', url: 'https://www.hwinfo.com/download/',
          what: 'The sensor logger that produces the CSV you drop here.',
          steps: [
            'Sensors-only mode, logging on, <strong>1000 ms</strong> polling.',
            'In sensor settings, also enable the <strong>GPU Performance Limit</strong> flags. They record <em>why</em> clocks dropped, not just that they did.',
          ],
          proves: 'The timeline itself: temps, power, rails, clocks, and the moment of the crash.',
          tutorial: true,
        },
        {
          name: 'RTSS / PresentMon', cost: 'free', url: 'https://github.com/GameTechDev/PresentMon',
          what: 'Frame-rate capture that feeds <code>Framerate</code> into HWiNFO (RTSS ships with MSI Afterburner).',
          steps: [
            'Run RTSS or PresentMon alongside HWiNFO while you reproduce the problem.',
            'Confirm HWiNFO shows a <code>Framerate</code> sensor before you start.',
          ],
          proves: 'The clearest crash tell: FPS dropping to 0 and staying there means the GPU stopped rendering.',
        },
      ],
    },
    {
      title: 'Stress it on demand',
      intro: 'Reproduce the fault under a controlled load. A crash you can trigger is a crash you can prove.',
      tools: [
        {
          name: 'OCCT', cost: 'free', url: 'https://www.ocbase.com/',
          what: 'Stress tester with built-in error detection: 3D Adaptive, VRAM, and a PSU-hammering Power test.',
          steps: [
            '<strong>3D Adaptive</strong> or <strong>VRAM</strong>, 10–30 min, watch the error counter.',
            '<strong>Power</strong> test to hammer the PSU/connector specifically.',
          ],
          proves: 'Errors, artifacts, or a crash at stock clocks under controlled load, strong RMA evidence.',
          tutorial: true,
        },
        {
          name: '3DMark: Steel Nomad / Speed Way', cost: 'paid', url: 'https://www.3dmark.com/',
          what: 'The benchmark vendors recognize. Its Stress Test loops a benchmark 20 times and scores frame-rate stability.',
          steps: [
            'Run the <strong>Stress Test</strong> (20 loops) at stock clocks.',
            'Read the <strong>Frame Rate Stability</strong> percentage at the end.',
          ],
          proves: 'A stability score under 97% at stock is a clean, quotable failure number for an RMA, more "real-world" than a synthetic power virus.',
        },
        {
          name: 'MemtestVulkan', cost: 'free', url: 'https://github.com/GpuZelenograd/memtest_vulkan',
          what: 'Hammers only the VRAM (open source; OCCT’s VRAM test is the all-in-one alternative).',
          steps: [
            'Run 10+ minutes and watch for any error line.',
            'Pair it with the Memory Junction temps from your log.',
          ],
          proves: 'A memory-specific fault: the direct evidence you want when the Memory Junction sensor was the suspect.',
        },
      ],
    },
    {
      title: 'Confirm the fault',
      intro: 'Counters and OS records raised by the hardware itself, not software guesses.',
      tools: [
        {
          name: 'nvidia-smi', cost: 'built-in', url: 'https://developer.nvidia.com/system-management-interface',
          what: 'NVIDIA’s own management tool, installed with the driver. Reads hardware counters no other tool sees.',
          steps: [
            'Run the ECC query after a crash or stress test, accumulated errors are direct memory-fault evidence.',
            'The performance query shows <strong>Clocks Event Reasons</strong> (SwPowerCap, HwThermalSlowdown, HwPowerBrakeSlowdown), hardware-confirmed throttle causes.',
          ],
          commands: [
            { cmd: 'nvidia-smi -q -d ECC', note: 'VRAM error counters + retired pages' },
            { cmd: 'nvidia-smi -q -d PERFORMANCE', note: 'throttle reasons / clocks events' },
            { cmd: 'journalctl -k | grep -i xid', note: 'Linux: Xid hardware errors' },
          ],
          proves: 'Hardware-raised evidence: ECC error counts, retired pages, and the throttle reasons the GPU itself reported.',
        },
        {
          name: 'Windows Event Viewer', cost: 'built-in', url: null,
          what: 'The OS record of what failed and when: including NVIDIA <strong>Xid</strong> hardware errors (see the table below).',
          steps: [
            '<code>eventvwr.msc</code> → Windows Logs → System, sorted by time.',
            'Match <code>nvlddmkm</code> entries and <strong>LiveKernelEvent 141</strong> to your crash timestamp.',
          ],
          proves: 'Xid 79 (“GPU fell off the bus”) or a LiveKernelEvent 141 at crash time is official, timestamped proof of a hardware fault.',
          tutorial: true,
        },
        {
          name: 'WhoCrashed / BlueScreenView', cost: 'free', url: 'https://www.nirsoft.net/utils/blue_screen_view.html',
          what: 'Parse the Windows minidumps from a full crash (BSOD or hard reset) into a readable verdict.',
          steps: [
            'Point it at <code>C:\\Windows\\Minidump</code>.',
            'Read the bugcheck code and the blamed driver (<code>nvlddmkm.sys</code> = NVIDIA).',
          ],
          proves: 'The exact “who” when the whole PC went down, complements Event Viewer with the precise driver and bugcheck.',
        },
      ],
    },
    {
      title: 'Rule out software',
      intro: 'Cheap to test, and vendors will ask anyway, do it before blaming the silicon.',
      tools: [
        {
          name: 'DDU: Display Driver Uninstaller', cost: 'free', url: 'https://www.guru3d.com/download/display-driver-uninstaller-download/',
          what: 'Wipes every trace of the GPU driver so the reinstall is genuinely clean.',
          steps: [
            'Boot into <strong>Safe Mode</strong>, run DDU, clean and restart.',
            'Install the latest driver fresh: no “upgrade” install.',
          ],
          proves: 'If crashes survive a DDU-clean driver at stock clocks, software is off the suspect list.',
        },
        {
          name: 'MSI Afterburner', cost: 'free', url: 'https://www.msi.com/Landing/afterburner',
          what: 'Power-limit and clock-offset control to test stability margins.',
          steps: [
            'Power limit to <strong>80%</strong>, core <strong>-300 MHz</strong>, memory <strong>-300 MHz</strong>.',
            'Re-log here and confirm the clocks actually dropped.',
          ],
          proves: 'Crashes that stop when starved = power delivery. Crashes that persist heavily underclocked = likely faulty silicon.',
          tutorial: true,
        },
      ],
    },
    {
      title: 'Power & the RMA pack',
      intro: 'If it died on a UPS, close that loop: then bundle the evidence.',
      tools: [
        {
          name: 'Wall meter / UPS software', cost: 'paid', url: 'https://www.apc.com/us/en/product-category/ups-management-software/',
          what: 'A plug-in watt meter (e.g. Kill A Watt) or your UPS vendor’s monitoring app shows real draw vs capacity.',
          steps: [
            'Measure wall draw while gaming: compare it to the UPS <strong>watt</strong> rating, not the VA figure (watts ≈ VA × 0.6 on many units).',
            'Replay the crash scenario and watch whether the UPS reports overload or drops to battery.',
          ],
          proves: 'Whether the shutdown was the UPS tripping on a transient, clearing (or convicting) the GPU. Use the “Peak system draw” number from your Overview tab.',
        },
        {
          name: 'RMA evidence checklist', cost: 'free', url: null,
          what: 'What support actually wants to see, gathered in one pass:',
          steps: [
            'Screenshot: Xid rows in Event Viewer, and any <strong>LiveKernelEvent 141</strong>.',
            'Screenshot: OCCT errors or the 3DMark stability score at <strong>stock</strong> clocks.',
            'Export: this site’s <strong>Overview</strong> verdict and the chart with the hang marker.',
            'Note: DDU-clean driver version, and that the fault persists at stock.',
          ],
          proves: 'A claim that survives the vendor’s “have you tried updating drivers?” first line of defense.',
        },
      ],
    },
  ],

  /* NVIDIA Xid codes worth knowing. points: software | hardware | power. */
  xid: [
    { code: '13', meaning: 'Graphics engine exception', points: 'software', note: 'Usually the game or driver: unless it repeats at stock.' },
    { code: '31', meaning: 'GPU memory page fault', points: 'software', note: 'Often an app bug; recurring faults at stock can mean VRAM.' },
    { code: '43', meaning: 'GPU stopped processing', points: 'software', note: 'App-triggered reset; suspicious if it happens across apps.' },
    { code: '61', meaning: 'Internal micro-controller warning', points: 'hardware', note: 'Firmware-level fault on the card itself.' },
    { code: '62', meaning: 'Internal micro-controller halt', points: 'hardware', note: 'Strong hardware-failure indicator.' },
    { code: '63 / 64', meaning: 'ECC page retirement recorded / failed', points: 'hardware', note: 'VRAM cells wearing out: direct memory evidence.' },
    { code: '74', meaning: 'NVLink error', points: 'hardware', note: 'Link or card fault on multi-GPU links.' },
    { code: '79', meaning: 'GPU has fallen off the bus', points: 'power', note: 'The big one: power delivery, PCIe link, or dead card. Check rails and reseat everything.' },
    { code: '94', meaning: 'Contained ECC error', points: 'hardware', note: 'Memory errors the card contained: watch the trend.' },
    { code: '119 / 120', meaning: 'GSP RPC timeout / GSP firmware error', points: 'hardware', note: 'Driver or firmware fault; on 50-series, update firmware + driver first.' },
  ],
};
