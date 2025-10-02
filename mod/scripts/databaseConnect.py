import psycopg2

DB_CONFIG = {
    "dbname": "air_quality_db",
    "user": "airbyter",
    "password": "AirBytes2025",
    "host": "192.168.2.8",  # ip de la rasp
    "port": 5432
}

def test_connection():
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cur = conn.cursor()
        print("✅ Conectado a la DB!")

        # listar tablas públicas
        cur.execute("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema='public'
            ORDER BY table_name;
        """)
        tablas = cur.fetchall()
        print("📂 Tablas en la DB:")
        for t in tablas:
            print("-", t[0])

        cur.close()
        conn.close()
    except Exception as e:
        print("❌ Error conectando a la DB:", e)

if __name__ == "__main__":
    test_connection()
