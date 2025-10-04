import h5py

with h5py.File("tempo_sample.nc", "r") as f:
    print("Grupos principales:")
    def print_structure(name, obj):
        print(name)
    f.visititems(print_structure)
