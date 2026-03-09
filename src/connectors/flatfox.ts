/**
 * Flatfox API Connector — live Inserate von flatfox.ch
 *
 * Öffentliche API: https://flatfox.ch/api/v1/public-listing/
 * Keine Authentifizierung erforderlich.
 * Paginierung: limit=100, offset=n
 * Limitiert auf max. MAX_PAGES Seiten um Rate-Limiting zu vermeiden.
 */

import type { PriceData } from '../types';

const FLATFOX_API = 'https://flatfox.ch/api/v1/public-listing/';
const PAGE_SIZE = 100;
const MAX_PAGES = 30; // max 3000 Inserate

interface FlatfoxListing {
  pk: number;
  offer_type: string;
  object_category: string;
  rent_net: number | null;
  rent_gross: number | null;
  rent_charges: number | null;
  surface_living: number | null;
  number_of_rooms: string | null;
  zipcode: number;
  city: string;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  published: string;
}

interface FlatfoxResponse {
  count: number;
  next: string | null;
  results: FlatfoxListing[];
}

// PLZ → BFS-Gemeindenummer (Kanton Zürich)
// Quelle: Amtliches Ortschaftenverzeichnis der Schweizer Post (AMTOVZ), Stand 2024
// Deckt alle 160 Gemeinden des Kantons Zürich ab (257 PLZs)
const PLZ_TO_BFS: Record<string, string> = {
  // --- Bezirk Affoltern ---
  '8914': '1',   // Aeugst am Albis
  '8910': '2',   // Affoltern am Albis
  '8909': '2',
  '8906': '3',   // Bonstetten
  '8915': '4',   // Hausen am Albis
  '8925': '4',
  '8908': '5',   // Hedingen
  '8926': '6',   // Kappel am Albis
  '8934': '7',   // Knonau
  '8933': '8',   // Maschwanden
  '8932': '9',   // Mettmenstetten
  '8912': '10',  // Obfelden
  '8913': '11',  // Ottenbach
  '8911': '12',  // Rifferswil
  '8143': '13',  // Stallikon
  '8907': '14',  // Wettswil am Albis

  // --- Bezirk Andelfingen ---
  '8463': '22',  // Benken (ZH)
  '8415': '23',  // Berg am Irchel
  '8414': '24',  // Buch am Irchel
  '8447': '25',  // Dachsen
  '8458': '26',  // Dorf
  '8245': '27',  // Feuerthalen
  '8246': '27',
  '8416': '28',  // Flaach
  '8247': '29',  // Flurlingen
  '8444': '31',  // Henggart
  '8451': '33',  // Kleinandelfingen
  '8453': '33',
  '8461': '33',
  '8212': '34',  // Laufen-Uhwiesen
  '8248': '34',
  '8460': '35',  // Marthalen
  '8464': '35',
  '8475': '37',  // Ossingen
  '8462': '38',  // Rheinau
  '8478': '39',  // Thalheim an der Thur
  '8465': '40',  // Trüllikon
  '8466': '40',
  '8467': '41',  // Truttikon
  '8459': '43',  // Volken
  '8450': '291', // Andelfingen
  '8452': '291',
  '8457': '291',
  '8468': '292', // Stammheim
  '8476': '292',
  '8477': '292',
  '8525': '292',

  // --- Bezirk Bülach ---
  '8184': '51',  // Bachenbülach
  '8303': '52',  // Bassersdorf
  '8180': '53',  // Bülach
  '8305': '54',  // Dietlikon
  '8193': '55',  // Eglisau
  '8424': '56',  // Embrach
  '8427': '57',  // Freienstein-Teufen (dominiert PLZ 8427/8428 gegenüber Rorbas BFS 68)
  '8428': '57',
  '8192': '58',  // Glattfelden
  '8182': '59',  // Hochfelden
  '8181': '60',  // Höri
  '8194': '61',  // Hüntwangen
  '8302': '62',  // Kloten
  '8426': '63',  // Lufingen
  '8309': '64',  // Nürensdorf
  '8425': '65',  // Oberembrach
  '8152': '66',  // Opfikon
  '8197': '67',  // Rafz
  '8304': '69',  // Wallisellen
  '8195': '70',  // Wasterkingen
  '8196': '71',  // Wil (ZH)
  '8185': '72',  // Winkel

  // --- Bezirk Dielsdorf ---
  '8164': '81',  // Bachs
  '8113': '82',  // Boppelsen
  '8107': '83',  // Buchs (ZH)
  '8108': '84',  // Dällikon
  '8114': '85',  // Dänikon
  '8157': '86',  // Dielsdorf
  '8115': '87',  // Hüttikon
  '8173': '88',  // Neerach
  '8172': '89',  // Niederglatt
  '8155': '90',  // Niederhasli
  '8156': '90',
  '8166': '91',  // Niederweningen
  '8154': '92',  // Oberglatt
  '8112': '94',  // Otelfingen
  '8158': '95',  // Regensberg
  '8105': '96',  // Regensdorf
  '8106': '96',
  '8153': '97',  // Rümlang
  '8165': '99',  // Schöfflisdorf (PLZ 8165 wird mit Oberweningen/Schleinikon geteilt)
  '8174': '100', // Stadel
  '8175': '100',
  '8162': '101', // Steinmaur
  '8187': '102', // Weiach

  // --- Bezirk Hinwil ---
  '8344': '111', // Bäretswil
  '8345': '111',
  '8608': '112', // Bubikon
  '8633': '112',
  '8632': '113', // Dürnten
  '8635': '113',
  '8496': '114', // Fischenthal
  '8497': '114',
  '8498': '114',
  '8614': '115', // Gossau (ZH)
  '8624': '115',
  '8625': '115',
  '8626': '115',
  '8627': '116', // Grüningen
  '8340': '117', // Hinwil
  '8342': '117',
  '8630': '118', // Rüti (ZH)
  '8607': '119', // Seegräben
  '8636': '120', // Wald (ZH)
  '8637': '120',
  '8620': '121', // Wetzikon (ZH)
  '8623': '121',

  // --- Bezirk Horgen ---
  '8134': '131', // Adliswil
  '8802': '135', // Kilchberg (ZH)
  '8135': '136', // Langnau am Albis
  '8942': '137', // Oberrieden
  '8805': '138', // Richterswil
  '8833': '138',
  '8803': '139', // Rüschlikon
  '8800': '141', // Thalwil
  '8136': '141',

  // --- Bezirk Meilen ---
  '8703': '151', // Erlenbach (ZH)
  '8704': '152', // Herrliberg
  '8634': '153', // Hombrechtikon
  '8714': '153',
  '8700': '154', // Küsnacht (ZH)
  '8708': '155', // Männedorf
  '8706': '156', // Meilen
  '8618': '157', // Oetwil am See
  '8712': '158', // Stäfa
  '8713': '158',
  '8707': '159', // Uetikon am See
  '8126': '160', // Zumikon
  '8702': '161', // Zollikon
  '8125': '161',

  // --- Bezirk Pfäffikon ---
  '8320': '172', // Fehraltorf
  '8335': '173', // Hittnau
  '8310': '176', // Lindau
  '8312': '176',
  '8315': '176',
  '8317': '176',
  '8330': '177', // Pfäffikon
  '8331': '177',
  '8322': '178', // Russikon
  '8332': '178',
  '8484': '180', // Weisslingen
  '8492': '181', // Wila
  '8489': '182', // Wildberg

  // --- Bezirk Uster ---
  '8600': '191', // Dübendorf
  '8132': '192', // Egg
  '8133': '192',
  '8117': '193', // Fällanden
  '8118': '193',
  '8121': '193',
  '8122': '195', // Maur
  '8123': '195',
  '8124': '195',
  '8127': '195',
  '8617': '196', // Mönchaltorf
  '8603': '197', // Schwerzenbach
  '8610': '198', // Uster
  '8615': '198',
  '8616': '198',
  '8604': '199', // Volketswil
  '8605': '199',
  '8306': '200', // Wangen-Brüttisellen
  '8602': '200',

  // --- Bezirk Winterthur ---
  '8479': '211', // Altikon
  '8311': '213', // Brütten
  '8471': '214', // Dägerlen
  '8421': '215', // Dättlikon
  '8474': '216', // Dinhard
  '8548': '218', // Ellikon an der Thur
  '8352': '219', // Elsau
  '8500': '220', // Hagenbuch
  '8523': '220',
  '8442': '221', // Hettlingen
  '8412': '223', // Neftenbach
  '8413': '223',
  '8422': '224', // Pfungen
  '8545': '225', // Rickenbach (ZH)
  '8418': '226', // Schlatt (ZH)
  '8472': '227', // Seuzach
  '8363': '228', // Turbenthal
  '8488': '228',
  '8495': '228',
  '8400': '230', // Winterthur
  '8401': '230',
  '8402': '230',
  '8403': '230',
  '8404': '230',
  '8405': '230',
  '8406': '230',
  '8407': '230',
  '8408': '230',
  '8409': '230',
  '8482': '230',
  '8483': '231', // Zell (ZH)
  '8486': '231',
  '8487': '231',
  '8353': '294', // Elgg
  '8354': '294',
  '8355': '294',
  '8493': '297', // Bauma
  '8494': '297',
  '8499': '297',
  '8542': '298', // Wiesendangen
  '8543': '298',
  '8544': '298',
  '8546': '298',

  // --- Bezirk Dietikon ---
  '8904': '241', // Aesch (ZH)
  '8903': '242', // Birmensdorf (ZH)
  '8953': '243', // Dietikon
  '8954': '244', // Geroldswil
  '8102': '245', // Oberengstringen
  '8955': '246', // Oetwil an der Limmat
  '8952': '247', // Schlieren
  '8142': '248', // Uitikon
  '8103': '249', // Unterengstringen
  '8902': '250', // Urdorf
  '8951': '251', // Weiningen (ZH)
  '8104': '251',

  // --- Stadt Zürich: BFS 261 ---
  '8001': '261', '8002': '261', '8003': '261', '8004': '261',
  '8005': '261', '8006': '261', '8008': '261', '8032': '261',
  '8037': '261', '8038': '261', '8041': '261', '8044': '261',
  '8045': '261', '8046': '261', '8047': '261', '8048': '261',
  '8049': '261', '8050': '261', '8051': '261', '8052': '261',
  '8053': '261', '8055': '261', '8057': '261', '8064': '261',

  // --- Bezirk Horgen (weitere) ---
  '8804': '293', // Wädenswil
  '8820': '293',
  '8824': '293',
  '8825': '293',
  '8810': '295', // Horgen
  '8815': '295',
  '8816': '295',

  // --- Bezirk Pfäffikon (weitere) ---
  '8307': '296', // Illnau-Effretikon
  '8308': '296',
  '8314': '296',
};

// PLZ-Bereiche für Kanton Zürich (grob)
const ZH_PLZ_RANGES = [
  [8001, 8099], [8100, 8199], [8200, 8299], [8300, 8399],
  [8400, 8499], [8500, 8599], [8600, 8699], [8700, 8799],
  [8800, 8899], [8900, 8999], [8600, 8699],
] as const;

function isZurichPlz(plz: number): boolean {
  return ZH_PLZ_RANGES.some(([min, max]) => plz >= min && plz <= max);
}

function getEffectiveRent(listing: FlatfoxListing): number | null {
  // Bevorzuge Nettomiete, fallback auf Bruttomiete
  const rent = listing.rent_net ?? listing.rent_gross;
  if (!rent || rent <= 0) return null;
  return rent;
}

async function fetchPage(offset: number): Promise<FlatfoxResponse> {
  const params = new URLSearchParams({
    canton: 'ZH',
    object_category: 'APARTMENT',
    offer_type: 'RENT',
    limit: String(PAGE_SIZE),
    offset: String(offset),
  });

  const res = await fetch(`${FLATFOX_API}?${params}`, {
    next: { revalidate: 3600 }, // 1h Cache
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) throw new Error(`Flatfox API Fehler: ${res.status}`);
  return res.json() as Promise<FlatfoxResponse>;
}

// Aggregiert Listings nach PLZ → PriceData[]
function aggregate(listings: FlatfoxListing[], roomsFilter?: number): PriceData[] {
  const byPlz = new Map<
    string,
    { city: string; rents: number[]; rentsM2: number[]; updated: string }
  >();

  for (const listing of listings) {
    const plz = String(listing.zipcode);
    if (!isZurichPlz(listing.zipcode)) continue;

    // Clientseitiger Zimmerfilter: 1+ = [1.0, 2.0), 2+ = [2.0, 3.0), ..., 5+ = [5.0, ∞)
    if (roomsFilter !== undefined) {
      const rooms = parseFloat(listing.number_of_rooms ?? '');
      if (isNaN(rooms)) continue;
      if (roomsFilter < 5) {
        if (rooms < roomsFilter || rooms >= roomsFilter + 1) continue;
      } else {
        if (rooms < 5) continue;
      }
    }

    const rent = getEffectiveRent(listing);
    if (!rent) continue;

    // Datenfehler / Parkplätze ausfiltern
    if (rent < 400 || rent > 10_000) continue;

    if (!byPlz.has(plz)) {
      byPlz.set(plz, { city: listing.city, rents: [], rentsM2: [], updated: listing.published });
    }
    const entry = byPlz.get(plz)!;
    entry.rents.push(rent);

    if (listing.surface_living && listing.surface_living > 10) {
      entry.rentsM2.push(rent / listing.surface_living);
    }
    if (listing.published > entry.updated) entry.updated = listing.published;
  }

  const today = new Date().toISOString().slice(0, 10);
  const result: PriceData[] = [];

  // Debug: Top-10 PLZs nach Inserate-Anzahl loggen
  const sorted = [...byPlz.entries()].sort((a, b) => b[1].rents.length - a[1].rents.length);
  const top10 = sorted.slice(0, 10);
  console.log('[Flatfox] Inserate pro PLZ (Top 10):');
  for (const [plz, data] of top10) {
    console.log(`  PLZ ${plz} (${data.city}): ${data.rents.length} Inserate`);
  }

  for (const [plz, data] of byPlz) {
    // Mindestens 3 gültige Inserate — sonst greift der kantionale Fallback
    if (data.rents.length < 3) continue;
    const bfsId = PLZ_TO_BFS[plz] ?? `plz-${plz}`;
    const sorted = [...data.rents].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];

    let medianM2 = 0;
    if (data.rentsM2.length > 0) {
      const sortedM2 = [...data.rentsM2].sort((a, b) => a - b);
      const midM2 = Math.floor(sortedM2.length / 2);
      medianM2 = sortedM2.length % 2 === 0
        ? (sortedM2[midM2 - 1] + sortedM2[midM2]) / 2
        : sortedM2[midM2];
    }

    result.push({
      gemeinde_id: bfsId,
      gemeinde_name: data.city,
      avg_rent: Math.round(median),
      avg_rent_m2: Math.round(medianM2 * 10) / 10,
      sample_size: data.rents.length,
      last_updated: data.updated.slice(0, 10) || today,
      source: 'scraper',
    });
  }

  return result;
}

export async function fetchFromFlatfox(roomsFilter?: number): Promise<PriceData[]> {
  const allListings: FlatfoxListing[] = [];

  // Erste Seite laden um Gesamtanzahl zu kennen
  const first = await fetchPage(0);
  allListings.push(...first.results);

  const totalPages = Math.min(Math.ceil(first.count / PAGE_SIZE), MAX_PAGES);

  // Restliche Seiten parallel laden (max 5 gleichzeitig)
  const batchSize = 5;
  for (let page = 1; page < totalPages; page += batchSize) {
    const batch = Array.from(
      { length: Math.min(batchSize, totalPages - page) },
      (_, i) => fetchPage((page + i) * PAGE_SIZE),
    );
    const pages = await Promise.all(batch);
    for (const p of pages) allListings.push(...p.results);
  }

  return aggregate(allListings, roomsFilter);
}
