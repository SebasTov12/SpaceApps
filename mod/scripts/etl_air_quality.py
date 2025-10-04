# etl_full_openaq.py
import requests
import psycopg2
import time
import math
import pandas as pd
from datetime import datetime, timedelta, timezone
import xarray as xr
import numpy as np
import pandas as pd
import psycopg2.extras

# ============== CONFIG ==============
DB_CONFIG = {
    "dbname": "air_quality_db",
    "user": "airbyter",
    "password": "AirBytes2025",
    "host": "192.168.2.8",
    "port": 5432
}

OPENAQ_KEY = "523eb1251f97abc8f75087ea19ba06a04b2e6c04f4d128ef68862bf3a5b93a92"
OPENAQ_LOCATIONS = "https://api.openaq.org/v3/locations"
OPENAQ_MEASUREMENTS = "https://api.openaq.org/v3/measurements"

OPENWEATHER_KEY = "851fc0b7aecc41c3eed4ceb24d129f82"
OPENWEATHER_CURRENT = "https://api.openweathermap.org/data/2.5/weather"
OPENWEATHER_AIR = "http://api.openweathermap.org/data/2.5/air_pollution"

COUNTRY = "CO"
LAT = 4.7110
LON = -74.0721
RADIUS = 50000   # metros (50km)
# ====================================


# ------------- UTILS ----------------
def clean_str(value):
    if value is None:
        return None
    return str(value).encode("utf-8", errors="replace").decode("utf-8", errors="replace")

#-------------- CONECT TO DB ------------
def get_conn():
    return psycopg2.connect(**DB_CONFIG)


# ---------------- SATELLITE NRT (TEMPO + TROPOMI) ----------------

def download_file(url, out_path):
    import requests, os
    if os.path.exists(out_path):
        return out_path
    print(f"⬇️ Downloading {url} ...")
    r = requests.get(url, stream=True)
    r.raise_for_status()
    with open(out_path, "wb") as f:
        for chunk in r.iter_content(chunk_size=8192):
            f.write(chunk)
    return out_path

def insert_measurements(rows):
    """Inserta filas satelitales como measurements."""
    if not rows:
        print("⚠ No hay filas satelitales para insertar en measurements")
        return

    conn = get_conn()
    cur = conn.cursor()
    inserted = 0
    for r in rows:
        try:
            # asegurar estación dummy (TROPOMI/TEMPO)
            cur.execute("""
                INSERT INTO stations (nombre, lat, lon, tipo, fuente)
                VALUES (%s,%s,%s,%s,%s)
                ON CONFLICT (nombre) DO NOTHING
            """, (r["station_id"], r["latitude"], r["longitude"], "satellite", "NASA/ESA"))

            cur.execute("""
                INSERT INTO measurements (station_id, datetime_utc, parameter, value, unit, provider)
                SELECT s.id, %s, %s, %s, %s, %s
                FROM stations s WHERE s.nombre = %s
                ON CONFLICT (station_id, datetime_utc, parameter) DO NOTHING
            """, (
                r["datetime"], r["parameter"], r["value"], "mol/m2", "Satellite",
                r["station_id"]
            ))
            inserted += 1
        except Exception as e:
            print("  ❌ Error insertando sat measurement:", e)

    conn.commit()
    cur.close()
    conn.close()
    print(f"✅ Insertadas {inserted} mediciones satelitales en measurements")


def guess_pollutant_var(ds):
    """
    Intenta adivinar el nombre de la variable de NO₂ en el NetCDF.
    """
    candidates = [
        "nitrogendioxide_tropospheric_column",
        "nitrogendioxide_total_column",
        "nitrogendioxide_slant_column",
        "nitrogendioxide_column_number_density",  # otro nombre común
        "NO2_column_number_density"              # a veces así
    ]
    for var in candidates:
        if var in ds.variables:
            return var
    return None

import gdown
from datetime import datetime

# ==========================
# Procesadores
# ==========================
def process_tropomi_l2(file_path: str, qa_threshold: float = 0.75,
                       lat_bounds=None, lon_bounds=None) -> list:
    """
    Procesa Sentinel-5P TROPOMI L2 NO₂ troposférico y devuelve registros listos para measurements.
    DEMO: siempre limita a 50 filas para no sobrecargar la DB.
    """
    import xarray as xr
    import pandas as pd
    from datetime import datetime, timezone

    try:
        ds = xr.open_dataset(file_path, group="PRODUCT")

        dt_str = ds.attrs.get("time_coverage_start")
        now = datetime.fromisoformat(dt_str.replace("Z", "+00:00")) if dt_str else datetime.now(timezone.utc)

        lat = ds["latitude"].values.flatten()
        lon = ds["longitude"].values.flatten()
        no2 = ds["nitrogendioxide_tropospheric_column"].values.flatten()
        qa = ds["qa_value"].values.flatten()

        df = pd.DataFrame({
            "latitude": lat,
            "longitude": lon,
            "value": no2,
            "qa_value": qa
        })

        df = df[df["qa_value"] >= qa_threshold]

        # bounding box opcional
        if lat_bounds and lon_bounds:
            filtered = df[
                (df["latitude"] >= lat_bounds[0]) & (df["latitude"] <= lat_bounds[1]) &
                (df["longitude"] >= lon_bounds[0]) & (df["longitude"] <= lon_bounds[1])
            ]
            if not filtered.empty:
                df = filtered

        # ⚡ DEMO: limitar a 50 filas
        df = df.head(50)

        records = []
        for _, row in df.iterrows():
            records.append({
                "station_id": "TROPOMI",
                "parameter": "no2_tropospheric_column",
                "value": float(row["value"]),
                "datetime": now,
                "latitude": float(row["latitude"]),
                "longitude": float(row["longitude"])
            })

        return records

    except Exception as e:
        print(f"⚠ Error procesando TROPOMI L2: {e}")
        return []

def process_tempo(file_path: str,
                  lat_bounds=None, lon_bounds=None) -> list:
    """
    Procesa TEMPO L3 y devuelve registros listos para measurements.
    DEMO: siempre limita a 50 filas (dummy si no hay variables útiles).
    """
    import xarray as xr
    import pandas as pd
    from datetime import datetime, timezone

    try:
        try:
            ds = xr.open_dataset(file_path, group="geolocation")
        except Exception:
            ds = xr.open_dataset(file_path)

        dt_str = ds.attrs.get("time_coverage_start")
        now = datetime.fromisoformat(dt_str.replace("Z", "+00:00")) if dt_str else datetime.now(timezone.utc)

        lat, lon = None, None
        for v in ds.variables:
            if "lat" in v.lower() and lat is None:
                lat = ds[v].values.flatten()
            if "lon" in v.lower() and lon is None:
                lon = ds[v].values.flatten()

        if lat is None or lon is None:
            print("⚠ TEMPO sin lat/lon válidos")
            return []

        # Buscar variable
        data = None
        param = "cloud_fraction"
        for var in ds.variables:
            if "cloud" in var.lower() and "fraction" in var.lower():
                data = ds[var].values.flatten()
                break
        if data is None:
            for var in ds.variables:
                if "no2" in var.lower() and "column" in var.lower():
                    data = ds[var].values.flatten()
                    param = var
                    break
        if data is None:
            data = [0.0] * len(lat)
            param = "cloud_fraction_dummy"

        df = pd.DataFrame({
            "latitude": lat,
            "longitude": lon,
            "value": data
        })

        # bounding box opcional
        if lat_bounds and lon_bounds:
            filtered = df[
                (df["latitude"] >= lat_bounds[0]) & (df["latitude"] <= lat_bounds[1]) &
                (df["longitude"] >= lon_bounds[0]) & (df["longitude"] <= lon_bounds[1])
            ]
            if not filtered.empty:
                df = filtered

        # ⚡ DEMO: limitar a 50 filas
        df = df.head(50)

        records = []
        for _, row in df.iterrows():
            records.append({
                "station_id": "TEMPO",
                "parameter": param,
                "value": float(row["value"]) if row["value"] is not None else 0.0,
                "datetime": now,
                "latitude": float(row["latitude"]),
                "longitude": float(row["longitude"])
            })

        return records

    except Exception as e:
        print(f"⚠ Error procesando TEMPO: {e}")
        return []

# ==========================
# Utilidad descarga
# ==========================
def download_from_gdrive(file_id, output):
    url = f"https://drive.google.com/uc?id={file_id}"
    print(f"⬇ Descargando {output} desde Google Drive...")
    gdown.download(url, output, quiet=False, fuzzy=True)
    return output


# ==========================
# Fetch principal
# ==========================
def fetch_tempo_and_tropomi():
    """Descarga y procesa archivos de TROPOMI (Sentinel-5P) y TEMPO (NASA)"""
    rows_all = []

    try:
        # ==========================
        # 🛰️ TROPOMI (Sentinel-5P L2 NO2)
        # ==========================
        print("⬇ Descargando archivo TROPOMI desde Google Drive...")
        tropomi_file = download_from_gdrive(
            "1Leyz9VtQw_ezob6PzUYCobSOIDGsW9fx",  # ID de Drive
            "tropomi_sample.nc"
        )
        print(f"📌 Procesando {tropomi_file} como TROPOMI L2 NO₂...")
        tropomi_rows = process_tropomi_l2(
            tropomi_file,
            lat_bounds=(4, 6),   # ajusta para tu región
            lon_bounds=(-75, -73)
        )
        rows_all.extend(tropomi_rows)

    except Exception as e:
        print(f"⚠ Error procesando TROPOMI: {e}")

    try:
        # ==========================
        # 🛰️ TEMPO (NO2/Clouds)
        # ==========================
        print("⬇ Descargando archivo TEMPO desde Google Drive...")
        tempo_file = download_from_gdrive(
            "1w4aufwFEnBxqZso4B7wtTivDG96Yqb7r",  # ID de Drive
            "tempo_sample.nc"
        )
        print(f"📌 Procesando {tempo_file} como TEMPO...")
        tempo_rows = process_tempo(
            tempo_file,
            lat_bounds=(4, 6),   # ajusta para tu región
            lon_bounds=(-75, -73)
        )
        rows_all.extend(tempo_rows)

    except Exception as e:
        print(f"⚠ Error procesando TEMPO: {e}")

    # ==========================
    # Guardar en DB
    # ==========================
    if rows_all:
        insert_measurements(rows_all)  # usa tu función que mete a measurements
        print(f"✅ Insertadas {len(rows_all)} filas en measurements")
    else:
        print("⚠ No se insertaron filas de satélites (TROPOMI/TEMPO)")


def request_with_retries(url, params=None, headers=None, max_retries=3, backoff=1.5):
    headers = headers or {}
    for attempt in range(1, max_retries + 1):
        try:
            r = requests.get(url, params=params, headers=headers, timeout=20)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            print(f"  ⚠ request error (attempt {attempt}) -> {e}")
            if attempt == max_retries:
                raise
            time.sleep(backoff * attempt)

def fetch_locations_by_country(country=COUNTRY, limit=100, max_pages=5):
    """Intenta listar locations por city/country. Devuelve lista de locations (dicts)."""
    print(f"🔎 Buscando estaciones por country={country} ...")
    results = []
    page = 1
    headers = {"x-api-key": OPENAQ_KEY} if OPENAQ_KEY else {}
    while page <= max_pages:
        params = {"country": country, "limit": limit, "page": page}
        try:
            data = request_with_retries(OPENAQ_LOCATIONS, params=params, headers=headers)
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 429:
                print("⚠ Rate limit alcanzado, esperando 30s...")
                time.sleep(30)   # backoff
                continue
            else:
                raise
        page_results = data.get("results", [])
        if not page_results:
            break
        results.extend(page_results)
        print(f"  → página {page}, acumuladas {len(results)} estaciones")
        page += 1
        time.sleep(2)  # rate-limit friendly
    print(f"  → Encontradas {len(results)} estaciones por city.")
    return results

from datetime import datetime, timedelta, timezone

def filter_active_locations(locations, days=60):
    """Filtra estaciones con mediciones recientes en los últimos N días."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    active = []
    for loc in locations:
        last_updated = loc.get("lastUpdated")
        if last_updated:
            try:
                dt = datetime.fromisoformat(last_updated.replace("Z", "+00:00"))
                if dt > cutoff:
                    active.append(loc)
            except Exception:
                pass
    return active

def fetch_locations_by_coords(lat=LAT, lon=LON, radius=RADIUS, limit=100):
    print(f"🔎 Buscando estaciones por coords {lat},{lon} distance={radius}m ...")
    results = []
    page = 1
    headers = {"x-api-key": OPENAQ_KEY} if OPENAQ_KEY else {}
    while True:
        params = {"coordinates": f"{lat},{lon}", "distance": radius, "limit": limit, "page": page}
        try:
            data = request_with_retries(OPENAQ_LOCATIONS, params=params, headers=headers)
        except requests.exceptions.HTTPError as e:
            if e.response.status_code in (404, 500):
                print(f"⚠ No se pudieron obtener estaciones (status={e.response.status_code}) → abortando fallback coords.")
                break
            else:
                raise
        page_results = data.get("results", [])
        if not page_results:
            break
        results.extend(page_results)
        page += 1
    print(f"  → Encontradas {len(results)} estaciones por coords.")
    return results

def save_locations_to_db(locations):
    conn = get_conn()
    cur = conn.cursor()
    inserted = 0
    for loc in locations:
        try:
            loc_id = loc.get("id") or loc.get("locationId") or loc.get("name")
            name = loc.get("name") or loc.get("location") or loc.get("city") or str(loc_id)
            coords = loc.get("coordinates") or {}
            lat = coords.get("latitude")
            lon = coords.get("longitude")
            cur.execute("""
                INSERT INTO stations (nombre, lat, lon, tipo, fuente)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (nombre) DO NOTHING
            """, (clean_str(name), lat, lon, "station", "OpenAQ"))
            inserted += 1
        except Exception as e:
            print("  ❌ Error insert station:", e)
    conn.commit()
    cur.close()
    conn.close()
    print(f"  → Guardadas {inserted} estaciones en DB (ON CONFLICT DO NOTHING).")

# ======================
# INSERT STATION seguro
# ======================
def insert_station(conn, loc_id, name, city, country, lat, lon):
    """Inserta una estación en la DB, maneja rollback si hay error"""
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO stations (nombre, lat, lon, tipo, fuente)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (nombre) DO NOTHING
        """, (clean_str(name), lat, lon, "station", "OpenAQ"))
        conn.commit()
    except Exception as e:
        print(f"  ❌ Error insert station {loc_id}: {e}")
        conn.rollback()
    finally:
        cur.close()


# ================================
# MAIN OpenAQ con resumen debug
# ================================
def populate_openaq_historical(days=60):
    print(f"📌 Iniciando ETL OpenAQ histórico (últimos {days} días)...")
    locs = fetch_locations_by_country()
    print(f"→ Encontradas {len(locs)} estaciones por city.")

    # 🚀 Filtrar solo las vivas
    locs = filter_active_locations(locs, days=60)
    print(f"→ Filtradas {len(locs)} estaciones activas (últimos 60 días).")
    if not locs:
        locs = fetch_locations_by_coords()
    if not locs:
        print("❌ No se encontraron estaciones OpenAQ cerca. Revisa parámetros.")
        return

    conn = get_conn()
    for loc in locs:
        loc_id = loc.get("id") or loc.get("locationId") or loc.get("name")
        name = loc.get("name") or loc.get("location")
        city = loc.get("city")
        country = loc.get("country")
        coords = loc.get("coordinates", {})
        lat = coords.get("latitude")
        lon = coords.get("longitude")
        insert_station(conn, loc_id, name, city, country, lat, lon)
    conn.close()

    print(f"→ Guardadas {len(locs)} estaciones en DB (ON CONFLICT DO NOTHING).")

    # Fechas ISO
    date_to = datetime.now(timezone.utc)
    date_from = date_to - timedelta(days=days)
    df, dt = date_from.isoformat(), date_to.isoformat()
    print(f"📅 Bajando measurements desde {df} hasta {dt} ...")

    total = 0
    with_data = 0
    empty = 0

    print(f"✅ OpenAQ: total records inserted = {total}")
    print(f"📊 Resumen estaciones → con datos: {with_data}, sin datos: {empty}")

# ------------- OPENWEATHER helpers -------------
def fetch_openweather_current():
    params = {"lat": LAT, "lon": LON, "appid": OPENWEATHER_KEY, "units": "metric"}
    data = request_with_retries(OPENWEATHER_CURRENT, params=params)
    if "main" not in data:
        print("⚠ OpenWeather current unexpected:", data)
        return
    ts = datetime.fromtimestamp(data["dt"], tz=timezone.utc)
    insert_weather_safe(ts, data["main"].get("temp"), data["main"].get("humidity"),
                        data.get("wind", {}).get("speed"), data.get("wind", {}).get("deg", 0),
                        data["main"].get("pressure"), "OpenWeather")
    print("✅ OpenWeather current saved:", ts)


def insert_weather_safe(timestamp, temp, humidity, wind_speed, wind_dir, pressure, source="OpenWeather"):
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO weather_observations
            (datetime_utc, lat, lon, temp, humidity, wind_speed, wind_dir, pressure, source)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT DO NOTHING
        """, (timestamp, LAT, LON, temp, humidity, wind_speed, wind_dir, pressure, clean_str(source)))
        conn.commit()
    except Exception as e:
        print("  ❌ Error insert weather:", e)
    finally:
        if 'cur' in locals(): cur.close()
        if 'conn' in locals(): conn.close()

# ------------- SATELLITE helper (local NetCDF CSV) -------------
def insert_tropomi_from_csv(csv_path):
    """Inserta CSV con columnas datetime, lat, lon, pollutant, value, unit, product"""
    df = pd.read_csv(csv_path)
    conn = get_conn()
    cur = conn.cursor()
    inserted = 0
    for _, row in df.iterrows():
        try:
            cur.execute("""
                INSERT INTO satellite_observations
                (datetime_utc, lat, lon, product, pollutant, value, unit, raw_path)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT DO NOTHING
            """, (pd.to_datetime(row['datetime']).to_pydatetime(), float(row['lat']), float(row['lon']),
                  clean_str(row.get('product')), clean_str(row.get('pollutant')), float(row['value']), clean_str(row.get('unit')), csv_path))
            inserted += 1
        except Exception as e:
            print("  ❌ sat insert error:", e)
    conn.commit()
    cur.close()
    conn.close()
    print(f"✅ Satellite inserted {inserted} rows from {csv_path}")

# ------------- MODEL FEATURES builder (arreglado) -------------
def build_model_features():
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO model_features(datetime_utc, lat, lon, pm25, no2, o3, temp, wind_speed, other_features)
            SELECT DISTINCT ON (g.datetime_utc, s.lat, s.lon)
                g.datetime_utc, s.lat, s.lon,
                g_pm25.value AS pm25,
                g_no2.value AS no2,
                g_o3.value AS o3,
                w.temp,
                w.wind_speed,
                '{}'::jsonb
            FROM measurements g
            JOIN stations s ON g.station_id = s.id
            LEFT JOIN measurements g_pm25 ON g_pm25.station_id = s.id AND g_pm25.parameter = 'pm25' AND g_pm25.datetime_utc = g.datetime_utc
            LEFT JOIN measurements g_no2 ON g_no2.station_id = s.id AND g_no2.parameter = 'no2' AND g_no2.datetime_utc = g.datetime_utc
            LEFT JOIN measurements g_o3 ON g_o3.station_id = s.id AND g_o3.parameter = 'o3' AND g_o3.datetime_utc = g.datetime_utc
            LEFT JOIN weather_observations w ON w.datetime_utc = g.datetime_utc
            ON CONFLICT (datetime_utc, lat, lon) DO UPDATE
            SET pm25 = EXCLUDED.pm25,
                no2 = EXCLUDED.no2,
                o3 = EXCLUDED.o3,
                temp = EXCLUDED.temp,
                wind_speed = EXCLUDED.wind_speed;
        """)
        conn.commit()
        print("✅ Features construidas en model_features")
    except Exception as e:
        conn.rollback()
        print(f"❌ Error build_model_features: {e}")
    finally:
        cur.close()
        conn.close()

def ensure_openweather_station():
    """Crea una estación dummy para guardar mediciones de OpenWeather."""
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO stations (nombre, lat, lon, tipo, fuente)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (nombre) DO NOTHING
        """, ("OpenWeather_air", LAT, LON, "virtual", "OpenWeather"))
        conn.commit()
        print("✅ Estación OpenWeather_air creada/verificada en DB")
    except Exception as e:
        print("❌ Error creando estación OpenWeather_air:", e)
        conn.rollback()
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    print("📌 Iniciando ETL OpenAQ + Weather + Satellite (local CSV + NRT) ...")

    # 0) Asegurar estación OpenWeather dummy
    ensure_openweather_station()

    # 1) OpenAQ histórico (usar pocos días para demo)
    try:
        populate_openaq_historical(days=7)
    except Exception as e:
        print("⚠ OpenAQ falló:", e)

    # 2) OpenWeather
    try:
        fetch_openweather_current()
    except Exception as e:
        print("⚠ OpenWeather falló:", e)

    # 4) Satélite NRT real (TEMPO + TROPOMI)
    fetch_tempo_and_tropomi()

    # 5) Features
    build_model_features()

    print("✅ ETL finalizado.")