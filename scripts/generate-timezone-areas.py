#!/usr/bin/env python3
"""Build bundled first-level geographic areas from the GeoNames CC BY 4.0 dumps.
Usage: python scripts/generate-timezone-areas.py /path/to/geonames-downloads
Required: admin1CodesASCII.txt and cities500.zip. See docs/timezone-area-data.md.
"""
import collections
import hashlib
import json
from pathlib import Path
import sys
import zipfile

source = Path(sys.argv[1])
observed = collections.defaultdict(set)
country_zones = collections.defaultdict(set)
with zipfile.ZipFile(source / 'cities500.zip') as archive:
    for line in archive.read('cities500.txt').decode('utf-8').splitlines():
        row = line.split('\t')
        country, admin, timezone = row[8], row[10], row[17]
        if timezone:
            observed[country + '.' + admin].add(timezone)
            country_zones[country].add(timezone)
regions = []
for line in (source / 'admin1CodesASCII.txt').read_text().splitlines():
    code, name, _ascii, _geoname = line.split('\t')
    country = code.split('.')[0]
    if country == 'US':
        continue  # Retain the existing curated 50 states + DC and border-clock rules.
    zones = observed[code]
    inferred = not bool(zones)
    # If no populated place identifies a timezone, offer the country's choices.
    # Never silently guess one timezone for a multi-zone country.
    if not zones:
        zones = country_zones[country]
    if zones:
        regions.append([code, name, sorted(zones), inferred])
regions.sort(key=lambda r: r[0])
zone_ids = sorted({zone for _, _, zones, _ in regions for zone in zones})
zone_index = {zone: index for index, zone in enumerate(zone_ids)}
output = [
    '/* Generated from GeoNames admin1CodesASCII.txt and cities500.zip, 2026-10-19.',
    ' * Source: https://download.geonames.org/export/dump/',
    ' * CC BY 4.0: https://creativecommons.org/licenses/by/4.0/',
    ' * Derived names/timezone mappings; see docs/timezone-area-data.md. */',
    'window.SteadyHandsTimezoneAreas = {',
    '  version: "2026-10-19",',
    '  zones: ' + json.dumps(zone_ids, ensure_ascii=False, separators=(',', ':')) + ',',
    '  regions: [',
]
for code, name, zones, inferred in regions:
    output.append('    ' + json.dumps([code, name, [zone_index[z] for z in zones], inferred], ensure_ascii=False, separators=(',', ':')) + ',')
output += ['  ]', '};', '']
path = Path(__file__).resolve().parent.parent / 'actions/timezone-areas.js'
path.write_text('\n'.join(output))
print(f'{len(regions)} areas in {len(set(r[0].split(".")[0] for r in regions))} country/territory codes; {len(zone_ids)} timezone IDs; {path.stat().st_size} bytes')
for name in ['admin1CodesASCII.txt', 'cities500.zip']:
    print(name, hashlib.sha256((source / name).read_bytes()).hexdigest())
