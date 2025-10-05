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
    "host": "localhost",
    "port": 5432,
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
RADIUS = 500000


# ------------- UTILS ----------------
def clean_str(value):
    if value is None:
        return None
    return str(value).encode("utf-8", errors="replace").decode("utf-8", errors="replace")

#-------------- CONECT TO DB ------------
def get_conn():
    """Conexión robusta a PostgreSQL, forzando codificación UTF-8"""
    import psycopg2
    import urllib.parse

    dbname = DB_CONFIG["dbname"]
    user = urllib.parse.quote(DB_CONFIG["user"])
    password = urllib.parse.quote(DB_CONFIG["password"])
    host = DB_CONFIG["host"]
    port = DB_CONFIG["port"]

    dsn = f"dbname={dbname} user={user} password={password} host={host} port={port} options='-c client_encoding=UTF8'"

    return psycopg2.connect(dsn.encode("utf-8", errors="replace").decode("utf-8", errors="replace"))



# ---------------- SATELLITE NRT (TEMPO + TROPOMI) ----------------

def download_file(url, out_path):
    import requests, os
    if os.path.exists(out_path):
        return out_path
    print(f"⬇Downloading {url} ...")
    r = requests.get(url, stream=True)
    r.raise_for_status()
    with open(out_path, "wb") as f:
        for chunk in r.iter_content(chunk_size=8192):
            f.write(chunk)
    return out_path

def insert_measurements(rows):
    """Inserta filas satelitales como measurements."""
    if not rows:
        print("No hay filas satelitales para insertar en measurements")
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
            print("  Error insertando sat measurement:", e)

    conn.commit()
    cur.close()
    conn.close()
    print(f"Insertadas {inserted} mediciones satelitales en measurements")


def guess_pollutant_var(ds):
    """
    Intenta adivinar el nombre de la variable de NO₂ en el NetCDF.
    """
    candidates = [
        "nitrogendioxide_tropospheric_column",
        "nitrogendioxide_total_column",
        "nitrogendioxide_slant_column",
        "nitrogendioxide_column_number_density",
        "NO2_column_number_density"
    ]
    for var in candidates:
        if var in ds.variables:
            return var
    return None

import gdown
from datetime import datetime

# Procesadores
def process_tropomi_l2(file_path: str, qa_threshold: float = 0.75,
                       lat_bounds=None, lon_bounds=None) -> list:
    import xarray as xr
    import pandas as pd
    import numpy as np
    from datetime import datetime, timezone

    try:
        ds = xr.open_dataset(file_path, group="PRODUCT")

        dt_str = ds.attrs.get("time_coverage_start")
        now = datetime.fromisoformat(dt_str.replace("Z", "+00:00")) if dt_str else datetime.now(timezone.utc)

        lat = ds["latitude"].values.flatten()
        lon = ds["longitude"].values.flatten()
        qa = ds["qa_value"].values.flatten()

        # detectar variable de gas automáticamente
        gas_var = None
        for var in ds.variables:
            if any(key in var.lower() for key in ["nitrogen", "carbon", "sulfur", "methane", "ozone", "formaldehyde"]):
                gas_var = var
                break

        if not gas_var:
            print(f"⚠ No se encontró variable de gas en {file_path}")
            return []

        gas = ds[gas_var].values.flatten()

        df = pd.DataFrame({
            "latitude": lat,
            "longitude": lon,
            "value": gas,
            "qa_value": qa,
            "parameter": gas_var
        })

        df = df[df["qa_value"] >= qa_threshold]

        # bounding box opcional
        if lat_bounds and lon_bounds:
            df = df[
                (df["latitude"] >= lat_bounds[0]) & (df["latitude"] <= lat_bounds[1]) &
                (df["longitude"] >= lon_bounds[0]) & (df["longitude"] <= lon_bounds[1])
            ]
        df["datetime"] = np.datetime64(now)
        df["station_id"] = "TROPOMI"

        records = df.to_dict(orient="records")
        return records

    except Exception as e:
        print(f"⚠ Error procesando TROPOMI L2: {e}")
        return []

def process_tempo(file_path: str, lat_bounds=None, lon_bounds=None) -> list:
    """
    Procesa TEMPO L3 y devuelve registros listos para measurements.
    """
    import xarray as xr
    import pandas as pd
    import numpy as np
    from datetime import datetime, timezone

    try:
        # Abrir dataset (grupo geolocation si existe)
        try:
            ds = xr.open_dataset(file_path, group="geolocation")
        except Exception:
            ds = xr.open_dataset(file_path)

        # Tiempo base
        dt_str = ds.attrs.get("time_coverage_start")
        now = datetime.fromisoformat(dt_str.replace("Z", "+00:00")) if dt_str else datetime.now(timezone.utc)

        # Variables lat/lon
        lat, lon = None, None
        for v in ds.variables:
            if "lat" in v.lower() and lat is None:
                lat = ds[v].values.flatten()
            if "lon" in v.lower() and lon is None:
                lon = ds[v].values.flatten()

        if lat is None or lon is None:
            print("⚠ TEMPO sin lat/lon válidos")
            return []

        # Variable principal (NO₂ o nubes)
        data = None
        param = "cloud_fraction"
        for var in ds.variables:
            if "no2" in var.lower() and "column" in var.lower():
                data = ds[var].values.flatten()
                param = "NO2"
                break
        if data is None:
            for var in ds.variables:
                if "cloud" in var.lower() and "fraction" in var.lower():
                    data = ds[var].values.flatten()
                    param = "cloud_fraction"
                    break
        if data is None:
            data = np.zeros_like(lat)
            param = "unknown"

        # Crear dataframe
        df = pd.DataFrame({
            "latitude": lat,
            "longitude": lon,
            "value": data
        })

        # Filtrar por coordenadas si aplica
        if lat_bounds and lon_bounds:
            df = df[
                (df["latitude"] >= lat_bounds[0]) & (df["latitude"] <= lat_bounds[1]) &
                (df["longitude"] >= lon_bounds[0]) & (df["longitude"] <= lon_bounds[1])
            ]

        # Crear registros finales
        records = []
        for _, row in df.iterrows():
            records.append({
                "station_id": "TEMPO",
                "parameter": param,
                "value": float(row["value"]) if pd.notnull(row["value"]) else 0.0,
                "datetime": now.isoformat(),
                "latitude": float(row["latitude"]),
                "longitude": float(row["longitude"])
            })

        return records

    except Exception as e:
        print(f"Error procesando TEMPO: {e}")
        return []

import pandas as pd
import xarray as xr

def process_and_combine_satellite(files, processor, output_nc, lat_bounds=None, lon_bounds=None):
    """
    Descarga, procesa y combina múltiples archivos de un satélite.
    Genera un solo .nc con todos los datos y los inserta en la DB.
    """
    all_rows = []
    all_datasets = []

    for link, filename in files:
        try:
            local_file = download_from_link(link, filename)
            if not local_file:
                continue

            print(f"Procesando {filename} ...")
            rows = processor(local_file, lat_bounds=lat_bounds, lon_bounds=lon_bounds)

            if not rows:
                print(f"{filename} no generó datos válidos.")
                continue

            df = pd.DataFrame(rows)
            ds = xr.Dataset.from_dataframe(df)
            all_datasets.append(ds)
            all_rows.extend(rows)

            print(f"{len(rows)} registros procesados de {filename}")

        except Exception as e:
            print(f"Error procesando {filename}: {e}")

    # Guardar combinado en .nc
    if all_datasets:
        combined = xr.concat(all_datasets, dim="obs", join="outer")
        combined.to_netcdf(output_nc)
        print(f"Archivo combinado guardado: {output_nc} ({len(all_rows)} registros)")

    # Insertar en la base de datos
    if all_rows:
        insert_measurements(all_rows)
        print(f"{len(all_rows)} registros insertados en DB desde {output_nc}")
    else:
        print("No se insertaron registros en la DB")

    return all_rows

# Utilidad descarga
import gdown
import requests

def download_from_link(link: str, output: str):
    """
    Descarga un archivo desde un link de Google Drive o una URL directa.
    Detecta automáticamente si el link es compartido de Drive.
    """
    try:
        if "drive.google.com" in link:
            print(f"⬇ Descargando {output} desde Google Drive link...")
            gdown.download(link, output, quiet=False, fuzzy=True)
        else:
            print(f"⬇ Descargando {output} desde URL directa...")
            r = requests.get(link, stream=True)
            with open(output, "wb") as f:
                for chunk in r.iter_content(chunk_size=8192):
                    f.write(chunk)
        return output
    except Exception as e:
        print(f"Error descargando {output}: {e}")
        return None

def fetch_tempo_and_tropomi():
    """
    Descarga, procesa y combina archivos satelitales TROPOMI y TEMPO.
    Genera: tropomi_sample.nc y tempo_sample.nc
    """

    #Todos los datos de sentinel estarán subidos
    TROPOMI_FILES = [
        ("https://drive.google.com/file/d/1X9qnAukswiyO1N4al_MScs9XTpA1ygpc/view?usp=drive_link", "tropomi_no1.nc"),
        ("https://drive.google.com/file/d/1UuOBd2tjVg-mkSw9PZ_gpOkpXo9NP-qy/view?usp=drive_link", "tropomi_no2.nc"),
        ("https://drive.google.com/file/d/1aUtzKonTTIveZ54mLX875xaR-8j-OsTq/view?usp=drive_link", "tropomi_no3.nc"),
        ("https://drive.google.com/file/d/1WeTF_zpCaahDcwZ2w4uebiyJyvhclO70/view?usp=drive_link", "tropomi_no4.nc"),
        ("https://drive.google.com/file/d/1v1evXsrIlxJGngxnh-Ob2wFbni8fgRHV/view?usp=drive_link", "tropomi_no5.nc"),
        ("https://drive.google.com/file/d/1KzPOTz_JFjM9vFIkODyD8vpYkURPM10g/view?usp=drive_link", "tropomi_no6.nc"),
        ("https://drive.google.com/file/d/1nigOJaTkEeQDstPDMrsK9Z4MDIud-SAj/view?usp=drive_link", "tropomi_no7.nc"),
        ("https://drive.google.com/file/d/1VdXWr3OaT-Z_u3dRHGIGTK2dGGfkLUXm/view?usp=drive_link", "tropomi_no8.nc"),
    ]

    #Todos los datos de tempo estarán subidos
    TEMPO_FILES = [
        ("https://drive.google.com/file/d/1w4aufwFEnBxqZso4B7wtTivDG96Yqb7r/view?usp=sharing", "tempo_no1.nc"),
        ("https://drive.google.com/file/d/1w4aufwFEnBxqZso4B7wtTivDG96Yqb7r/view?usp=sharing", "tempo_no2.nc"),
        ("https://drive.google.com/file/d/1w4aufwFEnBxqZso4B7wtTivDG96Yqb7r/view?usp=sharing", "tempo_no3.nc"),
        ("https://drive.google.com/file/d/1w4aufwFEnBxqZso4B7wtTivDG96Yqb7r/view?usp=sharing", "tempo_no4.nc"),
    ]

    print("Iniciando descarga y procesamiento satelital...")

    # Bounding box Colombia
    lat_bounds = (4, 16)
    lon_bounds = (-80, -66)

    # Procesar cada satélite
    tropomi_rows = process_and_combine_satellite(
        TROPOMI_FILES, process_tropomi_l2, "tropomi_sample.nc",
        lat_bounds=lat_bounds, lon_bounds=lon_bounds
    )

    tempo_rows = process_and_combine_satellite(
        TEMPO_FILES, process_tempo, "tempo_sample.nc",
        lat_bounds=lat_bounds, lon_bounds=lon_bounds
    )

    total = len(tropomi_rows) + len(tempo_rows)
    print(f"Procesamiento completado: {total} registros totales insertados en DB")

def request_with_retries(url, params=None, headers=None, max_retries=3, backoff=1.5):
    headers = headers or {}
    for attempt in range(1, max_retries + 1):
        try:
            r = requests.get(url, params=params, headers=headers, timeout=20)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            print(f"  request error (attempt {attempt}) -> {e}")
            if attempt == max_retries:
                raise
            time.sleep(backoff * attempt)

import requests
import math

def fetch_stations_by_country(country="CO", max_pages=10, limit=100):
    """
    Trae todas las estaciones activas de OpenAQ para un país (por país, no ciudad).
    Hace paginación automática hasta traer todo.
    """
    all_stations = []
    page = 1
    base_url = "https://api.openaq.org/v3/locations"

    while page <= max_pages:
        try:
            url = f"{base_url}?country={country}&limit={limit}&page={page}"
            r = requests.get(url, timeout=15)
            r.raise_for_status()
            data = r.json()
            results = data.get("results", [])
            if not results:
                break
            all_stations.extend(results)
            print(f"  → página {page}, acumuladas {len(all_stations)} estaciones")
            page += 1
        except Exception as e:
            print(f"⚠ Error en la página {page}: {e}")
            break

    print(f"→ Encontradas {len(all_stations)} estaciones en {country}.")
    return all_stations


def filter_stations_by_coords(stations, lat_center=4.711, lon_center=-74.0721, radius_km=100):
    """
    Filtra estaciones dentro de un radio (en km) alrededor de coordenadas dadas.
    Usa distancia haversine aproximada.
    """
    R = 6371  # radio de la Tierra km
    def haversine(lat1, lon1, lat2, lon2):
        dlat = math.radians(lat2 - lat1)
        dlon = math.radians(lon2 - lon1)
        a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
        return 2 * R * math.asin(math.sqrt(a))

    filtered = []
    for s in stations:
        coords = s.get("coordinates", {})
        lat = coords.get("latitude")
        lon = coords.get("longitude")
        if lat is not None and lon is not None:
            dist = haversine(lat_center, lon_center, lat, lon)
            if dist <= radius_km:
                filtered.append(s)
    print(f"→ Filtradas {len(filtered)} estaciones dentro de {radius_km} km del punto ({lat_center}, {lon_center})")
    return filtered


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
            print("  Error insert station:", e)
    conn.commit()
    cur.close()
    conn.close()
    print(f"  → Guardadas {inserted} estaciones en DB (ON CONFLICT DO NOTHING).")

# INSERT STATION

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
        print(f"  Error insert station {loc_id}: {e}")
        conn.rollback()
    finally:
        cur.close()

# OpenAQ con resumen
def populate_openaq_historical(days=60):
    print(f"Iniciando ETL OpenAQ histórico (últimos {days} días)...")

    # Buscar estaciones por país (no por city)
    print("Buscando estaciones OpenAQ por country=CO ...")
    locs = fetch_stations_by_country(country="CO")
    print(f"→ Encontradas {len(locs)} estaciones en Colombia.")

    # Filtrar solo las activas en los últimos N días
    locs = filter_active_locations(locs, days=days)
    print(f"→ Filtradas {len(locs)} estaciones activas (últimos {days} días).")

    # Si quieres restringir a una zona (por ejemplo Bogotá y alrededores)
    if locs:
        locs = filter_stations_by_coords(
            locs,
            lat_center=4.711,    # Bogotá
            lon_center=-74.0721,
            radius_km=100        # cambia este valor si quieres ampliar el rango
        )

    if not locs:
        print("No se encontraron estaciones OpenAQ activas o cercanas. Revisa parámetros.")
        return

    # Guardar en la base de datos
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
    print(f"Bajando measurements desde {df} hasta {dt} ...")

    total = 0
    with_data = 0
    empty = 0

    print(f"OpenAQ: total records inserted = {total}")
    print(f"Resumen estaciones → con datos: {with_data}, sin datos: {empty}")


# ------------- OPENWEATHER helpers -------------
def fetch_openweather_current():
    params = {"lat": LAT, "lon": LON, "appid": OPENWEATHER_KEY, "units": "metric"}
    data = request_with_retries(OPENWEATHER_CURRENT, params=params)
    if "main" not in data:
        print("OpenWeather current unexpected:", data)
        return
    ts = datetime.fromtimestamp(data["dt"], tz=timezone.utc)
    insert_weather_safe(ts, data["main"].get("temp"), data["main"].get("humidity"),
                        data.get("wind", {}).get("speed"), data.get("wind", {}).get("deg", 0),
                        data["main"].get("pressure"), "OpenWeather")
    print("OpenWeather current saved:", ts)


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
        print("  Error insert weather:", e)
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
            print("  sat insert error:", e)
    conn.commit()
    cur.close()
    conn.close()
    print(f"Satellite inserted {inserted} rows from {csv_path}")

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
        print("Estación OpenWeather_air creada/verificada en DB")
    except Exception as e:
        print("Error creando estación OpenWeather_air:", e)
        conn.rollback()
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    print("Iniciando ETL OpenAQ + Weather + Satellite (local CSV + NRT) ...")

    ensure_openweather_station()

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