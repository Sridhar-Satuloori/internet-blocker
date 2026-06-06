# Internet Blocker

A lightweight Electron app for Windows that blocks outbound internet access after a focus timer, on a daily schedule, or both.

## How it works

1. **Focus timer** — set minutes until internet is blocked, then start the timer.
2. **Daily schedule** — block and unblock at fixed times each day (overnight windows like 22:00 → 07:00 are supported).
3. **Password protection** — optional password required for manual early unblock (scheduled unblocks still run automatically).
4. **Block targets** — block all internet, specific apps, and/or websites.
5. **System tray** — shield icon changes color: green (ready), amber (timer running), red (blocked).

Blocking uses **Windows Firewall** (`netsh advfirewall`) for apps and full internet, and the **hosts file** for websites.

## Requirements

- **Windows 10/11** for blocking (UI runs on macOS/Linux for development)
- **Administrator privileges** to create or remove firewall rules

## Setup

```bash
cd ~/src/internet-blocker
npm install
npm run generate-icons   # optional if assets/ already present
npm start
```

On Windows, run as Administrator the first time, or click **Run as Administrator** in the UI.

## Build for Windows

```bash
npm install --save-dev @electron/packager
npx electron-packager . InternetBlocker --platform=win32 --arch=x64 --out=dist
```

Run `dist/InternetBlocker-win32-x64/InternetBlocker.exe` as Administrator.

## Configuration

| Setting | Description |
|---------|-------------|
| Block after (minutes) | Focus timer delay (default: 30) |
| Block all internet | Global outbound firewall block (default: on) |
| Blocked apps | Per-app outbound firewall rules (`.exe` paths) |
| Blocked websites | Domain blocks via hosts file + optional domain packs |
| DNS filtering | Temporarily sets family-safe DNS on active adapters |
| Installed games | Scan and block game `.exe` files (inbound + outbound) |
| Daily schedule | Block/unblock at fixed times daily |
| Unblock password | Protects manual unblock only |
| Auto-start timer | Start focus timer on launch |
| Minimize to tray | Keep running in tray when window is closed |

Settings are stored in the Electron user data folder. Passwords are hashed with scrypt — only the hash is saved.

## Tray icon

Icons live in `assets/`:

- `tray-normal.png` — green shield (ready)
- `tray-running.png` — amber shield (timer active)
- `tray-blocked.png` — red shield (internet blocked)

Regenerate with `npm run generate-icons` or `python3` using `scripts/generate-icons.js` as reference.

## Resource usage

- Plain HTML/CSS/JS renderer (no React/Vue)
- System tray when minimized
- Focus timer uses native `setTimeout` / `setInterval` only while active
- Daily scheduler uses one `setTimeout` to the next block or unblock event
- Firewall changes happen only at block/unblock time

## Where rules are applied (Windows)

**Firewall (Outbound Rules in `wf.msc`):**
- `InternetBlocker-BlockOutbound` — blocks all outbound traffic (when enabled)
- `InternetBlocker-AllowSelf` — allows this app through
- `InternetBlocker-App-{id}-tcp` / `-udp` — blocks a specific `.exe`

**Hosts file (`C:\Windows\System32\drivers\etc\hosts`):**
- Entries between `# InternetBlocker START` and `# InternetBlocker END`
- **YouTube pack** adds ~20 related domains (video CDN, API, image hosts)

**DNS (active network adapters):**
- Temporarily switches DNS to a family-safe provider (Cloudflare, OpenDNS, or AdGuard)
- Original DNS settings are backed up and restored on unblock

**Games:**
- Scans Steam libraries, uninstall registry, Epic/EA/Riot/Ubisoft folders
- Blocked games get inbound **and** outbound firewall rules on their main `.exe`

## Recommended YouTube setup

1. Click **Add YouTube pack (~20 domains)**
2. Enable **Also use family-safe DNS while blocking**
3. Optionally uncheck **Block all outbound internet** if you only want YouTube blocked

This combines hosts blocking for YouTube-specific domains with DNS filtering for broader coverage.

## Security note

This app modifies Windows Firewall rules and the system hosts file. Only run it if you trust the source. Manual unblock removes the rules and hosts entries it created. Scheduled unblocks do not require a password.
