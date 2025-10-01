import random
from datetime import datetime, timedelta
import psycopg2

DB_CONFIG = {
    "dbname": "air_quality_db",
    "user": "airbyter",
    "password": "AirBytes2025",
    "host": "192.168.2.8",
    "port": 5432
}

LAT, LON = 34.0522, -118.2437  # Los Angeles ejemplo
STATIONS = ["Station_A", "Station_B", "Station_C"]

def get_conn():
    return psycopg2.connect(**DB_CONFIG)

def insert_measurement(station_id, timestamp, pm25, pm10):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO measurements (station_id, timestamp, pm25, pm10, co2, o3, no2, so2, fuente)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
    """, (station_id, timestamp, pm25, pm10,
          random.randint(390, 420),           # CO2 ppm
          random.uniform(0, 0.1),            # O3 ppm
          random.uniform(0, 0.1),            # NO2 ppm
          random.uniform(0, 0.05),           # SO2 ppm
          "synthetic"))
    conn.commit()
    cur.close()
    conn.close()

def insert_weather(timestamp, temp, humidity, wind_speed):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO weather_observations (datetime_utc, lat, lon, temp, humidity, wind_speed, wind_dir, pressure, source)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
    """, (timestamp, LAT, LON, temp, humidity, wind_speed,
          random.randint(0, 360), random.randint(1000, 1025), "synthetic"))
    conn.commit()
    cur.close()
    conn.close()

# Generar datos para los últimos 7 días cada hora
now = datetime.utcnow()
for hour_offset in range(7*24):
    timestamp = now - timedelta(hours=hour_offset)
    for station in STATIONS:
        insert_measurement(station, timestamp, random.uniform(5, 35), random.uniform(10, 60))
    insert_weather(timestamp, random.uniform(15, 30), random.uniform(30, 70), random.uniform(0, 10))

print("✅ Database poblada con datos sintéticos.")
