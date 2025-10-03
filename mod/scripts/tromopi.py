import os
import base64
import requests
from dotenv import load_dotenv

# Cargar variables del archivo .env
load_dotenv()

username = os.getenv("EARTHDATA_USER")
password = os.getenv("EARTHDATA_PASS")

if not username or not password:
    raise ValueError("⚠ No se encontraron credenciales en .env")

# Construir header Authorization
token = base64.b64encode(f"{username}:{password}".encode()).decode()

# URL del archivo TROPOMI NO2
url = "https://data.gesdisc.earthdata.nasa.gov/data/S5P_TROPOMI_Level2/S5P_L2__NO2____HiR.1/2021/182/S5P_OFFL_L2__NO2____20210701T170324_20210701T184453_19257_01_010400_20210703T102341.nc"

session = requests.Session()
session.headers.update({"Authorization": f"Basic {token}"})

response = session.get(url, allow_redirects=True)

print("Status:", response.status_code)

if response.status_code == 200:
    with open("tropomi_sample.nc", "wb") as f:
        f.write(response.content)
    print("✅ Archivo descargado correctamente.")
else:
    print("❌ Falló la descarga:", response.text[:200])
