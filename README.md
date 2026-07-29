<div align="center">

# LogScope

Drop a HWiNFO CSV, see your GPU's story — load baselines, plain-language metrics, and the crash, all in your browser.

[![Live][badge-site]][url-site]
[![HTML5][badge-html]][url-html]
[![CSS3][badge-css]][url-css]
[![JavaScript][badge-js]][url-js]
[![Claude Code][badge-claude]][url-claude]
[![License][badge-license]](LICENSE)

[badge-site]:    https://img.shields.io/badge/live_site-0063e5?style=for-the-badge&logo=googlechrome&logoColor=white
[badge-html]:    https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white
[badge-css]:     https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white
[badge-js]:      https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black
[badge-claude]:  https://img.shields.io/badge/Claude_Code-CC785C?style=for-the-badge&logo=anthropic&logoColor=white
[badge-license]: https://img.shields.io/badge/license-MIT-404040?style=for-the-badge

[url-site]:   https://logscope.neorgon.com/
[url-html]:   #
[url-css]:    #
[url-js]:     #
[url-claude]: https://claude.ai/code

</div>

---

## Overview

LogScope turns a raw HWiNFO64 sensor log into something you can actually read. Drop a CSV and it auto-detects the
GPU, CPU, and PCIe sensors, buckets every sample into idle/low/medium/high load zones, and gives you a plain-language
verdict — including whether the log shows a GPU **hang signature** (sensors freezing while the CPU keeps logging).
Everything runs client-side; your logs never leave your machine.

**Live:** logscope.neorgon.com

---

## Features

- **Local CSV upload** -- drag-and-drop a HWiNFO log; parsing, analysis, and charts all run in the browser, nothing uploaded.
- **Bundled samples** -- three real (trimmed) crash logs built in — idle freeze, PCIe instability, and crash-under-load — so you can explore the tool with no file of your own.
- **Auto insights** -- crash/hang detection, PCIe link recovery tracking, 12V rail sag, and thermal checks as ranked cards.
- **Interactive charts** -- overlay any detected sensors on a normalized time series with load-zone shading and a hang marker.
- **Load baselines** -- per-zone average/peak for each sensor so you can tell "normal under load" from a real anomaly.
- **Translate glossary** -- what each cryptic metric means, its normal range, and the red flags; tagged with your log's values.
- **Tool tutorials** -- short guides for HWiNFO, GPU-Z, OCCT, Afterburner, Event Viewer, and Reliability Monitor, each with the one thing to look for.

---

## Running locally

LogScope uses plain (non-module) scripts, so it works two ways.

**Just open it:** double-click `index.html` — it loads straight from `file://`.

**Or serve it** (nicer for dev):

```bash
make serve
```

Or manually:

```bash
python3 -m http.server 8826
```

---

## Architecture

```
logscope-site/
├── index.html              # HTML shell + tab views (the tool itself)
├── app/
│   ├── css/
│   │   └── style.css       # Neorgon design system + LogScope styles
│   └── js/
│       ├── glossary.js     # Sensor dictionary (detection + translations) + tutorials
│       ├── samples.js      # Bundled real logs (trimmed to sensor columns) for the demo
│       ├── parse.js        # CSV parsing, HWiNFO sensor detection, load zones
│       ├── analyze.js      # Baselines, crash detection, insight generation
│       ├── charts.js       # Dependency-free canvas time-series chart
│       ├── ui.js           # Rendering + events
│       └── app.js          # Entry point
├── favicon.ico
├── energon-classic-logo.png
├── robots.txt
├── sitemap.xml
├── Makefile
└── README.md
```

---

## Notes

- **How a hang is detected:** LogScope flags a crash when several GPU signals (clock, load, power, temps, FPS) freeze or
  drop out at the tail of the log after varying normally before that. If CPU sensors keep changing through the freeze, it
  reports "PC alive" — the GPU died but the machine did not.
- **Load zones** are computed from GPU utilization (or GPU power if no utilization sensor is present): idle <15%, low 15–50%,
  medium 50–85%, high 85–100%.
- **Get FPS in your log** by running RTSS or PresentMon alongside HWiNFO so it records `Framerate` — the clearest crash tell.

---

<div align="center">
<sub>Part of <a href="https://neorgon.com/">Neorgon</a></sub>
</div>
