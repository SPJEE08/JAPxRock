# JAPxRock · The Autonomous AI DJ & YouTube Music Hook Sequencer

> 🌐 **Live Website:** [https://spjee08.github.io/JAPxRock/](https://spjee08.github.io/JAPxRock/)  
> **100% Open Source · Serverless · GitHub Pages Hosted · Zero API Keys Required**

**JAPxRock** is a serverless, dual-deck party DJ and automated music sequencing engine. Tell JAPxRock the vibe of the room or paste any YouTube / YouTube Music playlist or song link, and it dynamically mixes the set: party tracks that drop straight into the best verse/hook and crossfade seamlessly into the next.

[![Deploy to GitHub Pages](https://github.com/SPJEE08/JAPxRock/actions/workflows/deploy.yml/badge.svg)](https://github.com/SPJEE08/JAPxRock/actions/workflows/deploy.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![React 19](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178c6.svg)](https://www.typescriptlang.org/)
[![Vite 8](https://img.shields.io/badge/Vite-8-646cff.svg)](https://vite.dev/)

---

## ✨ Features

- **🚀 100% Serverless & GitHub Pages Native:** Built as a pure static single-page application (SPA). Requires no Node.js backend server or databases to host.
- **🔑 Zero API Key Dependency:** Runs completely out-of-the-box without requiring personal or private API keys. YouTube metadata is resolved via public cross-origin oEmbed and a bundled 1,346-song database.
- **🎛 Dual-Deck YouTube IFrame Engine:** State machine orchestrating two synchronized YouTube players (`Deck A` and `Deck B`) across `empty → loading → ready → live` with sub-second cueing.
- **📈 Mathematical Hook Optimization ($J$ Objective):**
  - **Savitzky-Golay / Gaussian Smoothing ($\sigma=2.0$):** Convolves YouTube's 100-point replay distribution $\tilde{H} = H * G_\sigma$ to eliminate transient noise spikes.
  - **Half-Wave Rectified Spectral Novelty Flux ($\Delta^+ H$):** $\Delta^+ H[i] = \max(0, \tilde{H}[i] - \tilde{H}[i-1])$ isolates beat drops and chorus attacks with a 2-second musical phrase pre-roll.
  - **Bimodal Structural Prior:** Models song architecture where Chorus 1 (~27%) and Chorus 2 (~56%) maximize hook engagement.
- **🔊 $C^2$ Quintic Smoothstep Equal-Power Crossfader:**
  - Standard linear fades suffer an acoustic $-3\text{ dB}$ power dip at midpoint. JAPxRock enforces constant acoustic power via orthogonal trigonometric identities:
    $$V_{\text{in}}(s) = \text{round}(100 \cdot \sin(s \cdot \pi / 2))$$
    $$V_{\text{out}}(s) = \text{round}(100 \cdot \cos(s \cdot \pi / 2))$$
    $$\sin^2(\theta) + \cos^2(\theta) = 1.0000$$
  - Applies Perlin's $C^2$-continuous quintic polynomial $\sigma_5(s) = 6s^5 - 15s^4 + 10s^3$ to eliminate slope discontinuities at crossfade boundaries.
- **📋 Custom Playlist Manager & YouTube Playlist Saver:**
  - Save any YouTube / YouTube Music playlist directly to your local library.
  - Create new custom playlists from scratch, reorder tracks via drag & drop or controls, and customize entry/exit hook points.
  - **▶ Open in YouTube:** Export any set or queue to an instant YouTube playlist via `https://www.youtube.com/watch_videos?video_ids=...`.
  - **💾 JSON Backup:** Export and import playlists and sets as portable JSON files.
- **🎙 Context-Aware AI DJ Commentary:**
  - Built-in charismatic, dynamic party commentary engine that announces transitions based on vibe, energy trajectory, and time of night.
  - *Optional:* Users can optionally paste their personal free Google Gemini API key into client-side `localStorage` via the in-app **✨ AI DJ** settings modal for generative commentary.
- **🔬 REA (Reverse Engineer Anything) Dossier:** Interactive mathematical sandbox and complete decompilation analysis of audio signal algorithms.

---

## 🚀 Quickstart & Local Development

### Prerequisites
- [Node.js](https://nodejs.org/) (v20+ recommended)
- `npm` (v10+)

### Setup

```bash
# 1. Clone repository
git clone https://github.com/SPJEE08/JAPxRock.git
cd JAPxRock

# 2. Install dependencies
npm install

# 3. Start local development server
npm run dev
```

Visit `http://localhost:5173` in your browser.

### Run Tests & Verification

```bash
# Run unit test suite (MIR signal processing, equal-power crossfader, TSP sequencing)
npm test

# Run TypeScript type check
npm run lint

# Build static production bundle
npm run build
```

---

## 📜 Mathematical Formulas

### 1. Equal-Power Audio Transition Gain
For normalized crossfade position $s \in [0, 1]$ and Perlin $C^2$ smoothstep $\theta(s) = \sigma_5(s) \cdot \frac{\pi}{2}$:
```math
V_{\text{in}}(s) = \sin\left((6s^5 - 15s^4 + 10s^3) \cdot \frac{\pi}{2}\right)
```
```math
V_{\text{out}}(s) = \cos\left((6s^5 - 15s^4 + 10s^3) \cdot \frac{\pi}{2}\right)
```

### 2. Bimodal Structural Hook Prior
Models chorus drops at $u_1 = 0.27$ and $u_2 = 0.56$ with Gaussian mixture:
```math
P_{\text{pos}}(u) = 0.65 \cdot \exp\left(-\frac{(u - 0.27)^2}{2 \cdot 0.08^2}\right) + 0.35 \cdot \exp\left(-\frac{(u - 0.56)^2}{2 \cdot 0.09^2}\right)
```

---

## 📄 License

Licensed under the [Apache License, Version 2.0](LICENSE).
Feel free to fork, customize, and run your own parties!
