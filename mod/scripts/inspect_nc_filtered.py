import h5netcdf
import sys

# Palabras clave que queremos encontrar
TARGETS = [
    "nitrogendioxide",   # NO₂ en TROPOMI
    "no2",               # NO₂ en TEMPO
    "qa_value",          # calidad
    "latitude", "longitude"
]

def walk_and_filter(filename, group="/"):
    with h5netcdf.File(filename, "r") as f:
        def recurse(grp, prefix=""):
            # Variables en este grupo
            for name, var in grp.variables.items():
                full_name = prefix + name
                if any(t in full_name.lower() for t in TARGETS):
                    print(f"- {full_name} (shape={var.shape})")
            # Subgrupos
            for subgrp_name, subgrp in grp.groups.items():
                recurse(subgrp, prefix + subgrp_name + "/")
        recurse(f, "")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("⚠ Uso: python inspect_nc_filtered.py archivo.nc")
        sys.exit(1)

    filename = sys.argv[1]
    print(f"📂 Explorando {filename} en busca de NO₂/QA/lat/lon...\n")
    walk_and_filter(filename)
