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

CITY = "Bogota"   # usa sin tilde para OpenAQ
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


def insert_satellite_rows(rows):
    conn = get_conn()
    cur = conn.cursor()
    try:
        psycopg2.extras.execute_batch(cur, """
            INSERT INTO satellite_observations
            (datetime_utc, lat, lon, product, pollutant, value, unit, raw_path)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT DO NOTHING
        """, rows)
        conn.commit()
        print(f"✅ Inserted {len(rows)} satellite rows")
    except Exception as e:
        print("❌ DB insert error:", e)
        conn.rollback()
    finally:
        cur.close()
        conn.close()


def process_netcdf_to_rows(path, product_name, pollutant_var, lat_bounds=None, lon_bounds=None, limit=10):
    ds = xr.open_dataset(path)
    rows = []

    if pollutant_var not in ds.variables:
        print(f"⚠ {pollutant_var} not found in {path}")
        return rows

    data = ds[pollutant_var].values.flatten()
    lats = ds['latitude'].values.flatten() if 'latitude' in ds else np.zeros_like(data)
    lons = ds['longitude'].values.flatten() if 'longitude' in ds else np.zeros_like(data)
    time_var = ds['time'].values[0] if 'time' in ds else np.datetime64(datetime.utcnow())

    count = 0
    for lat, lon, val in zip(lats, lons, data):
        if np.isnan(val):
            continue
        if lat_bounds and not (lat_bounds[0] <= lat <= lat_bounds[1]):
            continue
        if lon_bounds and not (lon_bounds[0] <= lon <= lon_bounds[1]):
            continue
        rows.append((
            pd.to_datetime(str(time_var)),
            float(lat), float(lon),
            product_name,
            pollutant_var,
            float(val),
            "mol/m2",
            path
        ))
        count += 1
        if count >= limit:
            break
    return rows


import os
import gdown

def fetch_tempo_and_tropomi():
    """
    Descarga los archivos TEMPO y TROPOMI desde Google Drive
    y los procesa con las funciones existentes del ETL.
    """

    # IDs de tus archivos en Google Drive (cambia por los tuyos reales)
    TEMPO_ID = "1rAR9MURN6eBG64sFbKvS8plC5yBB_rjo"   # <- pega aquí el ID real de TEMPO.nc
    TROPOMI_ID = "1ovmXJ01FCreF06z8qMyECoXDhuMyOS2A" # <- pega aquí el ID real de TROPOMI.nc

    # Nombres locales
    TEMPO_FILE = "tempo_sample.nc"
    TROPOMI_FILE = "tropomi_sample.nc"

    try:
        # Descargar TEMPO si no existe localmente
        if not os.path.exists(TEMPO_FILE):
            print("⬇ Descargando TEMPO desde Google Drive...")
            gdown.download(f"https://drive.google.com/uc?id={TEMPO_ID}", TEMPO_FILE, quiet=False)

        tempo_rows = process_netcdf_to_rows(
            TEMPO_FILE,
            "TEMPO",
            "nitrogendioxide_tropospheric_column"
        )
        insert_satellite_rows(tempo_rows)
        print("✅ TEMPO procesado con éxito.")
    except Exception as e:
        print("⚠ TEMPO failed:", e)

    try:
        # Descargar TROPOMI si no existe localmente
        if not os.path.exists(TROPOMI_FILE):
            print("⬇ Descargando TROPOMI desde Google Drive...")
            gdown.download(f"https://drive.google.com/uc?id={TROPOMI_ID}", TROPOMI_FILE, quiet=False)

        trop_rows = process_netcdf_to_rows(
            TROPOMI_FILE,
            "TROPOMI",
            "nitrogendioxide_tropospheric_column",
            lat_bounds=(4.0, 6.0),
            lon_bounds=(-75.0, -73.0)
        )
        insert_satellite_rows(trop_rows)
        print("✅ TROPOMI procesado con éxito.")
    except Exception as e:
        print("⚠ TROPOMI failed:", e)



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


def fetch_locations_by_city(city=CITY, country=COUNTRY, limit=100, max_pages=5):
    """Intenta listar locations por city/country. Devuelve lista de locations (dicts)."""
    print(f"🔎 Buscando estaciones por city={city}, country={country} ...")
    results = []
    page = 1
    headers = {"x-api-key": OPENAQ_KEY} if OPENAQ_KEY else {}
    while page <= max_pages:
        params = {"city": city, "country": country, "limit": limit, "page": page}
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


# =================================
# FETCH measurements tolerante a 404
# =================================
def fetch_measurements_for_location(location_id, date_from, date_to, limit=100):
    """Descarga measurements para una estación, ignora si no hay datos (404)."""
    headers = {"x-api-key": OPENAQ_KEY} if OPENAQ_KEY else {}
    page = 1
    total = 0
    while True:
        params = {
            "location_id": location_id,
            "limit": limit,
            "page": page,
            "date_from": date_from,
            "date_to": date_to,
            "sort": "asc"
        }
        try:
            data = request_with_retries(OPENAQ_MEASUREMENTS, params=params, headers=headers)
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 404:
                print(f"  ⚠ No hay datos para location_id={location_id} → saltando.")
                return 0
            else:
                raise
        results = data.get("results", [])
        if not results:
            break
        for r in results:
            timestamp = r.get("date", {}).get("utc")
            param = r.get("parameter")
            value = r.get("value")
            unit = r.get("unit")
            station = r.get("location")
            insert_measurement_safe(station, timestamp, param, value, unit, "OpenAQ")
            total += 1
        page += 1
        time.sleep(1.5)
    return total

def insert_measurement_safe(station_openaq, timestamp, param, value, unit, source):
    try:
        conn = get_conn()
        cur = conn.cursor()

        # Buscar id interno en tabla stations por nombre
        cur.execute("SELECT id FROM stations WHERE nombre = %s", (station_openaq,))
        row = cur.fetchone()
        if not row:
            print(f"⚠ station {station_openaq} no encontrada en DB → skip")
            return
        station_id = row[0]

        col_map = {
            "pm25": "pm25",
            "pm10": "pm10",
            "co": "co2",
            "o3": "o3",
            "no2": "no2",
            "so2": "so2"
        }
        col = col_map.get(param)
        if not col:
            print(f"⚠ param {param} no mapeado → skip")
            return

        cur.execute("""
            INSERT INTO measurements (station_id, datetime_utc, parameter, value, unit, provider)
            VALUES (%s,%s,%s,%s,%s,%s)
            ON CONFLICT (station_id, datetime_utc, parameter) DO NOTHING
        """, (station_id, timestamp, param, value, unit, source))

        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"❌ Error insert measurement: {e}")


# ================================
# MAIN OpenAQ con resumen debug
# ================================
def populate_openaq_historical(days=60):
    print(f"📌 Iniciando ETL OpenAQ histórico (últimos {days} días)...")
    locs = fetch_locations_by_city()
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

    for loc in locs:
        lid = loc.get("id") or loc.get("locationId")
        if not lid:
            continue
        try:
            count = fetch_measurements_for_location(lid, df, dt)
            if count > 0:
                print(f"  📥 location {lid} → {count} registros")
                with_data += 1
            else:
                empty += 1
            total += count
        except Exception as e:
            print(f"  ❌ Error fetch measurements for {lid}: {e}")

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


def fetch_openweather_air():
    params = {"lat": LAT, "lon": LON, "appid": OPENWEATHER_KEY}
    data = request_with_retries(OPENWEATHER_AIR, params=params)
    # data structure: list of {'main':..., 'components': {...}, 'dt': ...}
    for item in data.get("list", []):
        ts = datetime.fromtimestamp(item.get("dt"), tz=timezone.utc)
        components = item.get("components", {})
        # insert into measurements as e.g. co, no2, o3 (note: adapt to your schema)
        insert_measurement_safe("OpenWeather_air", ts, "co", components.get("co"), "µg/m3", "OpenWeather")
        insert_measurement_safe("OpenWeather_air", ts, "no2", components.get("no2"), "µg/m3", "OpenWeather")
    print("✅ OpenWeather air_pollution saved.")


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
            SELECT
                g.datetime_utc,
                s.lat,
                s.lon,
                g_pm25.value AS pm25,
                g_no2.value  AS no2,
                g_o3.value   AS o3,
                w.temp,
                w.wind_speed,
                '{}'::jsonb
            FROM measurements g
            JOIN stations s ON g.station_id = s.id

            -- PM2.5
            LEFT JOIN measurements g_pm25
              ON g_pm25.station_id = g.station_id
             AND g_pm25.datetime_utc = g.datetime_utc
             AND g_pm25.parameter = 'pm25'

            -- NO2
            LEFT JOIN measurements g_no2
              ON g_no2.station_id = g.station_id
             AND g_no2.datetime_utc = g.datetime_utc
             AND g_no2.parameter = 'no2'

            -- O3
            LEFT JOIN measurements g_o3
              ON g_o3.station_id = g.station_id
             AND g_o3.datetime_utc = g.datetime_utc
             AND g_o3.parameter = 'o3'

            -- Weather
            LEFT JOIN weather_observations w
              ON w.lat = s.lat
             AND w.lon = s.lon
             AND w.datetime_utc = g.datetime_utc

            ON CONFLICT (datetime_utc, lat, lon) DO UPDATE
            SET pm25 = EXCLUDED.pm25,
                no2 = EXCLUDED.no2,
                o3 = EXCLUDED.o3,
                temp = EXCLUDED.temp,
                wind_speed = EXCLUDED.wind_speed,
                other_features = EXCLUDED.other_features;
        """)
        conn.commit()
        print("✅ model_features actualizado")
    except Exception as e:
        print("❌ Error build_model_features:", e)
        conn.rollback()
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
        fetch_openweather_air()
    except Exception as e:
        print("⚠ OpenWeather falló:", e)

    # 3) Satélite CSV local (si lo tienes)
    try:
        insert_tropomi_from_csv("tropomi_sample.csv")
    except Exception as e:
        print("⚠ TROPOMI CSV no cargado:", e)

    # 4) Satélite NRT real (TEMPO + TROPOMI)
    fetch_tempo_and_tropomi()

    # 5) Features
    build_model_features()

    print("✅ ETL finalizado.")
