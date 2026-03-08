#!/usr/bin/env python3
"""
Flatfox API Connector — Mietinserate Kanton Zürich

Paginiert durch alle Seiten der Flatfox-API und speichert Rohdaten.

Verwendung:
    python scripts/scrape-homegate.py            # Alle Seiten
    python scripts/scrape-homegate.py --probe    # Nur erste Seite
    python scripts/scrape-homegate.py --pages 5  # Max. 5 Seiten

Output:
    data/raw-listings.json
"""

from __future__ import annotations

import json
import time
import logging
import sys
import argparse
from pathlib import Path
from datetime import date
from typing import Optional

import requests

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# ── Pfade ─────────────────────────────────────────────────────────────────────
ROOT        = Path(__file__).parent.parent
OUTPUT_FILE = ROOT / "data" / "raw-listings.json"

# ── Konfiguration ─────────────────────────────────────────────────────────────
PAGE_SIZE  = 100
MAX_PAGES  = 200
RATE_LIMIT = 1.0   # Sekunden zwischen Requests
MAX_RETRY  = 3

API_BASE = "https://flatfox.ch/api/v1/flat/"

BASE_PARAMS = {
    "canton":            "ZH",
    "object_category":   "APARTMENT",
    "offer_type":        "RENT",
    "limit":             PAGE_SIZE,
}

HEADERS = {
    "User-Agent": "zurich-rent-heatmap/1.0 (research project)",
    "Accept":     "application/json",
}


# ── API-Abfrage ───────────────────────────────────────────────────────────────

def fetch_page(session: requests.Session, offset: int) -> Optional[dict]:
    """Holt eine Seite von der Flatfox API."""
    params = {**BASE_PARAMS, "offset": offset}

    for attempt in range(1, MAX_RETRY + 1):
        try:
            resp = session.get(API_BASE, params=params, timeout=15)
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException as e:
            log.warning(f"Request-Fehler offset={offset} (Versuch {attempt}): {e}")
            if attempt < MAX_RETRY:
                time.sleep(RATE_LIMIT * attempt)

    return None


# ── Listing-Parser ────────────────────────────────────────────────────────────

def parse_listing(raw: dict) -> Optional[dict]:
    """Normalisiert ein Flatfox-Inserat auf das interne Format."""
    try:
        price = raw.get("rent_gross") or raw.get("rent_net")
        if not price:
            return None

        zip_code = raw.get("zip_code") or raw.get("zipcode") or raw.get("zip")
        city     = raw.get("city") or raw.get("place")
        if not zip_code or not city:
            return None

        area  = raw.get("living_area") or raw.get("floor_space")
        rooms = raw.get("number_of_rooms") or raw.get("rooms")

        return {
            "listing_id": raw.get("pk") or raw.get("id"),
            "price_chf":  float(price),
            "area_m2":    float(area)  if area  else None,
            "rooms":      float(rooms) if rooms else None,
            "zip":        str(zip_code).strip(),
            "city":       str(city).strip(),
            "scraped_at": date.today().isoformat(),
            "source":     "flatfox",
        }
    except (KeyError, TypeError, ValueError) as e:
        log.debug(f"Parse-Fehler: {e} — {raw.get('pk')}")
        return None


# ── Haupt-Connector ───────────────────────────────────────────────────────────

def run_scraper(probe_only: bool, max_pages: int) -> list[dict]:
    """Paginiert durch die Flatfox API und gibt geparste Inserate zurück."""

    session = requests.Session()
    session.headers.update(HEADERS)

    all_listings: list[dict] = []
    offset = 0
    page   = 0

    log.info("=== Flatfox API Connector — Kanton Zürich ===")
    log.info(f"Endpunkt: {API_BASE}")

    while page < min(max_pages, MAX_PAGES):
        data = fetch_page(session, offset)

        if data is None:
            log.error(f"Seite bei offset={offset} fehlgeschlagen — Abbruch.")
            break

        results = data.get("results") or []
        total   = data.get("count") or 0

        if page == 0:
            log.info(f"Flatfox meldet {total} Inserate total")

        if not results:
            log.info("Keine weiteren Inserate — fertig.")
            break

        for raw in results:
            parsed = parse_listing(raw)
            if parsed:
                all_listings.append(parsed)

        log.info(
            f"offset={offset:>5}  +{len(results)} Inserate  "
            f"gesamt: {len(all_listings)}"
        )

        if probe_only:
            log.info("--probe: stoppe nach erster Seite.")
            break

        # Nächste Seite
        if not data.get("next"):
            log.info("Kein 'next'-Link — letzte Seite erreicht.")
            break

        offset += PAGE_SIZE
        page   += 1
        time.sleep(RATE_LIMIT)

    return all_listings


# ── Entry Point ───────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Flatfox API Connector — Kanton Zürich",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--probe", action="store_true",
                        help="Nur erste Seite abrufen (zum Testen)")
    parser.add_argument("--pages", type=int, default=MAX_PAGES,
                        help=f"Max. Seiten (Standard: {MAX_PAGES})")
    args = parser.parse_args()

    listings = run_scraper(probe_only=args.probe, max_pages=args.pages)

    if not listings:
        log.error("Keine Inserate — Abbruch.")
        sys.exit(1)

    # Duplikate entfernen (nach listing_id)
    seen:   set[str]  = set()
    unique: list[dict] = []
    for listing in listings:
        lid = str(listing.get("listing_id") or "")
        if lid and lid in seen:
            continue
        if lid:
            seen.add(lid)
        unique.append(listing)

    log.info(f"Gesamt: {len(unique)} eindeutige Inserate")

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(
        json.dumps(unique, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    log.info(f"Gespeichert: {OUTPUT_FILE}")
    log.info("Nächster Schritt: python scripts/aggregate.py")


if __name__ == "__main__":
    main()
