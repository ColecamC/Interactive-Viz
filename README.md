# Interactive-Viz

California **August Complex Fire (2020)** interactive map: MODIS MAIAC aerosol optical depth, FIRMS fire detections, and settlement dots with satellite context.

## Run locally

```bash
python3 serve.py
```

Open the URL it prints (e.g. `http://127.0.0.1:<port>/`). Use **http**, not `file://`, so external tiles and scripts load correctly.

## GitHub Pages

This repo includes [`.github/workflows/pages.yml`](.github/workflows/pages.yml), which publishes the **entire site root** (static files only) to GitHub Pages.

1. In the repo on GitHub: **Settings → Pages → Build and deployment**, set **Source** to **GitHub Actions** (not “Deploy from a branch”).
2. Push to **`main`** (or **`master`**); the workflow runs and deploys.
3. After the first successful run, the site is at:

   **`https://<your-username>.github.io/<repo-name>/`**

Examples (replace with your org/user and repo name):

- Main viz: `https://<user>.github.io/<repo>/`
- Burn-scar page (`new_page/`): `https://<user>.github.io/<repo>/new_page/`
- Checkpoint write-up: `https://<user>.github.io/<repo>/checkpoint.html`

Paths are relative, so everything works under the `/repo-name/` prefix. A [`.nojekyll`](.nojekyll) file is present so GitHub does not run Jekyll on the tree.

## Pages

| URL / file | What it is |
|------------|------------|
| `/` → `index.html` | Main map + timeline, smoke opacity, city clicks |
| `/new_page/` | Alternate burn-scar comparison UI (`new_page/index.html`) |
| `checkpoint.html` | Short project write-up with expandable figures in `imgs/` |

## Stack

Static **HTML**, **D3**, **SVG**. Aerosol overlay is fetched from **NASA GIBS** WMS (`MODIS_Combined_MAIAC_L2G_AerosolOpticalDepth`). Other data lives under `data/` (GeoJSON, CSV, settlements JSON).

Optional: `scripts/download_gibs_maiac_aod_ca.py` can bulk-download the same GIBS layer into `data/gibs_aerosol_tiles_august_complex/` (not required for the live app).
