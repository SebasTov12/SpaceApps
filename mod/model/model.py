"""
air_quality_model.py

Conecta los scripts ETL y utilidades que subiste y construye un pipeline
para: 1) crear dataset desde la DB (tabla model_features), 2) entrenar un modelo
por parámetro (ej. pm25), 3) guardar el modelo y 4) hacer predicciones por
ubicación y tiempo.

Requisitos:
- Python 3.9+
- pandas, numpy, scikit-learn, joblib, psycopg2, sqlalchemy
- Los scripts originales en el mismo directorio: etl_air_quality.py, check_vars.py, databaseConnect.py

Uso básico:
    python air_quality_model.py --train --param pm25
    python air_quality_model.py --predict --param pm25 --lat 4.7 --lon -74.07 --datetime "2025-10-05T12:00:00Z"

"""

import os
import argparse
from datetime import datetime, timezone, timedelta
import math
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, r2_score

# Conexión a DB (usa la configuración de databaseConnect.py)
try:
    from databaseConnect import DB_CONFIG
except Exception:
    DB_CONFIG = {
        "dbname": "air_quality_db",
        "user": "airbyter",
        "password": "AirBytes2025",
        "host": "192.168.2.8",
        "port": 5432
    }

import psycopg2

MODEL_DIR = "models"
os.makedirs(MODEL_DIR, exist_ok=True)

# ------------------ UTIL: conexión ------------------

def get_conn():
    return psycopg2.connect(**DB_CONFIG)

# ------------------ Construcción del dataset ------------------

def fetch_model_features(start_dt=None, end_dt=None, bbox=None, limit=None):
    """Carga filas desde la tabla model_features. Devuelve DataFrame.

    - start_dt, end_dt: datetimes (timezone-aware) o strings ISO.
    - bbox: (lat_min, lat_max, lon_min, lon_max)
    - limit: número máximo de filas a traer
    """
    q = "SELECT * FROM model_features"
    clauses = []
    params = []
    if start_dt:
        clauses.append("datetime_utc >= %s")
        params.append(start_dt if isinstance(start_dt, str) else start_dt.isoformat())
    if end_dt:
        clauses.append("datetime_utc <= %s")
        params.append(end_dt if isinstance(end_dt, str) else end_dt.isoformat())
    if bbox:
        lat_min, lat_max, lon_min, lon_max = bbox
        clauses.append("lat BETWEEN %s AND %s")
        clauses.append("lon BETWEEN %s AND %s")
        params.extend([lat_min, lat_max, lon_min, lon_max])
    if clauses:
        q += " WHERE " + " AND ".join(clauses)
    if limit:
        q += f" LIMIT {int(limit)}"

    conn = get_conn()
    df = pd.read_sql(q, conn, params=params)
    conn.close()
    return df

# ------------------ Preprocesado simple ------------------

def prepare_X_y(df, target="pm25"):
    """Prepara X (features) e y (target) desde model_features.
    Usa columnas numéricas conocidas. Devuelve X, y, feature_names.
    """
    # columnas candidatas (ajusta si tu tabla tiene otras)
    candidate_cols = [
        "temp", "wind_speed", "no2", "o3", "pm25", "lat", "lon"
    ]
    # conservar solo las que existen
    cols = [c for c in candidate_cols if c in df.columns]
    if target not in cols:
        # si target no está presente en cols pero existe en la tabla, añadir
        if target in df.columns:
            cols.append(target)
        else:
            raise ValueError(f"Target {target} no está en el dataframe")

    # eliminar filas con NA en target
    df = df.dropna(subset=[target])

    # features: todas menos target y datetime_utc
    feature_cols = [c for c in cols if c != target]

    # Si no hay features numéricas suficientes, usar lat/lon y time-of-day
    if not feature_cols:
        df = df.copy()
        df['hour'] = pd.to_datetime(df['datetime_utc']).dt.hour
        feature_cols = ['lat', 'lon', 'hour']

    X = df[feature_cols].copy()
    # rellenar NA con mediana
    for c in X.columns:
        if X[c].isna().any():
            X[c] = X[c].fillna(X[c].median())

    y = df[target].astype(float)
    return X, y, feature_cols

# ------------------ Entrenamiento ------------------

def train_model_for(target='pm25', days_history=180, bbox=None, test_size=0.2, random_state=42):
    """Entrena un RandomForestRegressor sobre model_features para el target elegido.
    Guarda el modelo y devuelve métricas.
    """
    end_dt = datetime.now(timezone.utc)
    start_dt = end_dt - timedelta(days=days_history)

    print(f"🔎 Cargando datos {start_dt.isoformat()} → {end_dt.isoformat()} para target={target}")
    df = fetch_model_features(start_dt=start_dt.isoformat(), end_dt=end_dt.isoformat(), bbox=bbox)
    if df.empty:
        raise RuntimeError("No hay datos en model_features para el rango especificado")

    X, y, feature_names = prepare_X_y(df, target=target)

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=test_size, random_state=random_state)

    print(f"📦 Entrenando RandomForest (n={len(X_train)} train / {len(X_test)} test) ...")
    model = RandomForestRegressor(n_estimators=200, max_depth=12, random_state=random_state)
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    mse = mean_squared_error(y_test, y_pred)
    rmse = math.sqrt(mse)
    r2 = r2_score(y_test, y_pred)

    model_path = os.path.join(MODEL_DIR, f"{target}_rf.joblib")
    joblib.dump({"model": model, "features": feature_names}, model_path)

    print(f"✅ Modelo guardado en {model_path}")
    print(f"📊 RMSE={rmse:.4f}, R2={r2:.4f}")

    return {"model_path": model_path, "rmse": rmse, "r2": r2, "features": feature_names}

# ------------------ Cargar modelo ------------------

def load_model(target='pm25'):
    model_path = os.path.join(MODEL_DIR, f"{target}_rf.joblib")
    if not os.path.exists(model_path):
        raise FileNotFoundError(f"Modelo no encontrado: {model_path}")
    obj = joblib.load(model_path)
    return obj['model'], obj['features']

# ------------------ Predicción por lat/lon/datetime ------------------

def build_feature_row(lat, lon, dt, feature_names):
    """Construye fila de features aproximada.
    - Intenta obtener valores recientes de la DB (mediciones + weather).
    - Si no hay datos, usa heurísticas (lat/lon, hour).
    """
    # intentamos traer el registro más cercano en time y space de model_features
    conn = get_conn()
    cur = conn.cursor()
    q = """
    SELECT datetime_utc, lat, lon, pm25, no2, o3, temp, wind_speed
    FROM model_features
    ORDER BY ((lat - %s)^2 + (lon - %s)^2) + EXTRACT(EPOCH FROM (ABS(datetime_utc - %s))) / 100000.0
    LIMIT 1
    """
    cur.execute(q, (lat, lon, dt))
    row = cur.fetchone()
    cur.close()
    conn.close()

    features = {}
    hour = pd.to_datetime(dt).hour if dt is not None else 12
    for f in feature_names:
        if f == 'lat':
            features['lat'] = lat
        elif f == 'lon':
            features['lon'] = lon
        elif f == 'hour':
            features['hour'] = hour
        else:
            # usar valor del row si existe
            if row is not None:
                colmap = {"pm25":3, "no2":4, "o3":5, "temp":6, "wind_speed":7}
                if f in colmap and row[colmap[f]] is not None:
                    features[f] = float(row[colmap[f]])
                else:
                    features[f] = 0.0
            else:
                features[f] = 0.0
    # convertir a DataFrame fila
    return pd.DataFrame([features])


def predict_for(lat, lon, dt_iso, target='pm25'):
    model, feature_names = load_model(target)
    X_row = build_feature_row(lat, lon, dt_iso, feature_names)
    # asegurar columnas en el orden correcto
    X_row = X_row.reindex(columns=feature_names, fill_value=0.0)
    pred = model.predict(X_row)
    return float(pred[0])

# ------------------ CLI ------------------

def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument('--train', action='store_true')
    p.add_argument('--predict', action='store_true')
    p.add_argument('--param', type=str, default='pm25', help='Target parameter to predict (pm25, no2, etc)')
    p.add_argument('--lat', type=float)
    p.add_argument('--lon', type=float)
    p.add_argument('--datetime', type=str)
    p.add_argument('--days', type=int, default=180, help='History days to train on')
    p.add_argument('--bbox', type=float, nargs=4, metavar=('lat_min','lat_max','lon_min','lon_max'))
    return p.parse_args()


def main():
    args = parse_args()
    if args.train:
        res = train_model_for(target=args.param, days_history=args.days, bbox=tuple(args.bbox) if args.bbox else None)
        print(res)

    if args.predict:
        if args.lat is None or args.lon is None:
            raise ValueError('Para predecir necesitas --lat y --lon')
        dt = args.datetime or datetime.now(timezone.utc).isoformat()
        val = predict_for(args.lat, args.lon, dt, target=args.param)
        print(f"Predicción {args.param} @ {args.lat},{args.lon} {dt} => {val:.4f}")

if __name__ == '__main__':
    main()


