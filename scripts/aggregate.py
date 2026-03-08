#!/usr/bin/env python3
"""
Aggregations-Script — raw-listings.json → homegate-prices.json

Liest data/raw-listings.json (Output von scrape-homegate.py),
gruppiert nach Gemeinde/PLZ, berechnet Median-Mietpreise.

Verwendung:
    python scripts/aggregate.py

Output:
    public/data/homegate-prices.json
"""

from __future__ import annotations

import json
import statistics
import logging
from pathlib import Path
from datetime import date
from collections import defaultdict

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# ── Pfade ─────────────────────────────────────────────────────────────────────
ROOT = Path(__file__).parent.parent
INPUT_FILE  = ROOT / "data"   / "raw-listings.json"
OUTPUT_FILE = ROOT / "public" / "data" / "homegate-prices.json"

# Zimmerzahl-Gruppen — None = alle Zimmer zusammen
ROOM_GROUPS = [None, 1, 2, 3, 4, 5]

# Mindest-Stichprobengrösse für einen Datenpunkt
MIN_SAMPLE = 3


# ── PLZ → BFS-Mapping ────────────────────────────────────────────────────────
# Vereinfachtes Mapping PLZ → Gemeindename für Kanton Zürich.
# Vollständiges Mapping: https://www.cadastre.ch/de/services/service/plz.html
# Bei unbekannten PLZ wird der Stadtname aus dem Inserat verwendet.
PLZ_TO_GEMEINDE: dict[str, str] = {
    # Stadt Zürich
    "8001": "Zürich", "8002": "Zürich", "8003": "Zürich", "8004": "Zürich",
    "8005": "Zürich", "8006": "Zürich", "8008": "Zürich", "8032": "Zürich",
    "8037": "Zürich", "8038": "Zürich", "8041": "Zürich", "8044": "Zürich",
    "8045": "Zürich", "8046": "Zürich", "8047": "Zürich", "8048": "Zürich",
    "8049": "Zürich", "8050": "Zürich", "8051": "Zürich", "8052": "Zürich",
    "8053": "Zürich", "8055": "Zürich", "8057": "Zürich", "8064": "Zürich",
    # Winterthur
    "8400": "Winterthur", "8401": "Winterthur", "8402": "Winterthur",
    "8403": "Winterthur", "8404": "Winterthur", "8405": "Winterthur",
    "8406": "Winterthur", "8408": "Winterthur",
    # Weitere Gemeinden (Auswahl)
    "8700": "Küsnacht (ZH)", "8702": "Zollikon", "8703": "Erlenbach (ZH)",
    "8704": "Herrliberg", "8706": "Meilen", "8708": "Männedorf",
    "8712": "Stäfa", "8713": "Uerikon", "8714": "Feldbach",
    "8800": "Thalwil", "8802": "Kilchberg (ZH)", "8803": "Rüschlikon",
    "8804": "Au (ZH)", "8805": "Richterswil", "8806": "Bäch",
    "8820": "Wädenswil", "8832": "Wilen b. Wollerau",
    "8834": "Schindellegi", "8835": "Feusisberg",
    "8840": "Einsiedeln",  # SZ, aber nah an ZH
    "8600": "Dübendorf", "8602": "Wangen b. Dübendorf", "8603": "Schwerzenbach",
    "8604": "Volketswil", "8606": "Greifensee", "8607": "Aathal-Seegräben",
    "8608": "Bubikon", "8610": "Uster", "8614": "Sulzbach",
    "8615": "Wermatswil", "8616": "Riedikon", "8617": "Mönchaltorf",
    "8618": "Oetwil a.d.L.", "8620": "Wetzikon (ZH)", "8623": "Wetzikon (ZH)",
    "8624": "Grüt (Gossau ZH)", "8625": "Gossau (ZH)", "8626": "Ottikon b. Kemptthal",
    "8627": "Grüningen",
    "8900": "Baar",  # ZG, aber oft in ZH gelistet
    "8902": "Urdorf", "8903": "Birmensdorf (ZH)", "8904": "Aesch (ZH)",
    "8906": "Bonstetten", "8907": "Wettswil a.A.", "8908": "Hedingen",
    "8910": "Affoltern a.A.", "8911": "Rifferswil", "8912": "Obfelden",
    "8913": "Ottenbach", "8914": "Aeugst a.A.", "8915": "Hausen a.A.",
    "8925": "Ebertswil", "8926": "Kappel a.A.",
    "8952": "Schlieren", "8953": "Dietikon", "8954": "Geroldswil",
    "8955": "Oetwil a.d.L.",
    "8960": "Männedorf",
    "8962": "Bergdietikon",
    "8964": "Rudolfstetten",
    "8965": "Berikon", "8966": "Oberwil-Lieli",
    "8967": "None",
    "8200": "Schaffhausen",  # nicht ZH, aber manchmal gelistet
    "8302": "Kloten", "8303": "Bassersdorf", "8304": "Wallisellen",
    "8305": "Dietlikon", "8306": "Brüttisellen", "8307": "Effretikon",
    "8308": "Illnau", "8309": "Nürensdorf",
    "8310": "Grafstal",
    "8317": "Tagelswangen", "8320": "Fehraltorf", "8322": "Madetswil",
    "8330": "Pfäffikon (ZH)", "8331": "Auslikon", "8332": "Russell",
    "8340": "Hinwil", "8342": "Wernetshausen",
    "8352": "Raterschen", "8353": "Elgg", "8354": "Hofstetten b. Elgg",
    "8360": "Eschlikon",
    "8370": "Sirnach",
    "8400": "Winterthur",
    "8412": "Aesch (ZH)", "8413": "Neftenbach", "8414": "Buch am Irchel",
    "8415": "Berg am Irchel", "8416": "Flaach",
    "8418": "Schlatt b. Winterthur",
    "8421": "Dättlikon", "8422": "Pfungen",
    "8424": "Embrach", "8425": "Oberembrach", "8426": "Lufingen",
    "8427": "Freienstein", "8428": "Teufen b. Winterthur",
    "8442": "Hettlingen", "8444": "Henggart", "8447": "Dachsen",
    "8450": "Andelfingen", "8451": "Kleinandelfingen",
    "8452": "Adlikon b. Andelfingen", "8453": "Alten", "8454": "Buchberg",
    "8455": "Rüdlingen", "8457": "Humlikon", "8458": "Dorf (ZH)",
    "8459": "Volken", "8460": "Marthalen", "8461": "Oerlingen",
    "8462": "Rheinau", "8463": "Benken (ZH)", "8464": "Ellikon am Rhein",
    "8465": "Rudolfingen", "8466": "Trüllikon", "8467": "Truttikon",
    "8468": "Waltalingen", "8471": "Oberwil (Dägerlen)",
    "8472": "Seuzach", "8474": "Dinhard", "8475": "Ossingen",
    "8476": "Unterstammheim", "8477": "Oberstammheim",
    "8478": "Thalheim an der Thur", "8479": "Altikon",
    "8482": "Sennhof (Winterthur)",
    "8483": "Kollbrunn", "8484": "Theilingen",
    "8486": "Rikon im Tösstal", "8487": "Rämismühle",
    "8488": "Turbenthal", "8489": "Wildberg",
    "8492": "Wila", "8493": "Saland", "8494": "Bauma",
    "8495": "Schmidrüti", "8496": "Steg im Tösstal",
    "8497": "Stürzikon", "8498": "Gibswil-Ried",
    "8499": "Sternenberg",
    "8500": "Frauenfeld",  # TG
    "8542": "Wiesendangen", "8543": "Gundetswil",
    "8544": "Attikon", "8545": "Rickenbach b. Wiesendangen",
    "8546": "Kefikon im Rickenbach",
    "8547": "Gachnang",
    "8548": "Ellikon an der Thur",
    "8700": "Küsnacht (ZH)", "8702": "Zollikon",
}


def get_gemeinde_name(zip_code: str, city: str) -> str:
    """Gibt den Gemeindenamen zurück — aus PLZ-Mapping oder Fallback auf city."""
    return PLZ_TO_GEMEINDE.get(zip_code, city)


def group_listings(listings: list[dict]) -> dict:
    """
    Gruppiert Inserate nach (plz, gemeinde_name, rooms).
    Gibt dict zurück: {(plz, gemeinde): {rooms_str: [prices]}}
    """
    groups: dict = defaultdict(lambda: defaultdict(list))

    for listing in listings:
        zip_code = listing.get("zip", "")
        city = listing.get("city", "")
        price = listing.get("price_chf")
        area = listing.get("area_m2")
        rooms = listing.get("rooms")

        if not price or not zip_code:
            continue

        gemeinde = get_gemeinde_name(zip_code, city)
        key = (zip_code, gemeinde)

        # Rooms-Key: gerundet auf 0.5 Schritte, oder "all"
        if rooms is not None:
            rooms_rounded = round(rooms * 2) / 2  # 0.5er Schritte
            rooms_key = str(rooms_rounded)
        else:
            rooms_key = "unknown"

        entry = {"price": price}
        if area and area > 0:
            entry["price_m2"] = price / area

        groups[key]["all"].append(entry)
        groups[key][rooms_key].append(entry)

    return groups


def compute_stats(entries: list[dict]) -> dict:
    """Berechnet Median-Preis und Preis/m² aus einer Liste von Einträgen."""
    prices = [e["price"] for e in entries]
    prices_m2 = [e["price_m2"] for e in entries if "price_m2" in e]

    return {
        "median_rent": round(statistics.median(prices)),
        "mean_rent": round(statistics.mean(prices)),
        "median_rent_m2": round(statistics.median(prices_m2), 2) if prices_m2 else None,
        "count": len(prices),
    }


def aggregate(listings: list[dict]) -> list[dict]:
    """Aggregiert Inserate zu Gemeinde-Statistiken."""
    groups = group_listings(listings)
    results = []

    for (zip_code, gemeinde), room_data in groups.items():
        all_entries = room_data.get("all", [])
        if len(all_entries) < MIN_SAMPLE:
            log.debug(f"Überspringe {gemeinde} ({zip_code}): nur {len(all_entries)} Inserate")
            continue

        stats_all = compute_stats(all_entries)

        # Per-Zimmer-Statistiken
        by_rooms = {}
        for rooms_key, entries in room_data.items():
            if rooms_key == "all":
                continue
            if len(entries) < MIN_SAMPLE:
                continue
            by_rooms[rooms_key] = compute_stats(entries)

        results.append({
            "plz": zip_code,
            "gemeinde": gemeinde,
            "median_rent": stats_all["median_rent"],
            "mean_rent": stats_all["mean_rent"],
            "median_rent_m2": stats_all["median_rent_m2"],
            "count": stats_all["count"],
            "by_rooms": by_rooms,
            "last_updated": date.today().isoformat(),
            "source": "homegate_scraper",
        })

    # Sortiert nach Gemeindename
    results.sort(key=lambda x: x["gemeinde"])
    return results


# ── Entry Point ───────────────────────────────────────────────────────────────

def main():
    log.info("=== Aggregations-Script ===")

    if not INPUT_FILE.exists():
        log.error(f"Input-Datei nicht gefunden: {INPUT_FILE}")
        log.error("Bitte zuerst scrape-homegate.py ausführen.")
        raise SystemExit(1)

    raw_text = INPUT_FILE.read_text(encoding="utf-8")
    listings: list[dict] = json.loads(raw_text)
    log.info(f"Geladene Inserate: {len(listings)}")

    results = aggregate(listings)
    log.info(f"Aggregierte Gemeinden: {len(results)}")

    # Statistik-Übersicht
    total_listings = sum(r["count"] for r in results)
    if results:
        rents = [r["median_rent"] for r in results]
        log.info(f"Gesamt-Inserate in Ausgabe: {total_listings}")
        log.info(f"Median-Mietpreis min/max: {min(rents)} / {max(rents)} CHF")
        log.info(f"Median über alle Gemeinden: {sorted(rents)[len(rents)//2]} CHF")

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(
        json.dumps(results, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    log.info(f"Gespeichert: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
