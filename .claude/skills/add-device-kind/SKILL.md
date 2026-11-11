---
name: add-device-kind
description: Dodanie nowego TYPU urządzenia (DeviceKind) w Server Planner — np. KVM, PDU, kamera PoE, drukarka 3D — przez model, Zod, fabrykę, domyślną formę i porty, sylwetkę, kafelek, bibliotekę, i18n, silniki i dokumentację. Użyj, gdy potrzebny jest rodzaj urządzenia, którego nie ma w DeviceKind (docs/02 § 4).
---

# Nowy typ urządzenia (`DeviceKind`)

Obecne typy (`docs/02` § 4): `internet, modem, router, firewall, switch, access-point, server, mini-pc, sbc, nas, ups, patch-panel, client` (+ `clientType`). Najpierw sprawdź, czy wystarczy **model** w katalogu (skill `add-device-model`) albo nowy `clientType` — nowy typ dodawaj tylko, gdy urządzenie zachowuje się inaczej (porty, zasoby, rola w sieci, walidacja).

## 0. Decyzja

Ustal z użytkownikiem i zapisz (skill `record-decision`, wiersz w `02` § 13 lub tabela LIB w `01`):

- rola: obliczeniowe (ma OS/workloady) · sieciowe (switching/firewall/wifi) · pasywne (patch panel) · zasilanie (UPS/PDU) · klient
- domyślna forma (`FormFactor`) i sylwetka
- domyślne porty i ich rodzaje
- czy ma capacity, czy uczestniczy w symulacji (L2/L3), jakie walidacje

## 1. Model (`packages/model`)

1. Dodaj wartość do unii `DeviceKind` i schematu Zod.
2. Fabryka `createDevice(kind)`: domyślna nazwa (`<kind>-<n>`), `formFactor`, porty (`Interface[]`), puste `hardware`, opcjonalne sekcje (`switching`, `ups`…).
3. Mapa domyślnych form (`defaultFormFactor[kind]`) — używana też przez migrację D9.
4. Jeśli typ wymaga nowych pól → skill `schema-change` (dodanie samej wartości unii **nie** wymaga migracji, nowe pola tak).
5. Testy: fabryka, komendy (`addDevice`, `deleteDevice` kaskady) dla nowego typu.

## 2. Silniki (`packages/engine`)

- `buildGraph`: czy typ przekazuje ramki (switch‑like), routuje (router‑like), czy jest końcówką.
- `capacity`: uwzględnij lub jawnie pomiń.
- Walidacje specyficzne → skill `add-validation-rule`.
- Fixture z nowym typem w `fixtures/` + test.

## 3. UI (`apps/web`)

1. **Sylwetka** `apps/web/src/icons/devices/<name>.tsx`: siatka 24×24, stroke 1.6, `stroke-linecap/linejoin: round`, bez wypełnień, `currentColor` (styl jak `mini-pc`, `nas`). Dodaj do rejestru sylwetek.
2. **Kafelek**: wariant `DeviceTile` — rack (front) lub standalone (karta + nóżki) według formy; specjalny kształt tylko, gdy niesie informację (`04` § 6.7).
3. **Biblioteka**: wpis w odpowiedniej sekcji (RACK-MOUNT / STANDALONE / CLIENTS) z metą mono (`1U`, `PoE`…).
4. **Inspector**: które zakładki (Capacity / Hardware / Software / Network / Ports) i domyślna zakładka (`05` § 5.2).
5. **i18n**: `en/catalog.json` → `deviceKind.<kind>` (nazwa), opis; nazwy portów nie są tłumaczone.
6. Galeria `#/dev/design`: kafelek w stanach (default, selected, error, planned) w obu motywach.

## 4. Katalog

- Dodaj co najmniej jeden model (skill `add-device-model`) i `kind` w schemacie `CatalogDevice`.
- `docs/04` § 5 — wiersz w tabeli sylwetek („Domyślnie dla kind”).

## 5. Dokumentacja i zapis

- `02` § 4 (unia), `04` § 5, `01` (LIB‑01 lista typów), ewentualnie `07`, jeśli nowy panel.
- Commit: `feat(model): add <kind> device kind` + osobny `feat(web): …` dla UI, jeśli duży.
