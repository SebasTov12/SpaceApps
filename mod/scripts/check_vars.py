import xarray as xr
import sys

# Variables que nos interesan
CANDIDATE_VARS = [
    # TROPOMI
    "PRODUCT/nitrogendioxide_tropospheric_column",
    "PRODUCT/nitrogendioxide_tropospheric_column_precision",
    "PRODUCT/qa_value",

    # TEMPO
    "product/cloud_fraction",
    "product/cloud_pressure",
    "support_data/fitted_slant_column",
    "support_data/fitted_slant_column_uncertainty",
    "support_data/surface_pressure",
    "support_data/terrain_height",
]

def check_vars(file_path):
    print(f"📂 Abriendo {file_path} ...")
    try:
        ds = xr.open_dataset(file_path, decode_cf=False, mask_and_scale=False)
    except Exception as e:
        print(f"❌ Error abriendo {file_path}: {e}")
        return
    
    found = []
    missing = []
    for var in CANDIDATE_VARS:
        if var in ds.variables:
            found.append(var)
        else:
            missing.append(var)

    print("\n✅ Variables encontradas:")
    for v in found:
        print("  -", v)

    print("\n⚠ Variables faltantes:")
    for v in missing:
        print("  -", v)

    print("\n📌 Dimensiones del archivo:")
    print(ds.dims)

    print("\n📌 Atributos globales:")
    for k, v in list(ds.attrs.items())[:10]:  # solo los primeros 10 para no saturar
        print(f"  {k}: {v}")

    ds.close()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python check_vars.py archivo.nc")
    else:
        check_vars(sys.argv[1])
