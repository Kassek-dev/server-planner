# Changelog

All notable changes to Server Planner. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/) — 1.0.0 is the completed MVP.

## [1.1.0] — 2026-11-12

The first feature release after the MVP: more views, a catalog that updates itself, application flows, access checks, power and capacity planning, snapshots and an installable offline app. Project files are unchanged (schema v1) — files from 1.0.0 open as they are.

### Features

- **Views** — Inventory with sorting, search, grouping and inline edits; IP Plan with subnet cards, DHCP pool usage, duplicates and free ranges (#19).
- **Exports** — CSV of devices, workloads, apps and the IP plan; bill of materials; project documentation as Markdown; `docker-compose.yml` for the containers of a host or a stack (#20).
- **Catalog builder** — weekly workflow that builds the catalog from LinuxServer.io, awesome-selfhosted-data, Proxmox VE Community Scripts and Blender Open Data, with request budgets, a 7-day lock and safeguards against bad data (#22, #23).
- **Catalog in the app** — curated and published catalog merged; in-app updates checked weekly or on demand, verified against SHA-256 and schemas, with Roll back; Settings › Catalog and data source dates in About; measured CPU performance in the device model picker (#24).
- **About 200 home lab apps** — 63 new curated apps, among them Ollama, Open WebUI, authentik, Authelia, Tailscale, Headscale, Beszel, Gatus, Kopia, Forgejo and Matrix Synapse; imports limited to home lab services (#25).
- **Application flows** — step-by-step simulation of what an app does (e.g. login, upload, backup) with DNS hops, participant suggestions and a play / pause timeline on the canvas (#26).
- **Access** — zone × zone and device × device access matrix, what is exposed to the internet through port forwards, network assertions that raise an issue when they break, "Save as assertion" from reachability and a "Typical segmentation" wizard for VLANs (#27).
- **Power and costs** — power draw per device, PoE budgets, UPS load and runtime, monthly energy cost, purchase data and a project Dashboard (#28).
- **Capacity planning** — "Expected" mode from app load profiles next to "Allocated", storage pool growth forecast and GPUs (integrated or passed through) for apps that need them (#29).
- **Productivity** — project templates, a warning when the project is open in another tab, minimap, command palette (Ctrl+K), notes on the canvas and automatic cable labels (#30).
- **Snapshots and templates** — named snapshots with a diff and restore (undoable, optionally included in the JSON export), own device templates, aligning selected devices and straight or angled cables (#31).
- **Offline and mobile** — installable PWA that works offline and offers "Reload" when a new version is ready; a view-only layout for phones with the inspector in a bottom sheet (#33).

### Fixes

- CSV cells that look like formulas are neutralised, and names from imported projects cannot break or escape the generated `docker-compose.yml` (#20, #21).
- The catalog builder reads only regular files inside the extraction folder from downloaded archives (#23).
- Snapshots in an imported file get the same checks as the project, on import and on restore (#32).

### Catalog

- Catalog updated to 2026.46: 195 apps (122 curated, 73 imported), measured CPU scores.

## [1.0.0] — 2026-11-12

First public release: a local-first home lab planner running entirely in the browser.

### Features

- **Projects** — create, rename, duplicate, delete; autosave to IndexedDB with undo/redo; import and export as JSON; project file schema v1 with migrations; backup reminder and persistent-storage request (#6, #7).
- **Canvas** — rooms, shelves and racks with unit slots; rack-mount and standalone devices with ports; drawing cables between devices; selection, duplicate, delete with keyboard shortcuts; project thumbnails (#8).
- **Inspector** — devices (hardware, form factor, location, OS, Docker, VMs, LXC, containers, apps, network interfaces, routes, firewall, NAT, Wi‑Fi), workloads, apps, links and locations (#9).
- **Network** — VLANs, subnets, zones, firewall rules with drag-to-reorder, NAT, tags and project settings drawers (#10).
- **Validation and capacity** — rules for duplicate and out-of-subnet IPs, DHCP overlaps, VLAN mismatches, speed and media, loops, gateways, port conflicts, OS compatibility, capacity and racks, with one-click fixes; recursive CPU, memory and storage capacity per host and VM; Issues panel, status LEDs and RAM bars on tiles (#11).
- **Simulation** — reachability A → B through L2 VLANs, routing, firewall, NAT, Docker publishing and app listeners, with the path highlighted on the canvas and a suggested firewall fix; internet access per device; services visible from a client; link and device colouring by VLAN, speed, zone, tag or capacity (#12).
- **Catalog** — built-in curated catalog of 59 self-hosted apps (images, ports, volumes, requirements, traffic patterns and flows), 19 device models, 11 CPUs and 4 operating systems; device model picker, app catalog with multi-select and an add-app wizard with port conflict hints (#13, #14).
- **Polish** — toasts with Undo for deletions and catalog apps; the first router brings an Internet node; Settings (theme, storage, delete all data) and About (data sources, open-source licenses); export of the canvas as PNG or SVG with a dark or light background (#15, #16).

### Fixes

- Links between devices in the same rack are routed along the right side instead of across the unit numbers (#17).

### Infrastructure

- pnpm monorepo (`apps/web`, `packages/model`, `packages/engine`, `packages/catalog-builder`), Vite, React, TypeScript strict, Biome, Vitest and Playwright; CI on every pull request and automatic deployment to GitHub Pages; Dependabot updates for GitHub Actions (#1–#5).

[1.1.0]: https://github.com/Kassek-dev/server-planner/releases/tag/v1.1.0
[1.0.0]: https://github.com/Kassek-dev/server-planner/releases/tag/v1.0.0
