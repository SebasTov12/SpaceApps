import requests
import psycopg2
from datetime import datetime

# ===================== CONFIG =====================
DB_CONFIG = {
    "dbname": "air_quality_db",
    "user": "airbyter",
    "password": "AirBytes2025",
    "host": "192.168.2.8",
    "port": 5432
}

OPENAQ_URL = "https://api.openaq.org/v2/measurements"
OPENWEATHER_URL = "https://api.openweathermap.org/data/2.5/weather"
OPENWEATHER_KEY = "ab910a1b5dfba0f337567d29c64cb219"

# Ciudad/coords de ejemplo (Bogotá)
CITY = "Bogotá"
LAT = 4.7110
LON = -74.0721
# ==================================================


# ---------------- FUNCIONES DB ----------------
def get_conn():
    return psycopg2.connect(**DB_CONFIG)


def insert_measurement(station_id, timestamp, param, value, unit, source):
    """Inserta un registro de calidad del aire en la tabla measurements."""
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO measurements (station_id, timestamp, pm25, pm10, co2, o3, no2, so2, fuente)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            station_id,
            timestamp,
            value if param == "pm25" else None,
            value if param == "pm10" else None,
            value if param == "co2" else None,
            value if param == "o3" else None,
            value if param == "no2" else None,
            value if param == "so2" else None,
            source
        ))
        conn.commit()
    except Exception as e:
        print("❌ Error insertando en measurements:", e)
    finally:
        if cur: cur.close()
        if conn: conn.close()


def insert_weather(timestamp, temp, humidity, wind_speed, wind_dir, pressure, source="OpenWeather"):
    """Inserta un registro meteorológico en la tabla weather_observations."""
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO weather_observations 
            (datetime_utc, lat, lon, temp, humidity, wind_speed, wind_dir, pressure, source)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            timestamp, LAT, LON, temp, humidity, wind_speed, wind_dir, pressure, source
        ))
        conn.commit()
    except Exception as e:
        print("❌ Error insertando en weather_observations:", e)
    finally:
        if cur: cur.close()
        if conn: conn.close()


# ---------------- ETL ----------------
def fetch_openaq():
    """Extrae datos de OpenAQ y los guarda en la DB."""
    params = {
        "city": CITY,
        "limit": 50,
        "sort": "desc",
        "order_by": "datetime"
    }
    try:
        r = requests.get(OPENAQ_URL, params=params, timeout=15)
        data = r.json()
    except Exception as e:
        print("❌ Error en request OpenAQ:", e)
        return

    for result in data.get("results", []):
        timestamp = result["date"]["utc"]
        param = result["parameter"]
        value = result["value"]
        unit = result["unit"]
        station_id = result["location"]
        insert_measurement(station_id, timestamp, param, value, unit, "OpenAQ")

    print("✅ OpenAQ actualizado.")


def fetch_openweather():
    """Extrae datos de OpenWeather y los guarda en la DB."""
    params = {
        "lat": LAT,
        "lon": LON,
        "appid": OPENWEATHER_KEY,
        "units": "metric"
    }
    try:
        r = requests.get(OPENWEATHER_URL, params=params, timeout=15)
        data = r.json()
    except Exception as e:
        print("❌ Error en request OpenWeather:", e)
        return

    if "dt" not in data or "main" not in data:
        print("❌ Respuesta inesperada de OpenWeather:", data)
        return

    timestamp = datetime.utcfromtimestamp(data["dt"])
    temp = data["main"].get("temp")
    humidity = data["main"].get("humidity")
    pressure = data["main"].get("pressure")
    wind_speed = data.get("wind", {}).get("speed")
    wind_dir = data.get("wind", {}).get("deg", 0)

    insert_weather(timestamp, temp, humidity, wind_speed, wind_dir, pressure)
    print(f"✅ OpenWeather actualizado {timestamp} - Temp: {temp}°C, Hum: {humidity}%")


# ---------------- MAIN ----------------
if __name__ == "__main__":
    fetch_openaq()
    fetch_openweather()