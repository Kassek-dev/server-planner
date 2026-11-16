# Changelog

All notable changes to Server Planner. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/) — 1.0.0 is the completed MVP.

## [1.6.0] — 2026-11-16

Try a change before you buy it, configure the hardware inside your devices, and plan IPv6 next to IPv4.

### Features

- **Project variants** — "Create variant" copies the project as a variant linked to it; edit it freely and open Compare to see both side by side: cores, memory, storage, allocation, issues, idle power and cost, the parts to buy (new devices, more memory, new disks, GPUs, another CPU) and every change (#53).
- **Hardware configurator** — an Expansion section in the Hardware tab: PCIe and M.2 slots and SATA bays (filled in from the catalog model), what uses them, and add-in cards — network cards from 1 to 25 GbE add their own ports, plus storage controllers and M.2 adapters. New issues for more memory than the board takes, more memory modules than slots and more cards or drives than slots (#54).
- **IPv6** — dual-stack planning: IPv6 subnets next to the IPv4 subnet of a VLAN with their router advertisement mode (SLAAC, DHCPv6 or none), an IPv6 address row on interfaces (static, SLAAC, DHCPv6), IPv6 subnets in the IP plan, checks for SLAAC and DHCPv6 that do not match the subnet, and IPv6 in the exported host network configuration. The simulation still works on IPv4 (#55).

### Project file

- Schema version 3 (add-in cards, expansion slots, SLAAC). Files from earlier versions open and upgrade automatically; projects saved in the browser need no upgrade. Version 1.5 and older cannot open files saved by 1.6 (#54).

### Other

- The view tabs no longer wrap on narrower screens; below 1536 px the save status shows as its LED (#53).

## [1.5.0] — 2026-11-16

A map of your services, labels to stick on cables and devices, and a sharper failure analysis.

### Features

- **Services map** — a new Services view: host names from reverse proxy routes and local DNS records, the proxies, the apps and what they depend on, from left to right and grouped by host; required dependencies without a provider stand out. Click an app to open it, a name to edit Proxy & DNS (#49).
- **Label printing** — print cable labels (one for each end, if you like) and device labels on common A4 sheets of self-adhesive labels, skipping labels already used on a sheet; save as PDF from the print dialog (#50).
- **Single points of failure** — "Infrastructure only" (on by default) hides devices and single cables whose failure only cuts off that device and what runs on it (#48).
- **Flows through a reverse proxy** — a client opening an app behind a proxy route goes to the proxy first (HTTPS or HTTP), then the proxy to the app; the firewall is checked on both legs (#48).
- **More CPUs** — 65 more homelab CPUs in the catalog (111 in total; Intel T-series, mobile and Xeon, AMD Ryzen mobile and desktop), 82 with measured performance (#51).

## [1.4.0] — 2026-11-16

What happens when something breaks, configuration you can copy to your hosts, and a front view of your racks.

### Features

- **Failure analysis** — a Failures tab in the simulation panel: take devices or cables down, or cut the power (only devices on a UPS keep running), and see who loses the internet, which apps go down or are cut off from clients, and which network assertions change. "Find single points of failure" lists every device and cable whose failure alone cuts something off, most damaging first; the canvas shows what failed and what it cuts off (#44).
- **Network configuration export** — `/etc/network/interfaces` for Proxmox VE (bridges, VLAN-aware) and Debian, Netplan for Ubuntu Server, and DHCP reservations as dnsmasq `dhcp-host` lines. Names from imported projects cannot add lines to the files (#45).
- **Rack front view** — a drawing of the rack in real proportions with devices, shelves and free units; download it as SVG or PNG, or print it for the rack door (#46).

## [1.3.0] — 2026-11-16

Easier hardware entry — disks, storage pools and predefined parts — and a maintenance pack.

### Features

- **Disks and storage pools** — add several identical disks at once (e.g. 4 × 8 TB HDD); a new pool takes the free disks with a layout suited to their number and shows its usable and raw capacity, or why it cannot hold data. A new issue reports pools with fewer disks than their RAID layout needs (#41).
- **Predefined parts** — pick CPUs (46, most with measured performance) and GPUs or AI accelerators (18) from the catalog, memory kits (DDR3–DDR5) and common disks from built-in lists; manual entry stays (#41).
- **Documentation export** — the Markdown export lists reverse proxy routes and local DNS records (#42).
- **Flows** — the DNS step shows the local name of the target and asks the DNS server its record names (#42).

### Fixes

- Wi-Fi client isolation is simulated: stations on an isolating SSID no longer reach each other directly (#42).
- An open tab of an older version no longer blocks a newer version from upgrading the browser database (#42).

## [1.2.0] — 2026-11-15

Finishes the planned features of the 1.x line: cable routing, moving workloads, reverse proxies and local DNS, defaults for new projects and a better phone view.

### Project file format

- **Schema version 2.** Projects gain reverse proxy routes and local DNS records. Files from 1.0 and 1.1 are upgraded automatically on import, and projects and snapshots stored in the browser are upgraded on the first start. Version 1.1 cannot open files saved by 1.2 (#37).

### Features

- **Canvas** — bend points on cables (double-click to add, drag or arrow keys to move, Delete to remove), alignment guides while dragging and "Group by: Location / None" (#35).
- **Software** — move a VM, LXC or container to another host with "Runs on"; virtual NICs, disks and Docker networks follow. New issues when a container image or an OS is not built for the CPU architecture (amd64 / arm64). "Update specification" when the catalog has newer data for a device model (#36).
- **Reverse proxy and local DNS** — host names served by a proxy app (Caddy, Traefik, Nginx Proxy Manager…) and passed to an app port; A and CNAME records. A new Proxy & DNS drawer; the Access view lists the host names behind a forwarded proxy; issues when the proxy cannot reach its app or a name does not point to the proxy (#37).
- **Cable labels** — an own label pattern per project, with a preview (#37).
- **Defaults for new projects** — Settings › Units & costs sets thresholds, overcommit, storage reserve, currency, energy price and the label pattern new projects start with (#38).
- **Locations** — the inspector shows occupied rack units, the power draw of the devices inside and the UPS units that carry them (#38).
- **Device model picker** — filters by CPU architecture, cores, maximum RAM, wired ports, port speed and idle power (#38).
- **Phones** — the issue list opens on the whole screen; Inventory shows cards, the IP plan fits the screen and the access matrix is a list (#39).

### Fixes

- Choosing an issue target could reopen the panel that had just been closed (#39).

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

[1.4.0]: https://github.com/Kassek-dev/server-planner/releases/tag/v1.4.0
[1.3.0]: https://github.com/Kassek-dev/server-planner/releases/tag/v1.3.0
[1.2.0]: https://github.com/Kassek-dev/server-planner/releases/tag/v1.2.0
[1.1.0]: https://github.com/Kassek-dev/server-planner/releases/tag/v1.1.0
[1.0.0]: https://github.com/Kassek-dev/server-planner/releases/tag/v1.0.0
