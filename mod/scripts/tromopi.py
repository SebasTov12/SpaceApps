import requests
import base64

# =============================
# ⚠️ ESCRIBE AQUÍ TUS CREDENCIALES MANUALMENTE
# =============================
username = "sebastiantovar12"
password = "Sebas_1979*#$12101371"  # Ejemplo recomendado: Tropomi2025!

# =============================
# 🔐 Generar encabezado Authorization
# =============================
token = base64.b64encode(f"{username}:{password}".encode()).decode()

url = "https://data.gesdisc.earthdata.nasa.gov/data/S5P_NRTI_L2/NO2/2025/275/S5P_NRTI_L2__NO2____20251002T143110_20251002T161240.nc"

session = requests.Session()
session.headers.update({
    "Authorization": f"Basic {token}",
    "User-Agent": "tromopi-client/1.0"
})

response = session.get(url, allow_redirects=True, timeout=60)

print("Status:", response.status_code)

if response.status_code == 200:
    with open("tropomi_sample.nc", "wb") as f:
        f.write(response.content)
    print("✅ Archivo descargado correctamente.")
else:
    print("❌ Falló la descarga:", response.text[:200])
