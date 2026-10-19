# Worldwide timezone area data

The State / area step combines the original IANA reference locations, the existing
GeoNames common-city options restored from the onboarding repository, and first-level
administrative divisions from GeoNames. Countries with no administrative divisions
retain their existing location choices. Countries sharing one clock rule still have
separate state/province/governorate/city buttons. The existing curated US state list
and border-clock choices are preserved.

Bundled source snapshot: 2026-10-19. Runtime requests to GeoNames are not required.
The generated data contains 3,805 administrative areas across 226 country/territory
codes, plus 350 IANA timezone identifiers. The picker keeps its existing country
coverage; country codes outside that existing catalog are not introduced implicitly.

Sources (GeoNames, CC BY 4.0):

- https://download.geonames.org/export/dump/admin1CodesASCII.txt
- https://download.geonames.org/export/dump/cities500.zip
- https://download.geonames.org/export/dump/readme.txt
- https://creativecommons.org/licenses/by/4.0/

Area names come from the English administrative-division names. Their timezone
choices come from the populated-place records for that country and admin code.
If a subdivision has no matching populated place, the user is offered that country's
observed timezone choices rather than being assigned a guessed zone. The timezone
step always requires explicit confirmation. Source geography may lag local changes.
The browser's Intl implementation handles UTC offsets and daylight-saving rules.

To rebuild, download the two dump files to a directory, then run:

```sh
python scripts/generate-timezone-areas.py /path/to/downloads
```

Copy the resulting assets to the onboarding questionnaire directory as well.
Keep the existing common-city snapshot in timezone-picker.js; see COMMON-AREAS.md.

SHA-256 of this source snapshot:

- admin1CodesASCII.txt: b577baa3476bbe94f0454545e517e1835401d79c5b1105c8e02cf1d4a505e8ec
- cities500.zip: 3f0949d068003cbb7e614275c5a28107a8f4c6b766f704b2bd317004d4cd0527
