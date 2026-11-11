# Server Planner — specyfikacja funkcjonalna (v0.4)

> Status: **zaakceptowany zakres, v0.4** (dodane lokalizacje i forma urządzeń) · Ostatnia zmiana: 2026-11-11
> Kolejne dokumenty: `02-model-danych.md`, `03-architektura.md`, `04-design-system.md`, `05-projekt-ui.md`
> Dokumentacja prowadzona po polsku; interfejs aplikacji i kod — po angielsku.

---

## 0. Decyzje projektowe (log)

| #   | Decyzja                                                                                                                                                                                                                                                                                                                                   | Konsekwencje                                                                                                                                                                                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Projekty przechowywane lokalnie w przeglądarce**, eksport/import JSON. Brak kont.                                                                                                                                                                                                                                                       | IndexedDB + autosave; trzeba chronić użytkownika przed utratą danych (rozdz. M1); brak współpracy w czasie rzeczywistym.                                                                                                                                      |
| D2  | **Wspierane systemy: Proxmox VE, Debian, Ubuntu (Server), Windows Server.** Docker jako główny sposób instalacji aplikacji i budowania środowisk z obrazów.                                                                                                                                                                               | Katalog aplikacji opiera się na obrazach Dockera; LXC zostaje jako natywna funkcja Proxmoxa. Urządzenia sieciowe (router, switch, AP) mają generyczny „system appliance”, bez wyboru konkretnego firmware.                                                    |
| D3  | **Własna baza katalogowa (sprzęt + aplikacje), okresowo zasilana danymi z internetu.**                                                                                                                                                                                                                                                    | Potrzebny osobny, mały **pipeline katalogowy** (poza aplikacją użytkownika), który publikuje wersjonowany pakiet danych. Aplikacja go pobiera i cache'uje. Projekty pozostają lokalne — D1 nie jest naruszone.                                                |
| D4  | **Symulacja pokazuje komunikację i blokady między urządzeniami** (dostęp do internetu, dostęp z sieci domowej, macierz dostępności) oraz **przepływ ruchu wywołany przez proces aplikacji**.                                                                                                                                              | Symulacja staje się funkcją rdzeniową (P0/P1, nie P2). Firewall i strefy wchodzą do MVP. Aplikacje w katalogu muszą mieć opisane **wzorce ruchu**.                                                                                                            |
| D5  | **Interfejs tylko po angielsku**, z infrastrukturą i18n od pierwszego dnia.                                                                                                                                                                                                                                                               | Wszystkie teksty UI przez klucze tłumaczeń; patrz rozdz. 7.                                                                                                                                                                                                   |
| D6  | **Projekt open source, niekomercyjny, publiczne repozytorium na GitHubie.** Licencje: kod — **MIT**, dane katalogu — **CC‑BY‑SA 4.0**.                                                                                                                                                                                                    | Możemy legalnie korzystać z danych awesome‑selfhosted (CC‑BY‑SA) pod warunkiem atrybucji i tej samej licencji dla katalogu. Atrybucja źródeł w UI (strona „About / Data sources”).                                                                            |
| D7  | **Zero własnych serwerów.** Dane katalogu zbiera workflow **GitHub Actions** w publicznym repo (**maksymalnie raz na tydzień**) i **publikuje automatycznie** jako pliki statyczne. Aplikacja pobiera je przy starcie (max 1×/tydzień) lub przyciskiem i trzyma lokalnie. Aplikacja hostowana na GitHub Pages (lub uruchamiana lokalnie). | Brak kosztów; dowolne źródła (nie tylko CORS). Brak ręcznego przeglądu → walidacja, bezpieczniki i progi anomalii (rozdz. 5.1). Dane kurowane (m.in. wzorce ruchu) w repo i wbudowane w aplikację jako zapas offline.                                         |
| D8  | **Router/firewall tylko jako generyczne urządzenie** — bez modelowania routera jako VM (np. OPNsense na Proxmoxie).                                                                                                                                                                                                                       | Poza zakresem na teraz; możliwe w przyszłości.                                                                                                                                                                                                                |
| D9  | **Fizyczne rozmieszczenie na canvasie: lokalizacje + forma urządzenia.** Każde urządzenie jest **rack‑mount** (kafelek‑front z uszami, wysokość w U) albo **standalone** (karta z sylwetką: tower, mini PC, desktop, NAS, ściana, sufit, SBC). Na canvasie są pojemniki **Pomieszczenie / Półka / Rack**; rack ma szynę U i sloty.        | Lab „bez szafy” i lab w szafie wyglądają naturalnie. Lokalizacja to dane domenowe (walidacja U, zasilanie), nie tylko rysunek. Zastępuje dawne „Grupy” i osobny widok Rack. Wybrany kierunek wizualny: C „Rack”, wariant E (canvas) + inspector z wariantu D. |

---

## 1. Cel produktu

Aplikacja webowa do **planowania infrastruktury home laba przed jej zbudowaniem (lub zmianą)**. Użytkownik układa urządzenia na siatce, łączy je, opisuje sprzęt i oprogramowanie, dzieli sieć na VLANy i podsieci, a aplikacja:

1. **waliduje** projekt (konflikty, błędy konfiguracji, brakujące elementy),
2. **symuluje komunikację** — kto z kim może rozmawiać, co ma internet, którędy płynie ruch aplikacji i gdzie zostaje zablokowany,
3. **liczy capacity** — czy sprzęt udźwignie zaplanowane VM, kontenery i aplikacje,
4. **generuje dokumentację** — plan IP, lista zakupów, diagramy, etykiety.

### Persony

| Persona                          | Potrzeba                                                                                                                     |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Początkujący homelabber**      | „Kupuję mini PC i switch — czy to wystarczy na Proxmoxa z Home Assistantem, Jellyfinem i Pi‑hole?”                           |
| **Zaawansowany homelabber**      | Segmentacja na VLANy (IoT, goście, management), firewall, kilka hostów, NAS, UPS. Chce sprawdzić plan, zanim przepnie kable. |
| **Dokumentujący istniejący lab** | Aktualna mapa: co gdzie stoi, jaki IP, który port switcha, co działa na którym hoście.                                       |

### Poza zakresem

- Skanowanie/autodetekcja istniejącej sieci.
- Emulacja pakietowa (to nie jest GNS3/EVE‑NG) — symulacja jest **logiczna**.
- Wdrażanie konfiguracji na prawdziwe urządzenia.
- Konta użytkowników, synchronizacja w chmurze, współpraca na żywo.
- Systemy inne niż wymienione w D2 (TrueNAS, Unraid, ESXi itd.) — możliwe w przyszłości.
- Router/firewall uruchomiony jako VM (D8).
- Jakakolwiek monetyzacja, telemetria, analityka użytkowników.

---

## 2. Pojęcia domenowe (słownik)

Nazwy angielskie w nawiasach = nazwy w kodzie i UI.

| Pojęcie                                 | Opis                                                                                                                                                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projekt** (Project)                   | Jeden home lab. Zawiera wszystko poniżej. Ma snapshoty.                                                                                                                                                 |
| **Canvas**                              | Nieskończona siatka, na której leżą elementy projektu.                                                                                                                                                  |
| **Urządzenie** (Device)                 | Fizyczny element: router, firewall, switch, serwer, mini PC, NAS, AP, UPS, modem ISP, klient (laptop, TV, telefon, IoT).                                                                                |
| **Komponent** (Component)               | Część urządzenia: CPU, RAM, dysk, NIC, GPU, zasilacz.                                                                                                                                                   |
| **Port / Interfejs** (Port / Interface) | Punkt podłączenia: RJ45, SFP/SFP+, radio Wi‑Fi, interfejs wirtualny (bridge, vNIC). Ma prędkość, tryb VLAN, adres IP.                                                                                   |
| **Łącze** (Link)                        | Kabel lub połączenie Wi‑Fi między dwoma portami.                                                                                                                                                        |
| **Workload**                            | Coś, co działa na urządzeniu i konsumuje zasoby: **system operacyjny**, **VM**, **kontener LXC**, **kontener Docker**. Workloady są zagnieżdżalne.                                                      |
| **Stos** (Stack)                        | Grupa kontenerów Docker uruchamianych razem (odpowiednik pliku `docker-compose.yml`), np. Immich = serwer + ML + PostgreSQL + Redis.                                                                    |
| **Aplikacja** (App)                     | Usługa uruchamiana w workloadzie; w katalogu powiązana z obrazem Dockera. Ma wymagania zasobowe, porty i **wzorce ruchu**.                                                                              |
| **Wzorzec ruchu** (Traffic Pattern)     | Opis komunikacji aplikacji: „Jellyfin przyjmuje ruch od klientów na TCP 8096”, „Home Assistant łączy się z urządzeniami IoT”, „Immich pobiera aktualizacje z internetu”.                                |
| **Scenariusz / proces** (Flow)          | Konkretna akcja do zasymulowania, np. „TV odtwarza film z Jellyfina” — łańcuch połączeń wynikający z wzorców ruchu.                                                                                     |
| **VLAN**                                | Sieć L2: ID 1–4094, nazwa, kolor.                                                                                                                                                                       |
| **Podsieć** (Subnet)                    | Zakres L3 (CIDR) przypisany do VLANu; brama, DHCP, DNS.                                                                                                                                                 |
| **Strefa** (Zone)                       | Grupa podsieci dla firewalla (`WAN`, `LAN`, `IoT`, `Guest`, `Mgmt`, `DMZ`).                                                                                                                             |
| **Reguła firewall** (Firewall Rule)     | Zezwól/zablokuj ruch źródło → cel na protokole/porcie.                                                                                                                                                  |
| **Tag**                                 | Znacznik (nazwa + kolor) do filtrowania i wyróżniania.                                                                                                                                                  |
| **Etykieta fizyczna** (Label)           | Tekst do wydruku na kabel/urządzenie.                                                                                                                                                                   |
| **Lokalizacja** (Location)              | Fizyczne miejsce: **pomieszczenie** (Room), **półka / biurko** (Shelf) lub **szafa rack** (Rack, 6–42U, 10″/19″). Na canvasie — pojemnik z urządzeniami.                                                |
| **Forma urządzenia** (Form factor)      | **Rack‑mount** (wysokość w U, szerokość 10″/19″) albo **standalone** z kształtem (tower, mini PC, desktop, NAS, wall, ceiling, SBC). Wpływa na wygląd kafelka i na to, gdzie można urządzenie umieścić. |
| **Pozycja katalogowa** (Catalog Item)   | Model sprzętu lub aplikacja z bazy katalogowej (D3).                                                                                                                                                    |

### Hierarchia zasobów (podstawa capacity)

```
Urządzenie fizyczne (CPU, RAM, dyski, NIC, GPU)
└── OS hosta: Proxmox VE | Debian | Ubuntu | Windows Server   (narzut zasobów)
    ├── VM  (vCPU, RAM, dysk z puli)          ← tylko Proxmox VE (oraz Hyper-V na Windows Server — P2)
    │   └── OS gościa: Debian | Ubuntu | Windows Server
    │       └── Docker → Stos → Kontener → Aplikacja
    ├── LXC (limity CPU/RAM/dysk)            ← tylko Proxmox VE
    │   └── Docker → … / Aplikacja natywna
    └── Docker → Stos → Kontener → Aplikacja ← Debian / Ubuntu bezpośrednio
```

Każdy poziom **konsumuje** zasoby rodzica i **udostępnia** je dzieciom. Capacity liczone jest rekurencyjnie.

**Macierz zgodności OS (D2):**

| OS             | Rola hosta | VM           | LXC | Docker                                                                | Uwagi                                                         |
| -------------- | ---------- | ------------ | --- | --------------------------------------------------------------------- | ------------------------------------------------------------- |
| Proxmox VE     | hypervisor | ✅           | ✅  | ⚠️ możliwy, ale odradzany na hoście → ostrzeżenie z sugestią VM/LXC   | VLAN‑aware bridge (`vmbr`)                                    |
| Debian         | serwer     | —            | —   | ✅                                                                    |                                                               |
| Ubuntu Server  | serwer     | —            | —   | ✅                                                                    |                                                               |
| Windows Server | serwer     | P2 (Hyper‑V) | —   | ⚠️ tylko kontenery Windows — Linuxowe obrazy oznaczone jako niezgodne | Aplikacje natywne Windows (np. AD DS, File Server) w katalogu |

---

## 3. Moduły funkcjonalne

Priorytety: **P0** = MVP · **P1** = wersja 1.0 · **P2** = później.

### M1. Projekty i przechowywanie danych

| ID     | Funkcja                                                                                                                                                                    | Prio |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| PRJ-01 | Tworzenie, zmiana nazwy, usuwanie, duplikowanie projektu                                                                                                                   | P0   |
| PRJ-02 | Lista projektów (miniatura, data modyfikacji, rozmiar)                                                                                                                     | P0   |
| PRJ-03 | Autozapis do IndexedDB + undo/redo w sesji                                                                                                                                 | P0   |
| PRJ-04 | Eksport/import projektu do JSON; plik zawiera `schemaVersion`, import migruje starsze wersje                                                                               | P0   |
| PRJ-05 | **Ochrona danych lokalnych**: prośba o trwałe przechowywanie (`navigator.storage.persist`), przypomnienie o eksporcie po N dniach/zmianach, ostrzeżenie w trybie prywatnym | P0   |
| PRJ-06 | Wykrywanie edycji tego samego projektu w dwóch kartach (blokada lub ostrzeżenie)                                                                                           | P1   |
| PRJ-07 | Snapshoty (nazwane wersje) + diff dwóch wersji                                                                                                                             | P1   |
| PRJ-08 | Szablony startowe („Mini PC + router”, „Proxmox 3 node”, „Segmentacja IoT”)                                                                                                | P1   |
| PRJ-09 | Zapis bezpośrednio do pliku na dysku (File System Access API, gdzie dostępne)                                                                                              | P2   |
| PRJ-10 | Warianty projektu („co jeśli dokupię 32 GB RAM?”)                                                                                                                          | P2   |

### M2. Edytor canvas

| ID     | Funkcja                                                                                        | Prio |
| ------ | ---------------------------------------------------------------------------------------------- | ---- |
| CAN-01 | Nieskończony canvas z siatką, pan i zoom                                                       | P0   |
| CAN-02 | Przeciąganie urządzeń z biblioteki, przyciąganie do siatki                                     | P0   |
| CAN-03 | Zaznaczanie (pojedyncze, Shift, ramka), przesuwanie, usuwanie, kopiuj/wklej, duplikuj          | P0   |
| CAN-04 | Rysowanie łączy port → port; wybór portu z listy; podpowiedź wolnego, zgodnego portu           | P0   |
| CAN-05 | Panel właściwości (inspector) dla zaznaczenia                                                  | P0   |
| CAN-06 | Nakładki: kolor łączy wg VLANu / prędkości; kolor urządzeń wg strefy / tagu / statusu capacity | P0   |
| CAN-07 | Notatki tekstowe na canvasie (obszary fizyczne → M2b)                                          | P1   |
| CAN-08 | Wyrównywanie, prowadnice, routing linii ortogonalny z punktami pośrednimi                      | P1   |
| CAN-09 | Minimapa, „dopasuj do ekranu”, paleta poleceń / wyszukiwarka (Ctrl+K)                          | P1   |
| CAN-10 | Auto‑layout (hierarchicznie od Internetu w dół)                                                | P2   |

### M2b. Lokalizacje i forma urządzeń (D9)

| ID     | Funkcja                                                                                                                                                                                                                 | Prio |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| LOC-01 | **Forma urządzenia** w inspectorze (zakładka Hardware): przełącznik Rack‑mount / Standalone; dla rack — wysokość U i szerokość 10″/19″, dla standalone — kształt. Domyślna wartość z katalogu lub z rodzaju urządzenia. | P0   |
| LOC-02 | Kafelek urządzenia rysowany wg formy: **rack** = poziomy front z uszami, porty i LED w jednym rzędzie; **standalone** = karta z sylwetką i nóżkami                                                                      | P0   |
| LOC-03 | Pojemniki **Pomieszczenie** i **Półka/biurko**: wstawianie z biblioteki, zmiana rozmiaru, nazwa; przeciągnięcie urządzenia do środka = przypisanie lokalizacji                                                          | P0   |
| LOC-04 | Pojemnik **Rack**: wysokość 6–42U, 10″/19″, szyna z numeracją U; urządzenia rack‑mount wpinane w sloty (przyciąganie do U), wolne miejsce widoczne („7U free”)                                                          | P0   |
| LOC-05 | **Półka w racku**: urządzenia standalone stawiane na półce zajmującej U                                                                                                                                                 | P1   |
| LOC-06 | Inspector lokalizacji: zajętość U, lista zamontowanych urządzeń; dla racka szacowany pobór mocy vs budżet (wymaga HW‑06)                                                                                                | P1   |
| LOC-07 | Zagnieżdżanie: rack lub półka wewnątrz pomieszczenia                                                                                                                                                                    | P1   |
| LOC-08 | Przełącznik „Group by: Location / None” — ukrywa ramki lokalizacji, gdy liczy się tylko topologia                                                                                                                       | P1   |
| LOC-09 | Wydruk/eksport frontu szafy (rack elevation)                                                                                                                                                                            | P2   |

Walidacja (rozszerza M8): nakładające się urządzenia w racku, urządzenie poza zakresem U, urządzenie 19″ w szafie 10″, przekroczony budżet mocy szafy. Urządzenie rack‑mount poza rackiem (np. switch leżący na półce) jest dozwolone — bez ostrzeżenia.

### M3. Katalog i biblioteka urządzeń

| ID     | Funkcja                                                                                                                                                                                      | Prio |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| LIB-01 | Generyczne typy urządzeń (lista z M‑słownika) z domyślnymi portami i specyfikacją                                                                                                            | P0   |
| LIB-02 | Wyszukiwarka katalogu modeli sprzętu (rozdz. 5) z filtrami: typ, producent, CPU, RAM max, liczba/prędkość portów, pobór mocy                                                                 | P1   |
| LIB-03 | Pozycja z katalogu wstawiona do projektu jest **kopiowana** (projekt nie zmienia się po aktualizacji katalogu); przy nowszej wersji danych — informacja „dostępna aktualizacja specyfikacji” | P1   |
| LIB-04 | Własne szablony urządzeń („zapisz jako szablon”), przechowywane lokalnie                                                                                                                     | P1   |
| LIB-05 | Konfigurator: model bazowy + wymiana komponentów (np. M720q + 64 GB RAM + NIC 10G w PCIe) z walidacją zgodności (max RAM, sloty)                                                             | P2   |

### M4. Specyfikacja sprzętu

| ID    | Funkcja                                                                                                                                               | Prio |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| HW-01 | **CPU**: model, rdzenie, wątki, taktowanie, TDP, względna wydajność wielordzeniowa (Blender Open Data, możliwa ręczna korekta), iGPU                  | P0   |
| HW-02 | **RAM**: pojemność, typ, sloty (zajęte/max), ECC                                                                                                      | P0   |
| HW-03 | **Dyski i pule storage**: typ, pojemność; pule z poziomem redundancji (single, mirror, RAID5/6/10, ZFS RAIDZ1/2/3) → automatyczna pojemność użyteczna | P0   |
| HW-04 | **Interfejsy sieciowe**: typ, prędkość, PoE (PD/PSE)                                                                                                  | P0   |
| HW-05 | **GPU / akceleratory**: model, VRAM, kodeki sprzętowe (QuickSync/NVENC/VCN), Coral/NPU                                                                | P1   |
| HW-06 | **Zasilanie**: pobór idle/load; UPS: VA/W, bateria; switch: budżet PoE                                                                                | P1   |
| HW-07 | **Fizyczne**: forma i lokalizacja — patrz M2b (LOC)                                                                                                   | P0   |
| HW-08 | **Zakup**: cena, status (posiadam / do kupienia / opcjonalne), link                                                                                   | P1   |

### M5. Oprogramowanie: OS, workloady, aplikacje

| ID    | Funkcja                                                                                                                                                                  | Prio |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| SW-01 | Wybór OS hosta (Proxmox VE, Debian, Ubuntu Server, Windows Server) z wersją i domyślnym narzutem zasobów                                                                 | P0   |
| SW-02 | **VM** (Proxmox): vCPU, RAM, dysk z puli, vNIC (bridge + tag VLAN), OS gościa                                                                                            | P0   |
| SW-03 | **LXC** (Proxmox): limity CPU/RAM/dysk, vNIC, uprzywilejowany/nieuprzywilejowany                                                                                         | P0   |
| SW-04 | **Docker**: włączenie runtime na hoście/VM/LXC; dodawanie kontenerów z obrazów (z katalogu lub dowolny `image:tag`)                                                      | P0   |
| SW-05 | Konfiguracja kontenera: mapowanie portów (`host:container/proto`), tryb sieci (bridge/host/macvlan/ipvlan), wolumeny (rozmiar), limity CPU/RAM, GPU passthrough          | P0   |
| SW-06 | **Katalog aplikacji** (rozdz. 5) — dodanie aplikacji wstawia gotowy kontener lub cały **stos** (np. Immich = 4 kontenery) z domyślnymi portami, wolumenami i wymaganiami | P0   |
| SW-07 | Własne aplikacje / kontenery z ręcznie podanymi wymaganiami, portami i wzorcami ruchu                                                                                    | P0   |
| SW-08 | Profil obciążenia: idle / typowe / szczyt (parametryzowany, np. „liczba jednoczesnych transkodowań”)                                                                     | P1   |
| SW-09 | Wolumeny danych: rozmiar startowy + przyrost/miesiąc                                                                                                                     | P1   |
| SW-10 | Zależności między aplikacjami (Immich → PostgreSQL, *arr → klient torrent) — automatycznie z katalogu, weryfikowane symulacją                                            | P1   |
| SW-11 | Drzewo workloadów hosta z przeciąganiem między hostami (migracja „na papierze”)                                                                                          | P1   |
| SW-12 | Kontrola zgodności: architektura obrazu (amd64/arm64) vs CPU, obraz Linuxowy na Windows Server, Docker bezpośrednio na Proxmoxie                                         | P1   |
| SW-13 | Eksport stosu do `docker-compose.yml` (patrz EXP-06)                                                                                                                     | P1   |
| SW-14 | Hyper‑V na Windows Server jako hypervisor                                                                                                                                | P2   |

### M6. Sieć: VLANy, adresacja, routing, firewall

| ID     | Funkcja                                                                                                                                                             | Prio |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| NET-01 | Definicja VLANów (ID, nazwa, kolor, opis)                                                                                                                           | P0   |
| NET-02 | Tryb portu: **access** / **trunk** (lista VLANów + untagged/native)                                                                                                 | P0   |
| NET-03 | Podsieci (CIDR) powiązane z VLANem: brama, zakres DHCP, DNS, domena                                                                                                 | P0   |
| NET-04 | **IPAM**: IP statyczny / DHCP / rezerwacja; sugestia wolnego adresu                                                                                                 | P0   |
| NET-05 | Interfejsy L3 routera (fizyczne, sub‑interfejsy VLAN, SVI na switchu L3)                                                                                            | P0   |
| NET-06 | **Strefy** i przypisanie podsieci do stref                                                                                                                          | P0   |
| NET-07 | **Reguły firewall** międzystrefowe (kolejność, źródło, cel, protokół, port, akcja) + polityka domyślna; obiekty źródła/celu: strefa, podsieć, urządzenie, aplikacja | P0   |
| NET-08 | **WAN i Internet**: węzeł „Internet”, interfejs WAN routera, NAT wychodzący (masquerade), domyślna trasa                                                            | P0   |
| NET-09 | **Bridge w hypervisorze** (Proxmox `vmbr`, VLAN‑aware) i sieci Dockera (bridge/host/macvlan) — połączenie warstwy fizycznej z wirtualną                             | P0   |
| NET-10 | Kreator „Typowa segmentacja” (Mgmt/LAN/IoT/Guest + podstawowe reguły)                                                                                               | P1   |
| NET-11 | Port forwarding / ekspozycja usług do internetu, reverse proxy (domena → aplikacja)                                                                                 | P1   |
| NET-12 | Wi‑Fi: SSID na AP → VLAN, izolacja klientów                                                                                                                         | P1   |
| NET-13 | Trasy statyczne                                                                                                                                                     | P1   |
| NET-14 | DNS lokalny (rekordy, serwer DNS w sieci, np. Pi‑hole jako DNS dla podsieci)                                                                                        | P1   |
| NET-15 | Firewall hosta (Proxmox firewall, ufw, Windows Firewall) — uproszczony                                                                                              | P2   |
| NET-16 | Relay/reflektor mDNS między VLANami; LACP; VPN (WireGuard/Tailscale) jako strefa                                                                                    | P2   |
| NET-17 | IPv6                                                                                                                                                                | P2   |

### M7. Oznaczenia i etykiety

| ID     | Funkcja                                                          | Prio |
| ------ | ---------------------------------------------------------------- | ---- |
| LBL-01 | Tagi na dowolnych elementach + filtrowanie canvasu po tagach     | P0   |
| LBL-02 | Nazwy hostów i opisy                                             | P0   |
| LBL-03 | Etykiety kabli wg wzorca (`SW1-P05 ↔ PVE1-ETH0`), kolor, długość | P1   |
| LBL-04 | Wydruk etykiet (PDF: drukarka etykiet / arkusz A4)               | P2   |
| LBL-05 | Konwencje nazewnicze projektu z walidacją                        | P2   |

### M8. Walidacja i symulacja

Trzy warstwy: **walidacja statyczna** (ciągła) → **analiza dostępności** (ciągła/na żądanie) → **symulacja przepływu** (na żądanie, wizualna).

#### 8a. Walidacja statyczna — panel „Issues”

| ID     | Reguła                                                                     | Poziom             |
| ------ | -------------------------------------------------------------------------- | ------------------ |
| VAL-01 | Zduplikowany adres IP                                                      | Błąd               |
| VAL-02 | IP poza podsiecią VLANu interfejsu                                         | Błąd               |
| VAL-03 | IP statyczny w puli DHCP                                                   | Ostrzeżenie        |
| VAL-04 | Niezgodność VLAN na końcach łącza (access vs trunk, brak VLANu na trunku)  | Błąd               |
| VAL-05 | Niezgodność medium/prędkości (SFP+ ↔ RJ45, 10G ↔ 1G)                       | Ostrzeżenie / Info |
| VAL-06 | Pętla L2                                                                   | Ostrzeżenie        |
| VAL-07 | VLAN bez podsieci / podsieć bez bramy                                      | Ostrzeżenie        |
| VAL-08 | Port użyty dwukrotnie / urządzenie bez połączeń                            | Błąd / Info        |
| VAL-09 | Nakładające się podsieci                                                   | Błąd               |
| VAL-10 | Konflikt portów na tym samym IP (dwie usługi na :443)                      | Błąd               |
| VAL-11 | Niezgodność OS/obrazu (SW-12)                                              | Błąd / Ostrzeżenie |
| VAL-12 | Przekroczony budżet PoE                                                    | Błąd               |
| VAL-13 | Przekroczenie capacity (z M9)                                              | Błąd / Ostrzeżenie |
| VAL-14 | Niespełniona zależność aplikacji (brak bazy danych / niedostępna sieciowo) | Błąd               |

Każdy problem: opis, wskazanie elementów (klik → zaznaczenie na canvasie), sugerowana poprawka z akcją „Fix”, gdy jest jednoznaczna.

#### 8b. Analiza dostępności (odpowiedź na „co z czym może się połączyć”)

| ID     | Funkcja                                                                                                                                                                                                                                                                                                                                   | Prio |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| SIM-01 | **Test osiągalności A → B** (urządzenie / workload / aplikacja → urządzenie / workload / aplikacja / Internet; protokół, port): wynik ✅/❌, ścieżka podświetlona na canvasie, lista kroków i **przyczyna blokady** (np. „blocked by rule #3 IoT → LAN deny”, „VLAN 30 not allowed on trunk SW1‑P1”, „no route”, „service not listening”) | P0   |
| SIM-02 | **Dostęp do internetu** — dla każdego urządzenia/workloadu status: ✅ ma / ❌ nie ma / ⚠️ częściowo (np. tylko DNS); widoczny jako nakładka na canvasie i kolumna w inwentarzu                                                                                                                                                            | P0   |
| SIM-03 | **Dostęp z sieci domowej** — „co widzi typowy klient z LAN” (wybrany punkt widzenia: telefon w Wi‑Fi gościa, laptop w LAN): lista usług dostępnych / zablokowanych                                                                                                                                                                        | P0   |
| SIM-04 | **Macierz dostępności** strefa × strefa oraz urządzenie × urządzenie (z filtrami), komórka klikalna → szczegóły jak w SIM‑01                                                                                                                                                                                                              | P1   |
| SIM-05 | **Ekspozycja z internetu** — które usługi są osiągalne z WAN (port‑forward, reverse proxy)                                                                                                                                                                                                                                                | P1   |
| SIM-06 | **Asercje sieci** — zapisane oczekiwania („IoT ↛ LAN”, „Guest ↛ Mgmt”, „TV → Jellyfin”) sprawdzane automatycznie przy każdej zmianie; niespełniona asercja = Issue                                                                                                                                                                        | P1   |
| SIM-07 | Analiza awarii: „co jeśli padnie X?” + wykrywanie SPOF                                                                                                                                                                                                                                                                                    | P2   |

#### 8c. Symulacja przepływu ruchu aplikacji (Flows)

Użytkownik wybiera **proces** w aplikacji na urządzeniu i obserwuje, jak ruch rozchodzi się po infrastrukturze.

| ID     | Funkcja                                                                                                                                                                                                                                                                                       | Prio |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| FLW-01 | Lista procesów do uruchomienia dla danej aplikacji, pochodząca z jej wzorców ruchu w katalogu, np.: Jellyfin → „Client plays a movie”, „Fetch metadata”; Home Assistant → „Poll IoT devices”, „Mobile app connects remotely”; Pi‑hole → „Client DNS query”; Proxmox Backup → „Nightly backup” | P1   |
| FLW-02 | Wybór uczestników procesu (np. który klient odtwarza film), wartości domyślne podpowiadane                                                                                                                                                                                                    | P1   |
| FLW-03 | **Rozwinięcie procesu w łańcuch połączeń**, łącznie z ruchem pośrednim, np. „TV → DNS (Pi‑hole) → upstream DNS (Internet) → Reverse proxy → Jellyfin → NAS (NFS, odczyt pliku)”                                                                                                               | P1   |
| FLW-04 | **Animacja na canvasie**: kolejne kroki podświetlane po kolei (pakiety jako kropki na łączach), krok po kroku lub automatycznie; blokada = czerwony punkt w miejscu odrzucenia z przyczyną                                                                                                    | P1   |
| FLW-05 | Panel osi czasu/kroków: hop, warstwa (L2/L3/firewall/NAT/aplikacja), decyzja, użyta reguła                                                                                                                                                                                                    | P1   |
| FLW-06 | Obciążenie łączy przez proces (np. strumień 4K = ~40 Mb/s, backup = pełna prędkość łącza) → wskazanie wąskiego gardła                                                                                                                                                                         | P2   |
| FLW-07 | Kilka procesów jednocześnie („wieczór: 3 strumienie + backup”) → sumaryczne obciążenie łączy i hostów (łączy się z CAP‑05)                                                                                                                                                                    | P2   |

#### 8d. Model symulacji (logiczny)

Silnik operuje na **grafie projektu**, nie na pakietach. Dla pary (źródło, cel, protokół, port):

1. **Źródło** — interfejs i jego VLAN/podsieć; dla kontenera: sieć Dockera → (NAT Dockera) → interfejs hosta; dla VM/LXC: vNIC → bridge → tag VLAN → port fizyczny.
2. **Rozwiązanie celu** — jeśli cel podany nazwą: zapytanie DNS (jest krokiem przepływu — może się samo zablokować).
3. **L2** — jeśli cel w tej samej podsieci: ścieżka w grafie łączy, gdzie każdy port przenosi dany VLAN (access/trunk/untagged).
4. **L3** — w przeciwnym razie: L2 do bramy → wybór trasy (bezpośrednia / statyczna / domyślna) → **firewall** (reguły w kolejności, first match, potem polityka domyślna strefy) → **NAT** (masquerade dla WAN, DNAT dla port‑forward) → L2 do celu lub wyjście do Internetu.
5. **Cel** — czy aplikacja nasłuchuje na porcie/protokole (mapowanie portów Dockera!), opcjonalnie firewall hosta (P2).
6. **Ruch powrotny** — zakładamy stateful firewall: odpowiedź na dozwolone połączenie przechodzi.
7. **Wynik** — lista kroków `{element, warstwa, decyzja, powód, reguła}`; pierwszy krok z decyzją „deny/fail” = przyczyna.

Węzeł **Internet** jest specjalnym celem/źródłem: każde połączenie wychodzące przez WAN z NAT = „ma internet”.

**Uproszczenia świadomie przyjęte:** brak STP (pętla = ostrzeżenie), brak multicastu/mDNS (P2), brak IPv6 (P2), brak QoS, brak opóźnień.

### M9. Capacity planning

| ID     | Funkcja                                                                                           | Prio |
| ------ | ------------------------------------------------------------------------------------------------- | ---- |
| CAP-01 | Bilans per host: CPU, RAM, storage (per pula), GPU — przydzielone vs dostępne, z narzutem OS      | P0   |
| CAP-02 | Paski zajętości w inspectorze + badge statusu na canvasie                                         | P0   |
| CAP-03 | Bilans rekurencyjny: VM/LXC (przydział) vs aplikacje wewnątrz (wymagania)                         | P0   |
| CAP-04 | Overcommit CPU (domyślnie 4:1) i RAM (domyślnie 1:1), konfigurowalny per host                     | P1   |
| CAP-05 | Tryby: **przydział** i **przewidywane użycie** (z profili obciążenia SW‑08)                       | P1   |
| CAP-06 | Prognoza zapełnienia storage przy przyroście danych                                               | P1   |
| CAP-07 | Zasilanie: pobór idle/load, czas pracy na UPS, miesięczny koszt energii                           | P1   |
| CAP-08 | Budżet PoE                                                                                        | P1   |
| CAP-09 | Dashboard projektu: zasoby, wykorzystanie, BOM, koszt energii, liczba Issues, wynik asercji sieci | P1   |
| CAP-10 | Sugestie rozmieszczenia workloadów (bin packing), rekomendacje rozbudowy                          | P2   |

**Progi statusu** (konfigurowalne): < 70% OK · 70–90% Warning · 90–100% Critical · > 100% Over.

**Reguły liczenia (zarys):**

- `RAM_avail = RAM_phys − OS_overhead − reserves (np. ZFS ARC)`; Σ RAM workloadów ≤ RAM_avail × overcommit_RAM.
- `CPU_avail = threads × overcommit_CPU`; Σ vCPU ≤ CPU_avail. Tryb „użycie”: Σ przewidywanego obciążenia (w rdzeniach) ≤ threads.
- `Storage_usable(pool) = f(RAID, disks) × (1 − free_space_reserve)`; Σ dysków VM + wolumenów ≤ Storage_usable.
- Kontener bez limitów liczony wg wymagań z katalogu (typowe), z flagą „unbounded”.
- GPU: zadanie wymagające akceleratora bez zgodnego sprzętu → ostrzeżenie, obciążenie przeniesione na CPU.

### M10. Widoki

| ID      | Widok                                                                                                             | Prio |
| ------- | ----------------------------------------------------------------------------------------------------------------- | ---- |
| VIEW-01 | **Topology** — canvas (domyślny)                                                                                  | P0   |
| VIEW-02 | **Inventory** — tabela urządzeń/workloadów/aplikacji, filtry, edycja inline, kolumny statusu internetu i capacity | P1   |
| VIEW-03 | **IP Plan** — podsieci i adresy per VLAN                                                                          | P1   |
| VIEW-04 | **Access** — macierz dostępności (SIM‑04) i lista asercji (SIM‑06)                                                | P1   |
| VIEW-05 | ~~Rack~~ — zastąpione przez racki na canvasie (LOC‑04) i wydruk LOC‑09                                            | —    |
| VIEW-06 | **Logical L3** — automatyczny diagram stref/podsieci                                                              | P2   |
| VIEW-07 | **Services** — mapa aplikacji i zależności                                                                        | P2   |

Wszystkie widoki operują na jednym modelu danych.

### M11. Eksport

| ID     | Funkcja                                                                                                           | Prio |
| ------ | ----------------------------------------------------------------------------------------------------------------- | ---- |
| EXP-01 | Diagram do PNG/SVG                                                                                                | P0   |
| EXP-02 | Projekt do JSON (= PRJ‑04)                                                                                        | P0   |
| EXP-03 | BOM do CSV                                                                                                        | P1   |
| EXP-04 | Plan IP / inwentarz do CSV                                                                                        | P1   |
| EXP-05 | Dokumentacja projektu do Markdown/PDF                                                                             | P1   |
| EXP-06 | `docker-compose.yml` per stos / per host                                                                          | P1   |
| EXP-07 | Proxmox `/etc/network/interfaces` (bridge + VLAN), Netplan (Ubuntu), `interfaces` (Debian), lista rezerwacji DHCP | P2   |

### M12. Ustawienia

| ID     | Funkcja                                                                                                    | Prio |
| ------ | ---------------------------------------------------------------------------------------------------------- | ---- |
| SET-01 | Motyw jasny/ciemny/systemowy                                                                               | P0   |
| SET-02 | Jednostki, waluta, cena kWh, progi capacity, domyślne overcommity                                          | P1   |
| SET-03 | Katalog: włącz/wyłącz auto‑sprawdzanie przy starcie, wersja i data danych, status źródeł, cofnięcie wersji | P1   |
| SET-04 | Wybór języka (ukryty, dopóki jest tylko EN)                                                                | P1   |

---

## 4. Główne ścieżki użytkownika

### A — „Nowy lab od zera”

1. Nowy projekt (pusty lub z szablonu).
2. Przeciąga: Internet → modem → router → switch → serwer, NAS, AP; łączy porty.
3. Kreator segmentacji tworzy VLANy (Mgmt 10, LAN 20, IoT 30, Guest 40), podsieci, strefy i podstawowe reguły.
4. Ustawia porty switcha (trunk do routera/serwera/AP, access do urządzeń).
5. Serwer: Proxmox → VM Debian z Dockerem → z katalogu: Jellyfin, Immich, Pi‑hole; LXC z Home Assistantem.
6. Panel Issues pokazuje błędy na bieżąco.
7. Nakładka „Internet access”: kamery IoT są czerwone — zgodnie z planem. Pi‑hole zielony.
8. Uruchamia proces „TV plays a movie” w Jellyfinie → animacja: TV → Pi‑hole → router (IoT → LAN: **blocked by rule #4**) → dodaje regułę IoT → Jellyfin:8096 allow → ponowny przebieg ✅.
9. Zapisuje to jako asercję „TV → Jellyfin ✅”.
10. Capacity: RAM 92% → dokłada RAM lub przenosi kontener.
11. Eksport BOM, `docker-compose.yml`, dokumentacji i JSON.

### B — „Czy mój sprzęt to uciągnie?”

Jedno urządzenie z katalogu + lista aplikacji → natychmiastowy bilans zasobów bez rysowania sieci.

### C — „Dokumentacja istniejącego labu”

Odwzorowanie stanu → snapshot „current” → wariant „after upgrade” → diff + lista zakupów.

---

## 5. Baza katalogowa (sprzęt i aplikacje)

### 5.1 Zasada działania

Katalog ma **dwie warstwy** (D7):

```
 Źródła zewnętrzne
        │   (max 1× na tydzień)
        ▼
 ┌─ GitHub Actions: catalog-update (repo projektu) ────────────────┐
 │  1. pobranie ze źródeł (adapter per źródło)                     │
 │  2. normalizacja do wspólnego schematu                          │
 │  3. scalenie z danymi kurowanymi (kurowane zawsze wygrywają)    │
 │  4. walidacja + bezpieczniki (patrz niżej)                      │
 │  5. automatyczna publikacja: commit plików do catalog/dist/     │
 │     + GitHub Pages                                              │
 └─────────────────────────────────────────────────────────────────┘
        │   manifest.json, apps.json, hardware.json, …
        ▼
 ┌─ Aplikacja w przeglądarce ──────────────────────────────────────┐
 │  przy starcie (max 1× na tydzień) lub przyciskiem               │
 │  „Update catalog”: pobierz manifest → jeśli nowsza wersja,      │
 │  pobierz pliki → zapis w IndexedDB (poprzednia wersja zostaje)  │
 │                                                                 │
 │  Brak sieci / błąd → ostatnia pobrana wersja, a jeśli żadnej    │
 │  nie ma → warstwa bazowa wbudowana w aplikację                  │
 └─────────────────────────────────────────────────────────────────┘
```

**Warstwa bazowa** — dane kurowane w repozytorium (`catalog/curated/`): wzorce ruchu, wymagania top aplikacji, typy urządzeń, modele sprzętu. Wbudowywana w aplikację przy buildzie (działa offline od pierwszego uruchomienia) i jednocześnie wejście dla workflow.
**Warstwa importowana** — wynik workflow, publikowany jako pliki statyczne.

**Limit „maksymalnie raz na tydzień”** obowiązuje na obu końcach:

- **Workflow**: harmonogram `cron` raz w tygodniu (np. poniedziałek 03:00 UTC). Ręczne uruchomienie (`workflow_dispatch`) jest możliwe, ale skrypt sprawdza datę ostatniego udanego pobrania i **odmawia**, jeśli minęło < 7 dni (chyba że podano jawny parametr `force`, np. po naprawie adaptera).
- **Aplikacja**: automatyczne sprawdzenie przy starcie najwyżej raz na 7 dni (data ostatniego sprawdzenia w IndexedDB). Przycisk „Update catalog” pobiera tylko mały `manifest.json` i ściąga dane wyłącznie, gdy jest nowsza wersja — skoro dane powstają raz w tygodniu, częstsze sprawdzanie i tak nic nie zmienia.

**Bezpieczniki automatycznej publikacji** (zamiast ręcznego przeglądu):

- Każdy rekord walidowany schematem; błędne rekordy odrzucane pojedynczo, nie cała paczka.
- Jeśli źródło nie odpowiada lub zmieniło format → dla tego źródła zostają dane z poprzedniego tygodnia.
- **Próg anomalii**: jeśli z jakiegoś źródła zniknie > 20% rekordów lub liczba błędów przekroczy próg → publikacja wstrzymana, workflow tworzy GitHub Issue z raportem.
- Każda publikacja ma raport zmian (`catalog/dist/CHANGELOG.json`: nowe / zmienione / usunięte), widoczny też w aplikacji.
- Historia wersji = historia gitu; aplikacja trzyma lokalnie poprzednią wersję i pozwala do niej wrócić.

**Pozostałe zasady:**

- Aplikacja nie łączy się ze źródłami bezpośrednio — tylko z naszymi plikami (brak problemów z CORS i limitami zapytań po stronie użytkownika).
- Każde źródło wymienione w UI (strona „About / Data sources”) z licencją i linkiem (D6).
- Projekty zapamiętują, z której wersji katalogu pochodzi każda pozycja (LIB‑03).
- Każda pozycja ma pola `source` i `confidence` (`curated` / `imported` / `estimated`).

### 5.2 Kandydackie źródła — aplikacje

| Źródło                                                   | Co daje                                              | Uwagi do sprawdzenia                                                                |
| -------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **awesome-selfhosted** (`awesome-selfhosted-data`, YAML) | duża lista aplikacji, licencje, kategorie            | CC‑BY‑SA → atrybucja                                                                |
| **Proxmox VE Community Scripts** (metadane JSON)         | **domyślne CPU/RAM/dysk** dla wielu aplikacji, porty | najlepsze źródło wymagań zasobowych                                                 |
| **LinuxServer.io** (API listy obrazów)                   | obrazy popularnych aplikacji, porty, wolumeny        |                                                                                     |
| **Docker Hub API**                                       | tagi, architektury (amd64/arm64), rozmiar obrazu     | limity zapytań — tylko dla obrazów z katalogu                                       |
| ~~selfh.st~~                                             | —                                                    | **nie pobieramy**: brak licencji danych i API; tylko link w README/About (`06` § 1) |
| Dokumentacja aplikacji                                   | minimalne wymagania, porty, zależności               | ręcznie, warstwa bazowa, top ~50–100 aplikacji                                      |

**Wzorce ruchu (dla symulacji D4) nie istnieją w żadnym źródle** — to nasza warstwa kurowana. Startujemy od ~30–50 najpopularniejszych aplikacji; dla pozostałych workflow generuje wzorce podstawowe z portów (inbound z LAN na zmapowane porty + outbound do internetu) z `confidence: estimated`.

### 5.3 Kandydackie źródła — sprzęt

Otwartych, kompletnych baz sprzętu jest mało; wiele serwisów (PassMark, TechPowerUp, Intel ARK) nie oferuje publicznego API, a ich warunki mogą zabraniać scrapowania. Workflow technicznie może czytać zwykłe strony WWW, ale korzystamy tylko ze źródeł, których warunki na to pozwalają (D6).

| Kategoria                 | Strategia                                                                                                                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CPU                       | Specyfikacje: warstwa kurowana (~100 CPU homelabowych) + Wikidata (CC0). **Wydajność: Blender Open Data** — automatycznie z wyników użytkowników, mediana znormalizowana do i5‑8500T = 100; braki szacowane (`06` § 3.1) |
| Mini PC / serwery / NAS   | Kurowana lista popularnych modeli homelabowych (Lenovo Tiny, HP Mini, Dell Micro, Intel NUC, Minisforum, Synology, QNAP, Raspberry Pi…)                                                                                  |
| Sieć (switch, router, AP) | Kurowana lista (MikroTik, Ubiquiti, TP‑Link Omada, Netgear…) + dane producentów                                                                                                                                          |
| Ceny                      | P2 — orientacyjne, ręcznie lub z dopuszczalnego źródła                                                                                                                                                                   |

Licencje, warunki i formaty wszystkich źródeł: `06-zrodla-danych.md`.

### 5.4 Funkcje katalogu

| ID     | Funkcja                                                                                                                                                                           | Prio |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| CAT-01 | Warstwa bazowa wbudowana w aplikację (działa bez sieci od pierwszego uruchomienia)                                                                                                | P0   |
| CAT-02 | Katalog aplikacji: ~50 aplikacji kurowanych (wymagania, obraz, porty, wolumeny, zależności, wzorce ruchu)                                                                         | P0   |
| CAT-03 | Workflow `catalog-update` (GitHub Actions, cron 1×/tydzień, blokada < 7 dni): adaptery, normalizacja, scalenie, walidacja, bezpieczniki, automatyczna publikacja                  | P1   |
| CAT-04 | Aktualizacja w aplikacji: auto‑sprawdzenie przy starcie max 1×/7 dni (wyłączalne) + przycisk „Update catalog”; status źródeł; podsumowanie zmian; cofnięcie do poprzedniej wersji | P1   |
| CAT-05 | Katalog sprzętu (kurowany + importowany)                                                                                                                                          | P1   |
| CAT-06 | „Suggest a correction” przy pozycji katalogowej → gotowe zgłoszenie (GitHub Issue) w publicznym repo                                                                              | P2   |

---

## 6. Zakres MVP

Cel MVP: **narysować lab, opisać sprzęt i aplikacje, sprawdzić capacity oraz zobaczyć, co z czym może się komunikować i co ma internet.**

| Moduł                  | Funkcje w MVP                |
| ---------------------- | ---------------------------- |
| M1 Projekty            | PRJ‑01…05                    |
| M2 Canvas              | CAN‑01…06                    |
| M2b Lokalizacje        | LOC‑01…04                    |
| M3 Biblioteka          | LIB‑01                       |
| M4 Sprzęt              | HW‑01…04                     |
| M5 Oprogramowanie      | SW‑01…07                     |
| M6 Sieć                | NET‑01…09                    |
| M7 Oznaczenia          | LBL‑01, LBL‑02               |
| M8 Walidacja/symulacja | VAL‑01…11, VAL‑13; SIM‑01…03 |
| M9 Capacity            | CAP‑01…03                    |
| M10 Widoki             | VIEW‑01                      |
| M11 Eksport            | EXP‑01, EXP‑02               |
| M12 Ustawienia         | SET‑01                       |
| Katalog                | CAT‑01, CAT‑02               |

**Wersja 1.0** dokłada: symulację przepływów aplikacji z animacją (FLW‑01…05), macierz dostępności i asercje, ekspozycję z internetu, workflow i aktualizacje katalogu, katalog sprzętu, zasilanie/UPS/PoE, widoki Inventory/IP Plan/Access, snapshoty, BOM, `docker-compose.yml`, dokumentację.

---

## 7. Internacjonalizacja (i18n)

Start: tylko **en**. Infrastruktura gotowa na kolejne języki bez refaktoryzacji.

**Zasady:**

1. **Zero tekstów w kodzie komponentów** — każdy tekst UI przez klucz: `t('canvas.toolbar.addDevice')`.
2. **Format ICU MessageFormat** — liczba mnoga i zmienne poprawne także dla polskiego (one/few/many/other).
3. **Pliki per język i przestrzeń nazw**, ładowane leniwie.
4. **Formatowanie przez `Intl`** — liczby, jednostki (GB/TB, Mb/s), waluty, daty — nigdy ręczne sklejanie.
5. **Teksty z silnika** (Issues, kroki symulacji) zwracane jako `{ code, params }`, tłumaczone dopiero w UI — silnik nie zna języka.
6. **Treści katalogu** (opisy aplikacji, nazwy kategorii) mają strukturę `{ en: "…" }` gotową na kolejne języki; brak tłumaczenia → fallback do `en`.
7. **Nazwy techniczne nie są tłumaczone** (VLAN, trunk, CIDR, nazwy aplikacji, nazwy OS).
8. Kontrola w CI: brakujące klucze, nieużywane klucze, niezgodność parametrów między językami.
9. Layout odporny na dłuższe teksty (DE/PL są ~30% dłuższe od EN); RTL — poza zakresem.

**Struktura:**

```
src/i18n/
├── config.ts              # lista języków, język domyślny/fallback = 'en'
├── locales/
│   └── en/
│       ├── common.json    # przyciski, akcje, ogólne
│       ├── canvas.json
│       ├── inspector.json
│       ├── network.json
│       ├── simulation.json
│       ├── capacity.json
│       ├── issues.json    # komunikaty walidacji: issues.VAL_01.title / .description / .fix
│       └── catalog.json   # kategorie, typy urządzeń
└── README.md              # jak dodać język
```

**Przykład (`en/issues.json`):**

```json
{
  "VAL_01": {
    "title": "Duplicate IP address",
    "description": "{ip} is assigned to {count, plural, one {# other interface} other {# other interfaces}}: {targets}.",
    "fix": "Assign next free address"
  }
}
```

Dodanie języka = skopiowanie `locales/en` → `locales/pl`, tłumaczenie, wpis w `config.ts`, odkrycie przełącznika (SET‑04).

---

## 8. Otwarte pytania

Brak. Ostatnie kwestie (licencje źródeł, źródło wydajności CPU) rozstrzygnięte w `06-zrodla-danych.md`. Szczegóły adapterów (dokładne schematy, lokalizacja metadanych Community Scripts) weryfikujemy przy implementacji workflow.
