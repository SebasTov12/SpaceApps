import os
from dotenv import load_dotenv

print("📂 Directorio actual:", os.getcwd())

load_dotenv()

print("Usuario:", os.getenv("EARTHDATA_USER"))
print("Pass:", os.getenv("EARTHDATA_PASS"))
