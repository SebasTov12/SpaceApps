import h5py
import xarray as xr

def open_tropomi_nc(path):
    try:
        ds = xr.open_dataset(path, group="PRODUCT")
        print("Variables TROPOMI:", list(ds.data_vars.keys()))
        return ds
    except Exception as e:
        print("❌ No se pudo abrir TROPOMI:", e)
        return None

open_tropomi_nc()