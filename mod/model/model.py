"""
model.py - Versión conectada a múltiples bases PostgreSQL

Este script:
 1️⃣ Lee datos de 'air_quality_db' (tabla model_features)
 2️⃣ Entrena un modelo RandomForest para predecir una variable (pm25, no2, etc.)
 3️⃣ Guarda el modelo entrenado
 4️⃣ Inserta las predicciones en la base 'predictions'

Requiere:
 - config_db.py con las conexiones SQLAlchemy o psycopg2 a las bases
 - Python 3.9+
 - pandas, numpy, scikit-learn, joblib, psycopg2, sqlalchemy
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
import psycopg2
from sqlalchemy import text

# 🔹 Importamos las conexiones desde config_db.py
from config_db import air_quality_engine, predictions_engine

MODEL_DIR = "models"
os.makedirs(MODEL_DIR, exist_ok=True)

# ------------------ UTIL: conexión ------------------

def get_conn():
    """Devuelve una conexión psycopg2 directa a air_quality_db"""
    return psycopg2.connect(
        dbname="air_quality_db",
        user="postgres",
        password="miszorros",
        host="localhost",
        port="5432"
    )

# ------------------ Construcción del dataset ------------------

def fetch_model_features(start_dt=None, end_dt=None, bbox=None, limit=None):
    """Carga filas desde la tabla model_features en air_quality_db."""
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

# ------------------ Preprocesamiento ------------------

def prepare_X_y(df, target="pm25"):
    """Prepara X (features) e y (target) desde model_features."""
    candidate_cols = ["temp", "wind_speed", "no2", "o3", "pm25", "lat", "lon"]
    cols = [c for c in candidate_cols if c in df.columns]
    if target not in cols:
        if target in df.columns:
            cols.append(target)
        else:
            raise ValueError(f"Target {target} no está en el dataframe")

    df = df.dropna(subset=[target])
    feature_cols = [c for c in cols if c != target]

    if not feature_cols:
        df = df.copy()
        df['hour'] = pd.to_datetime(df['datetime_utc']).dt.hour
        feature_cols = ['lat', 'lon', 'hour']

    X = df[feature_cols].copy()
    for c in X.columns:
        if X[c].isna().any():
            X[c] = X[c].fillna(X[c].median())

    y = df[target].astype(float)
    return X, y, feature_cols

# ------------------ Entrenamiento ------------------

def train_model_for(target='pm25', days_history=180, bbox=None, test_size=0.2, random_state=42):
    """Entrena un modelo RandomForest y lo guarda."""
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
    path = os.path.join(MODEL_DIR, f"{target}_rf.joblib")
    if not os.path.exists(path):
        raise FileNotFoundError(f"Modelo no encontrado: {path}")
    obj = joblib.load(path)
    return obj['model'], obj['features']

# ------------------ Predicción ------------------

def build_feature_row(lat, lon, dt, feature_names):
    """Construye una fila con valores aproximados."""
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
            features[f] = lat
        elif f == 'lon':
            features[f] = lon
        elif f == 'hour':
            features[f] = hour
        else:
            colmap = {"pm25": 3, "no2": 4, "o3": 5, "temp": 6, "wind_speed": 7}
            features[f] = float(row[colmap[f]]) if row and f in colmap and row[colmap[f]] else 0.0
    return pd.DataFrame([features])

def predict_for(lat, lon, dt_iso, target='pm25'):
    model, feature_names = load_model(target)
    X_row = build_feature_row(lat, lon, dt_iso, feature_names)
    X_row = X_row.reindex(columns=feature_names, fill_value=0.0)
    pred = model.predict(X_row)
    val = float(pred[0])

    # Guardar predicción en la base predictions
    df = pd.DataFrame([{
        "timestamp": pd.Timestamp.now(),
        "lat": lat,
        "lon": lon,
        f"{target}_pred": val,
        "riesgo": "moderado",
        "modelo_version": "v1.0"
    }])

    df.to_sql("predictions", predictions_engine, if_exists="append", index=False)
    print(f"💾 Predicción guardada en DB: {val:.4f}")
    return val

# ------------------ CLI ------------------

def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument('--train', action='store_true')
    p.add_argument('--predict', action='store_true')
    p.add_argument('--param', type=str, default='pm25')
    p.add_argument('--lat', type=float)
    p.add_argument('--lon', type=float)
    p.add_argument('--datetime', type=str)
    p.add_argument('--days', type=int, default=180)
    p.add_argument('--bbox', type=float, nargs=4, metavar=('lat_min','lat_max','lon_min','lon_max'))
    return p.parse_args()

def main():
    args = parse_args()
    if args.train:
        res = train_model_for(target=args.param, days_history=args.days, bbox=tuple(args.bbox) if args.bbox else None)
        print(res)
    if args.predict:
        if args.lat is None or args.lon is None:
            raise ValueError('Debes incluir --lat y --lon')
        dt = args.datetime or datetime.now(timezone.utc).isoformat()
        val = predict_for(args.lat, args.lon, dt, target=args.param)
        print(f"Predicción {args.param} @ ({args.lat},{args.lon}) = {val:.4f}")

if __name__ == '__main__':
    main()



