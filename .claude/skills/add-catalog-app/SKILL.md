---
name: add-catalog-app
description: Dodanie lub poprawienie aplikacji w kurowanym katalogu Server Planner — komponenty Docker (single/stack), wymagania zasobów, porty, wolumeny, zależności, wzorce ruchu i przepływy (flows) do symulacji. Użyj, gdy użytkownik chce dodać aplikację self-hosted (np. Immich, Vaultwarden) lub opisać jej ruch sieciowy.
---

# Aplikacja w katalogu

Typy: `docs/02` § 9.2 (CatalogApp, CatalogAppComponent, CatalogLoadProfile), § 9.3 (TrafficPattern, PeerSelector, CatalogFlow). Źródła: `docs/06` § 2. Warstwa kurowana **ma pierwszeństwo** nad importem (awesome-selfhosted, Community Scripts, LinuxServer) — kurujemy to, czego importy nie dają lub dają źle.

## 1. Zbierz fakty

- Oficjalna dokumentacja / `docker-compose.yml` projektu: obrazy, porty, wolumeny, zależności (DB, Redis), architektury.
- Wymagania: dokumentacja → Community Scripts (LXC, przelicz wg `heuristics.yml`) → własne pomiary użytkownika. Źródło zapisz w `source`.
- Ruch: kto łączy się z aplikacją (klienci LAN, Internet), z czym ona się łączy (Internet, DNS, NAS, urządzenia IoT, inne komponenty stosu).

## 2. Plik `catalog/curated/apps/<slug>.yaml`

```yaml
id: immich
name: Immich
description: { en: "High-performance self-hosted photo and video backup." }
categories: [photos]
website: https://immich.app
repository: https://github.com/immich-app/immich
license: AGPL-3.0
source: [curated]
confidence: curated
deployment:
  kind: stack # single | stack
  components:
    - key: server
      name: immich-server
      role: app # app | database | cache | worker | proxy | dns | other (AppInstance['role'])
      image: ghcr.io/immich-app/immich-server
      defaultTag: release
      arch: [amd64, arm64]
      platform: linux
      listeners: [{ port: 2283, protocol: tcp, purpose: web-ui }]
      defaultPortMappings: [{ hostPort: 2283, containerPort: 2283, protocol: tcp }]
      volumes:
        - {
            name: library,
            containerPath: /usr/src/app/upload,
            purpose: media,
            defaultSizeBytes: 500 GB,
          }
    - key: ml
      name: immich-machine-learning
      role: worker
      image: ghcr.io/immich-app/immich-machine-learning
      defaultTag: release
      arch: [amd64, arm64]
      platform: linux
      listeners: [{ port: 3003, protocol: tcp, purpose: ml-api }]
      volumes:
        [{ name: model-cache, containerPath: /cache, purpose: cache, defaultSizeBytes: 5 GB }]
    - key: db
      name: postgres
      role: database
      image: ghcr.io/immich-app/postgres
      defaultTag: "14"
      arch: [amd64, arm64]
      platform: linux
      listeners: [{ port: 5432, protocol: tcp, purpose: postgresql }]
      volumes:
        [
          {
            name: pgdata,
            containerPath: /var/lib/postgresql/data,
            purpose: data,
            defaultSizeBytes: 10 GB,
          },
        ]
    - key: redis
      name: redis
      role: cache
      image: redis
      defaultTag: "7"
      arch: [amd64, arm64]
      platform: linux
      listeners: [{ port: 6379, protocol: tcp, purpose: redis }]
      volumes: []
requirements:
  min: { cpu: 2, memoryBytes: 4 GiB, diskBytes: 10 GB }
  recommended: { cpu: 4, memoryBytes: 6 GiB, diskBytes: 20 GB }
dependencies:
  - { capability: postgresql, optional: false, providedByComponent: db }
  - { capability: redis, optional: false, providedByComponent: redis }
  - { capability: media-storage, optional: true }
provides: []
trafficPatterns:
  - {
      id: web,
      direction: inbound,
      peer: { kind: lan-clients },
      protocol: tcp,
      port: 2283,
      purpose: web-ui,
      required: true,
    }
  - {
      id: ml,
      direction: outbound,
      peer: { kind: self-component, key: ml },
      protocol: tcp,
      port: 3003,
      purpose: ml-api,
      required: false,
    }
  - {
      id: db,
      direction: outbound,
      peer: { kind: self-component, key: db },
      protocol: tcp,
      port: 5432,
      purpose: postgresql,
      required: true,
    }
  - {
      id: models,
      direction: outbound,
      peer: { kind: internet },
      protocol: tcp,
      port: 443,
      purpose: model-download,
      required: false,
    }
flows:
  - id: immich.upload-photo
    name: { en: "Phone uploads a photo" }
    roles:
      - { key: client, name: { en: Phone }, selector: { kind: lan-clients }, userPicks: true }
      - { key: server, name: { en: Immich }, selector: { kind: self }, userPicks: false }
      - {
          key: storage,
          name: { en: Media storage },
          selector: { kind: dependency, capability: media-storage },
          userPicks: true,
        }
    steps:
      - { from: client, to: server, protocol: tcp, purpose: web-ui, resolveDns: true }
      - { from: server, to: storage, protocol: tcp, port: 2049, optional: true }
```
Zasady:

- Wzorce ruchu: `id` unikalne w aplikacji (konwencja `<purpose>-<protocol>-<port>` dla inbound), tak samo `flows[].id`.
- Kontenery w stosie inne niż pierwszy (db, redis, ml) zwykle bez `defaultPortMappings` (`[]`) — są osiągalne tylko w sieci stosu.

- `id` = slug; komponenty `key` krótkie (`server`, `db`, `ml`).
- `purpose` z ustalonego słownika (`web-ui`, `api`, `dns`, `dhcp`, `postgresql`, `redis`, `mqtt`, `smb`, `nfs`, `metrics`, `media-stream`, `model-download`, `update-check`, `device-polling`…) — nowe wartości dopisz do słownika w `packages/model` i `en/simulation.json`.
- Każdy listener → co najmniej jeden `inbound` pattern; każda zależność sieciowa → `outbound`.
- Co najmniej **jeden flow** opisujący główne użycie (FLW‑01); flow kończy się na listenerze aplikacji lub zależności.
- `bandwidth` / `bandwidthMbps` tylko gdy istotne (streaming, backup).
- Bez Dockera (np. Home Assistant OS, Windows): `deployment.native`.

## 3. Walidacja i test

```bash
pnpm catalog:validate
pnpm test --filter engine -- flows      # flow rozwija się w kroki reach() na fixture
```
Dodaj fixture `fixtures/apps/<slug>.json` (mały projekt z aplikacją) i test w `packages/engine`: każdy flow przechodzi (ALLOWED) w otwartej sieci i jest blokowany przez typową regułę IoT→LAN tam, gdzie powinien.

## 4. Zapis

Commit: `feat(catalog): add immich with traffic patterns and upload flow`. Duże zmiany słownika `purpose` → wzmianka w `docs/02` § 9.3.
