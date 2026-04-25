# Legal Stays Dataset

This project keeps Taiwan legal accommodation data as a generated dataset under
`data/legal_stays/`. The source is the Tourism Administration legal stay data
from Taiwan Stay / data.gov.tw dataset 7780.

## Source Files

Raw files are stored in:

```text
data/raw/hotel-json/
```

The main source file is:

```text
data/raw/hotel-json/HotelList.json
```

Regenerate the usable dataset after replacing the raw file:

```powershell
python scripts/prepare_legal_stays_dataset.py
```

## Generated Outputs

The script writes:

```text
data/legal_stays/legal_stays.json
data/legal_stays/legal_stays.geojson
```

`legal_stays.json` is the full normalized dataset for API search, risk scoring,
and legal accommodation matching. `legal_stays.geojson` is a map-friendly
FeatureCollection for marker rendering or map layers.

## Backend API

The backend serves the generated data through:

```text
GET /api/legal-stays
GET /api/legal-stays/geojson
```

Supported query parameters:

```text
q
city
town
class
service_status
limit
offset
```

By default, `service_status=1` returns currently operating records. Use
`service_status=0` to include all service statuses.

## Database Note

The current SQLite database is scoped to auth and favorites only:

```text
data/exhibeat_auth.db
```

Legal accommodation data is intentionally kept as a generated static dataset for
now because the official source updates daily and the dataset is small enough to
load and filter in memory. If matching, audit history, user reports, or platform
listing snapshots become persistent product features, add dedicated tables rather
than mixing this data into the auth database.
