import xarray as xr
import pandas as pd

def process_tropomi_l2(file_path: str, qa_threshold: float = 0.75,
                       lat_bounds=None, lon_bounds=None) -> list:
    """
    Procesa archivo Sentinel-5P TROPOMI L2 (NO2 troposférico).
    Extrae lat, lon, NO2 troposférico y filtra por QA + bounding box opcional.
    Devuelve lista de diccionarios listos para DB.
    """
    try:
        ds = xr.open_dataset(file_path, group="PRODUCT")

        lat = ds["latitude"].values.flatten()
        lon = ds["longitude"].values.flatten()
        no2 = ds["nitrogendioxide_tropospheric_column"].values.flatten()
        qa = ds["qa_value"].values.flatten()

        df = pd.DataFrame({
            "latitude": lat,
            "longitude": lon,
            "no2_tropospheric_column": no2,
            "qa_value": qa
        })

        # Filtro QA
        df = df[df["qa_value"] >= qa_threshold]

        # Bounding box si aplica
        if lat_bounds and lon_bounds:
            df = df[
                (df["latitude"] >= lat_bounds[0]) & (df["latitude"] <= lat_bounds[1]) &
                (df["longitude"] >= lon_bounds[0]) & (df["longitude"] <= lon_bounds[1])
            ]

        return df.to_dict(orient="records")

    except Exception as e:
        print(f"⚠ Error procesando TROPOMI L2: {e}")
        return []


def process_tempo(file_path: str,
                  lat_bounds=None, lon_bounds=None) -> list:
    """
    Procesa archivo TEMPO L2 CLDO4 (geoloc + nubes).
    Extrae lat, lon y cloud_fraction si está disponible.
    Devuelve lista de diccionarios listos para DB.
    """
    try:
        ds = xr.open_dataset(file_path, group="geolocation")

        lat = ds["latitude"].values.flatten()
        lon = ds["longitude"].values.flatten()

        # Buscar cloud_fraction (si existe)
        cloud_fraction = None
        for var in ds.variables:
            if "cloud" in var.lower() and "fraction" in var.lower():
                cloud_fraction = ds[var].values.flatten()
                break

        df = pd.DataFrame({
            "latitude": lat,
            "longitude": lon,
            "cloud_fraction": cloud_fraction if cloud_fraction is not None else None
        })

        # Bounding box si aplica
        if lat_bounds and lon_bounds:
            df = df[
                (df["latitude"] >= lat_bounds[0]) & (df["latitude"] <= lat_bounds[1]) &
                (df["longitude"] >= lon_bounds[0]) & (df["longitude"] <= lon_bounds[1])
            ]

        return df.to_dict(orient="records")

    except Exception as e:
        print(f"⚠ Error procesando TEMPO L2 Clouds: {e}")
        return []

rows_tropomi = process_tropomi_l2("tropomi_sample.nc")
df_tropomi = pd.DataFrame(rows_tropomi)
print(df_tropomi.head())

rows_tempo = process_tempo("tempo_sample.nc")
df_tempo = pd.DataFrame(rows_tempo)
print(df_tempo.head())
