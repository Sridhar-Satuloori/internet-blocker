# Internet Blocker

A lightweight **Electron** app that helps you stay focused by blocking internet access on a timer, on a daily schedule, or on demand. Block everything, specific apps, websites, or games — with optional password protection and a built-in network speed diagnostic.

Works on **Windows** and **macOS** (administrator / sudo required to apply blocks).

![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Features

| Feature | Description |
|--------|-------------|
| **Focus timer** | Block after N minutes — countdown in the tray |
| **Daily schedule** | Auto block/unblock at set times (e.g. 22:00 → 07:00) |
| **Total blockout** | Cut all outbound internet (strongest mode) |
| **App blocking** | Block specific programs; browse or pick from running apps |
| **Website blocking** | Hosts-file blocks + YouTube domain pack (~20 domains) |
| **DNS filtering** | Family-safe DNS (Cloudflare, OpenDNS, AdGuard) while blocking |
| **Game scanner** | Find installed games and block their network access (Windows) |
| **Network Speed** | Download/upload test, link speed, bottleneck hints (Killer, VPN, etc.) |
| **Password protection** | Optional password for manual unblock |
| **Settings** | Tray behavior, startup, notifications, details bar, confirmations |
| **System tray** | Green = ready, amber = timer, red = blocked |

---

## How blocking works

### Windows
- **Firewall** — `netsh advfirewall` for total blockout and per-app rules
- **Hosts file** — `C:\Windows\System32\drivers\etc\hosts`
- **DNS** — `netsh` to set family-safe DNS on active adapters (restored on unblock)

### macOS
- **Packet filter (pf)** — anchor rules for total blockout and per-app blocks
- **Hosts file** — `/etc/hosts`
- **DNS** — `networksetup` on active network services (restored on unblock)

All blocked websites are written between `# InternetBlocker START` and `# InternetBlocker END` markers so they can be removed cleanly.

---

## Requirements

| | Windows | macOS |
|---|---------|-------|
| **OS** | Windows 10/11 | macOS 11+ |
| **Privileges** | Run as Administrator | Run as Admin (sudo) |
| **Node.js** | 18+ (for development) | 18+ |

---

## Quick start

```bash
git clone https://github.com/Sridhar-Satuloori/internet-blocker.git
cd internet-blocker
npm install
npm start
```

**Windows:** Right-click → Run as Administrator, or use **Run as Admin** in the sidebar.

**macOS:** Click **Run as Admin** in the sidebar (prompts for your password via sudo).

> If `npm start` fails with `app.whenReady is not a function`, the project already uses `env -u ELECTRON_RUN_AS_NODE` in the start script to fix Cursor/IDE env conflicts.

---

## Usage

1. **Overview** — see status, apply or remove all blocks
2. **Total Blockout** — enable/disable global outbound block
3. **Focus Timer** — set minutes, start countdown
4. **Daily Schedule** — enable block window times
5. **Apps** — add `.exe` (Windows) or `.app` (macOS); view running apps and block with one click
6. **Websites & DNS** — add domains, YouTube pack, optional DNS filter
7. **Games** — scan and block installed games (Windows)
8. **Network Speed** — test download/upload, see NIC link speed and likely bottlenecks
9. **Settings** — password, tray, startup, notifications, details bar

### Recommended YouTube-only block

1. Add **YouTube pack (~20 domains)**
2. Enable **family-safe DNS**
3. Uncheck **total blockout** if you only want YouTube blocked

---

## Network Speed

- Measures **download** and **upload** via Cloudflare speed test endpoints
- Shows **Wi-Fi name** or **LAN adapter** (on macOS, Location Services may be required to see the Wi-Fi SSID — use **Allow location access** in the app)
- Detects likely limits: Killer Networking, VPN, 100 Mbps Ethernet link, etc.
- Skips speed test while blocks are active

---

## Configuration

Settings are stored in the Electron user data folder as `config.json`. Passwords are hashed with **scrypt** — only the hash is stored locally.

| Setting | Default | Notes |
|---------|---------|-------|
| Block after (minutes) | 30 | Focus timer |
| Block all internet | on | Total blockout |
| Minimize to tray | on | Window close hides to tray |
| Confirm before unblock | on | Password still applies when set |
| Show details bar | on | Bottom panel shows where rules apply |

---

## Build

### Windows executable

```bash
npm install --save-dev @electron/packager
npx electron-packager . InternetBlocker --platform=win32 --arch=x64 --out=dist
```

Run `dist/InternetBlocker-win32-x64/InternetBlocker.exe` **as Administrator**.

### macOS app bundle

```bash
npm install --save-dev @electron/packager
npx electron-packager . InternetBlocker --platform=darwin --arch=arm64 --out=dist
```

Run the `.app` with admin privileges to apply blocks.

---

## Project structure

```
internet-blocker/
├── main.js              # Electron main process, IPC, tray
├── preload.js           # Secure renderer bridge
├── renderer/            # UI (HTML, CSS, JS)
├── src/
│   ├── firewall.js      # Platform dispatch (Windows / macOS)
│   ├── firewall-windows.js
│   ├── firewall-macos.js
│   ├── hosts.js         # Hosts file read/write
│   ├── dns.js           # DNS switch + restore
│   ├── network-diagnostics.js
│   ├── running-apps.js
│   └── ...
├── scripts/             # PowerShell helpers (Windows)
└── assets/              # Tray icons
```

---

## Resource usage

- Plain HTML/CSS/JS — no React or heavy frameworks
- Timer uses `setTimeout` only while active
- Scheduler uses one timeout to the next event
- Firewall / hosts / DNS changes only at block or unblock time
- Stays in the system tray when minimized

---

## Security note

This app modifies **firewall rules**, the **hosts file**, and **DNS settings**. Only run it if you trust the source. **Remove all blocks** from Overview (or the tray) to restore normal internet access. Scheduled unblocks run automatically and do not require a password.

---

## License

MIT — see [LICENSE](LICENSE) if present, or MIT terms apply to this project.

---

## Author

[Sridhar Satuloori](https://github.com/Sridhar-Satuloori)
