---
name: add-device-model
description: Dodanie modelu sprzętu do kurowanego katalogu Server Planner — mini PC, serwer, NAS, router, switch, AP, UPS, SBC — wraz z CPU, aliasami nazw CPU dla wydajności (Blender Open Data) i walidacją. Użyj, gdy użytkownik chce dodać urządzenia, modele, procesory do katalogu lub poprawić ich dane.
---

# Nowy model urządzenia w katalogu

Typy: `docs/02-model-danych.md` § 4.1 (Hardware), § 4.3 (FormFactor), § 6.1 (InterfaceKind), § 9.4 (CatalogDevice, CatalogCpu). Źródła i licencje: `docs/06-zrodla-danych.md` § 3.

> Model (konkretny produkt, np. Lenovo M720q) ≠ typ urządzenia (`DeviceKind`, np. `mini-pc`). Nowy **typ** → skill `add-device-kind`.

## 1. Zbierz fakty (ręcznie, ze specyfikacji producenta)

- Wolno: karta produktu / PDF producenta, Wikidata (CC0), własna wiedza użytkownika. Wpisujemy **fakty**, nie kopiujemy baz.
- Nie wolno: automatycznie pobierać z Intel ARK, TechPowerUp, PassMark, UserBenchmark, Geekbench (`06` § 1).
- Brakująca wartość → pomiń pole (nie zgaduj). Wartość szacowana → `confidence: estimated`.

## 2. CPU (jeśli nowy)

Plik `catalog/curated/cpus/<vendor>-<model-slug>.yaml`, np. `intel-core-i5-8500t.yaml`:

```yaml
id: intel-core-i5-8500t
vendor: intel # intel | amd | arm | other
model: Intel Core i5-8500T
cores: 6
threads: 6
baseGhz: 2.1
boostGhz: 3.5
tdpW: 35
arch: amd64 # amd64 | arm64
igpu: { model: Intel UHD Graphics 630, features: [quicksync] }
source: [curated]
confidence: curated
```

- **Nie wpisuj `perf` ręcznie** — wylicza builder z Blender Open Data. Zamiast tego dodaj alias nazwy, jeśli zapis w Blender Open Data różni się od `model`:
  `catalog/curated/cpu-aliases.yml` → `intel-core-i5-8500t: ["Intel Core i5-8500T CPU @ 2.10GHz"]`.
- CPU bez wyników w Blender Open Data dostanie `perf.source: estimated` z heurystyki (`catalog/curated/heuristics.yml`).

## 3. Urządzenie

Plik `catalog/curated/devices/<vendor>-<model-slug>.yaml`, np. `lenovo-m720q.yaml`:

```yaml
id: lenovo-m720q
kind: mini-pc # DeviceKind z docs/02 § 4
vendor: Lenovo
model: ThinkCentre M720q Tiny
formFactor: { mount: standalone, shape: mini-pc }
#   rack:       { mount: rack, units: 1, width: 19in }     # 10in | 19in
#   standalone: shape = tower | mini-pc | desktop | nas | wall | ceiling | sbc | other
hardware:
  cpus: [{ ref: intel-core-i5-8500t }] # odwołanie do catalog/curated/cpus
  memory:
    type: DDR4
    slotsTotal: 2
    maxBytes: 64 GiB
    modules: [{ sizeBytes: 8 GiB, count: 1, speedMts: 2666 }] # typowa konfiguracja fabryczna
  gpus: []
  power: { idleW: 11, loadW: 45 }
  defaultDisks:
    - { name: nvme0, type: ssd-nvme, sizeBytes: 256 GB }
ports:
  - { name: eth0, kind: rj45, speedMbps: 1000 }
expansion: { pcieSlots: 1, m2Slots: 1, sataBays: 1 }
source: [curated]
confidence: curated
```
Konwencje YAML:

- Urządzenia bez CPU w katalogu (switch, router, AP): `hardware: { cpus: [], gpus: [] }` + opcjonalnie `power`.

- Rozmiary jako tekst z jednostką: `8 GiB`, `256 GB`, `2 TiB` (binarne dla RAM, dziesiętne dla dysków jak u producenta) — builder zamienia na bajty; liczba bez jednostki = bajty.
- Prędkości portów w Mb/s (`1000`, `2500`, `10000`).
- Switch / router: `switching:` (np. `{ layer: 2, managed: true, poeBudgetW: 52 }` — `layer` 2 lub 3) i porty z `poe: { role: pse, standard: at }`.
- AP: porty `wifi-radio` + `rj45` z `poe: { role: pd, standard: at, drawW: 13 }`.
- Rack: zawsze `formFactor.mount: rack` z `units` i `width`.
- `id` = slug `vendor-model`, małe litery, myślniki; nazwa pliku = `id`.

## 4. Walidacja i podgląd

```bash
pnpm catalog:validate      # schematy Zod: pola, jednostki, refy CPU, unikalność id
pnpm catalog:build         # lokalnie: dist/ do podglądu (nie commituj dist/)
pnpm dev                   # biblioteka → Browse catalog → model widoczny w D-05
```
Sprawdź w aplikacji: wstawienie modelu tworzy porty, formę (rack/standalone), RAM ze slotami, kafelek z właściwą sylwetką; capacity liczy się poprawnie.

## 5. Zapis

- Commit: `feat(catalog): add Lenovo M720q and i5-8500T` (skill `commit`).
- Więcej modeli naraz → jeden commit na rodzinę (np. „Lenovo Tiny gen 8–9”).
- Nowy producent / kategoria → wzmianka w `docs/06` § 3.3 (lista kurowana).
