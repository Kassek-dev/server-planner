# Changelog

All notable changes to Server Planner. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/) — 1.0.0 is the completed MVP.

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

[1.0.0]: https://github.com/Kassek-dev/server-planner/releases/tag/v1.0.0
