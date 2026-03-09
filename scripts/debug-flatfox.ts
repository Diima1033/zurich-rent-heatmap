/**
 * Debug-Script: Flatfox-Daten-Pipeline analysieren
 * Aufruf: npx tsx scripts/debug-flatfox.ts
 */

import { readFileSync } from 'fs';
import path from 'path';

const FLATFOX_API = 'https://flatfox.ch/api/v1/public-listing/';
const PAGE_SIZE = 100;
const MAX_PAGES = 30;

// --- PLZ_TO_BFS aus flatfox.ts (kopiert) ---
const PLZ_TO_BFS: Record<string, string> = {
  '8914': '1', '8910': '2', '8909': '2', '8906': '3', '8915': '4', '8925': '4',
  '8908': '5', '8926': '6', '8934': '7', '8933': '8', '8932': '9', '8912': '10',
  '8913': '11', '8911': '12', '8143': '13', '8907': '14',
  '8463': '22', '8415': '23', '8414': '24', '8447': '25', '8458': '26',
  '8245': '27', '8246': '27', '8416': '28', '8247': '29', '8444': '31',
  '8451': '33', '8453': '33', '8461': '33', '8212': '34', '8248': '34',
  '8460': '35', '8464': '35', '8475': '37', '8462': '38', '8478': '39',
  '8465': '40', '8466': '40', '8467': '41', '8459': '43',
  '8450': '291', '8452': '291', '8457': '291',
  '8468': '292', '8476': '292', '8477': '292', '8525': '292',
  '8184': '51', '8303': '52', '8180': '53', '8305': '54', '8193': '55',
  '8424': '56', '8427': '57', '8428': '57', '8192': '58', '8182': '59',
  '8181': '60', '8194': '61', '8302': '62', '8426': '63', '8309': '64',
  '8425': '65', '8152': '66', '8197': '67', '8304': '69', '8195': '70',
  '8196': '71', '8185': '72',
  '8164': '81', '8113': '82', '8107': '83', '8108': '84', '8114': '85',
  '8157': '86', '8115': '87', '8173': '88', '8172': '89', '8155': '90',
  '8156': '90', '8166': '91', '8154': '92', '8112': '94', '8158': '95',
  '8105': '96', '8106': '96', '8153': '97', '8165': '99', '8174': '100',
  '8175': '100', '8162': '101', '8187': '102',
  '8344': '111', '8345': '111', '8608': '112', '8633': '112', '8632': '113',
  '8635': '113', '8496': '114', '8497': '114', '8498': '114', '8614': '115',
  '8624': '115', '8625': '115', '8626': '115', '8627': '116', '8340': '117',
  '8342': '117', '8630': '118', '8607': '119', '8636': '120', '8637': '120',
  '8620': '121', '8623': '121',
  '8134': '131', '8802': '135', '8135': '136', '8942': '137', '8805': '138',
  '8833': '138', '8803': '139', '8800': '141', '8136': '141',
  '8703': '151', '8704': '152', '8634': '153', '8714': '153', '8700': '154',
  '8708': '155', '8706': '156', '8618': '157', '8712': '158', '8713': '158',
  '8707': '159', '8126': '160', '8702': '161', '8125': '161',
  '8320': '172', '8335': '173', '8310': '176', '8312': '176', '8315': '176',
  '8317': '176', '8330': '177', '8331': '177', '8322': '178', '8332': '178',
  '8484': '180', '8492': '181', '8489': '182',
  '8600': '191', '8132': '192', '8133': '192', '8117': '193', '8118': '193',
  '8121': '193', '8122': '195', '8123': '195', '8124': '195', '8127': '195',
  '8617': '196', '8603': '197', '8610': '198', '8615': '198', '8616': '198',
  '8604': '199', '8605': '199', '8306': '200', '8602': '200',
  '8479': '211', '8311': '213', '8471': '214', '8421': '215', '8474': '216',
  '8548': '218', '8352': '219', '8500': '220', '8523': '220', '8442': '221',
  '8412': '223', '8413': '223', '8422': '224', '8545': '225', '8418': '226',
  '8472': '227', '8363': '228', '8488': '228', '8495': '228',
  '8400': '230', '8401': '230', '8402': '230', '8403': '230', '8404': '230',
  '8405': '230', '8406': '230', '8407': '230', '8408': '230', '8409': '230',
  '8482': '230', '8483': '231', '8486': '231', '8487': '231',
  '8353': '294', '8354': '294', '8355': '294',
  '8493': '297', '8494': '297', '8499': '297',
  '8542': '298', '8543': '298', '8544': '298', '8546': '298',
  '8904': '241', '8903': '242', '8953': '243', '8954': '244', '8102': '245',
  '8955': '246', '8952': '247', '8142': '248', '8103': '249', '8902': '250',
  '8951': '251', '8104': '251',
  '8001': '261', '8002': '261', '8003': '261', '8004': '261',
  '8005': '261', '8006': '261', '8008': '261', '8032': '261',
  '8037': '261', '8038': '261', '8041': '261', '8044': '261',
  '8045': '261', '8046': '261', '8047': '261', '8048': '261',
  '8049': '261', '8050': '261', '8051': '261', '8052': '261',
  '8053': '261', '8055': '261', '8057': '261', '8064': '261',
  '8804': '293', '8820': '293', '8824': '293', '8825': '293',
  '8810': '295', '8815': '295', '8816': '295',
  '8307': '296', '8308': '296', '8314': '296',
};

const ZH_PLZ_RANGES = [
  [8001, 8099], [8100, 8199], [8200, 8299], [8300, 8399],
  [8400, 8499], [8500, 8599], [8600, 8699], [8700, 8799],
  [8800, 8899], [8900, 8999],
] as const;

function isZurichPlz(plz: number): boolean {
  return ZH_PLZ_RANGES.some(([min, max]) => plz >= min && plz <= max);
}

interface FlatfoxListing {
  pk: number;
  offer_type: string;
  object_category: string;
  rent_net: number | null;
  rent_gross: number | null;
  surface_living: number | null;
  number_of_rooms: string | null;
  zipcode: number;
  city: string;
  published: string;
}

interface FlatfoxResponse {
  count: number;
  next: string | null;
  results: FlatfoxListing[];
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
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Flatfox API Fehler: ${res.status} ${res.statusText}`);
  return res.json() as Promise<FlatfoxResponse>;
}

async function main() {
  console.log('=== Flatfox Debug-Script ===\n');

  // 1. GeoJSON BFS-Nummern laden
  const geojsonPath = path.join(process.cwd(), 'public/geodata/kanton-zuerich-gemeinden.geojson');
  const geojson = JSON.parse(readFileSync(geojsonPath, 'utf-8'));
  const geojsonBfsSet = new Set<string>();
  const geojsonBfsNames = new Map<string, string>();
  for (const feature of geojson.features) {
    const bfs = String(feature.properties?.bfs ?? '');
    const name = feature.properties?.name ?? '?';
    if (bfs) {
      geojsonBfsSet.add(bfs);
      geojsonBfsNames.set(bfs, name);
    }
  }
  console.log(`GeoJSON: ${geojsonBfsSet.size} Features mit BFS-Nummer gefunden\n`);

  // 2. Alle Flatfox-Seiten laden
  console.log('Lade Flatfox-Daten (max 30 Seiten = 3000 Inserate)...');
  const first = await fetchPage(0);
  const total = first.count;
  const totalPages = Math.min(Math.ceil(total / PAGE_SIZE), MAX_PAGES);
  console.log(`  → API meldet ${total} Inserate total, lade ${totalPages} Seiten\n`);

  const allListings: FlatfoxListing[] = [...first.results];
  const batchSize = 5;
  for (let page = 1; page < totalPages; page += batchSize) {
    const batch = Array.from(
      { length: Math.min(batchSize, totalPages - page) },
      (_, i) => fetchPage((page + i) * PAGE_SIZE),
    );
    const pages = await Promise.all(batch);
    for (const p of pages) allListings.push(...p.results);
    process.stdout.write(`  Geladen: ${allListings.length}/${Math.min(total, MAX_PAGES * PAGE_SIZE)}\r`);
  }
  console.log(`\n  → ${allListings.length} Inserate geladen\n`);

  // 3. Inserate nach PLZ gruppieren (nur ZH)
  const byPlz = new Map<string, { city: string; count: number; withRent: number }>();
  let nonZhCount = 0;
  let noRentCount = 0;

  for (const l of allListings) {
    if (!isZurichPlz(l.zipcode)) { nonZhCount++; continue; }
    const plz = String(l.zipcode);
    const rent = l.rent_net ?? l.rent_gross;
    const hasRent = !!(rent && rent > 400 && rent < 10_000);
    if (!hasRent) noRentCount++;

    if (!byPlz.has(plz)) byPlz.set(plz, { city: l.city, count: 0, withRent: 0 });
    const e = byPlz.get(plz)!;
    e.count++;
    if (hasRent) e.withRent++;
  }

  console.log(`--- Filterung ---`);
  console.log(`  Nicht-ZH PLZ ausgefiltert: ${nonZhCount}`);
  console.log(`  Ohne gültige Miete (in ZH): ${noRentCount}`);
  console.log(`  PLZs mit Inseraten: ${byPlz.size}\n`);

  // 4. Alle PLZs sortiert nach Inserate-Anzahl ausgeben
  const sortedPlz = [...byPlz.entries()].sort((a, b) => b[1].count - a[1].count);
  console.log('--- Inserate pro PLZ (alle, absteigend) ---');
  console.log('PLZ      Stadt                   Total  m.Miete  BFS-Match  BFS-Nr');
  console.log('─'.repeat(75));
  for (const [plz, data] of sortedPlz) {
    const bfs = PLZ_TO_BFS[plz];
    const bfsMatch = bfs ? `✓ ${bfs.padStart(3)}` : '✗ KEIN MATCH';
    console.log(
      `${plz}     ${data.city.padEnd(24)}${String(data.count).padStart(5)}  ${String(data.withRent).padStart(7)}  ${bfsMatch}`
    );
  }

  // 5. PLZs ohne BFS-Mapping
  const unmappedPlzs = sortedPlz.filter(([plz]) => !PLZ_TO_BFS[plz]);
  console.log(`\n--- PLZs OHNE BFS-Mapping (${unmappedPlzs.length}) ---`);
  if (unmappedPlzs.length === 0) {
    console.log('  Alle PLZs haben ein BFS-Mapping!');
  } else {
    for (const [plz, data] of unmappedPlzs) {
      console.log(`  PLZ ${plz} (${data.city}): ${data.count} Inserate, ${data.withRent} mit Miete`);
    }
  }

  // 6. BFS welche nicht durch PLZ abgedeckt werden
  const coveredBfs = new Set(Object.values(PLZ_TO_BFS));
  const uncoveredBfs = [...geojsonBfsSet].filter(bfs => !coveredBfs.has(bfs)).sort((a, b) => Number(a) - Number(b));

  console.log(`\n--- BFS-Nummern aus GeoJSON OHNE PLZ-Mapping (${uncoveredBfs.length}) ---`);
  if (uncoveredBfs.length === 0) {
    console.log('  Alle GeoJSON-BFS-Nummern haben ein PLZ-Mapping!');
  } else {
    for (const bfs of uncoveredBfs) {
      console.log(`  BFS ${bfs.padStart(4)}: ${geojsonBfsNames.get(bfs) ?? '?'}`);
    }
  }

  // 7. BFS welche Daten hätten (≥3 Inserate) vs nicht
  const bfsByInserate = new Map<string, { name: string; count: number }>();
  for (const [plz, data] of byPlz) {
    const bfs = PLZ_TO_BFS[plz];
    if (!bfs) continue;
    if (!bfsByInserate.has(bfs)) {
      bfsByInserate.set(bfs, { name: data.city, count: 0 });
    }
    bfsByInserate.get(bfs)!.count += data.withRent;
  }

  const bfsWithEnough = [...bfsByInserate.entries()].filter(([, d]) => d.count >= 3);
  const bfsWithTooFew = [...bfsByInserate.entries()].filter(([, d]) => d.count > 0 && d.count < 3);

  console.log(`\n--- Zusammenfassung ---`);
  console.log(`  BFS mit ≥3 Inseraten (→ Flatfox-Daten): ${bfsWithEnough.length}`);
  console.log(`  BFS mit 1-2 Inseraten (→ kein Flatfox): ${bfsWithTooFew.length}`);
  console.log(`  BFS ohne Inserate (→ kein Flatfox):     ${geojsonBfsSet.size - bfsByInserate.size}`);
  console.log(`  BFS gesamt in GeoJSON:                   ${geojsonBfsSet.size}`);

  if (bfsWithTooFew.length > 0) {
    console.log('\n  BFS mit zu wenigen Inseraten (1-2):');
    for (const [bfs, d] of bfsWithTooFew) {
      console.log(`    BFS ${bfs.padStart(4)} (${d.name}): ${d.count} Inserate`);
    }
  }

  // 8. Top-20 BFS nach Inserate-Anzahl
  console.log('\n--- Top-20 BFS nach Inserate-Anzahl ---');
  const topBfs = [...bfsByInserate.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 20);
  for (const [bfs, d] of topBfs) {
    const geoName = geojsonBfsNames.get(bfs) ?? '(nicht in GeoJSON)';
    console.log(`  BFS ${bfs.padStart(4)} ${geoName.padEnd(25)} ${d.count} Inserate`);
  }
}

main().catch(err => {
  console.error('Fehler:', err);
  process.exit(1);
});
