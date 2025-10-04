"""
model.py - Versión robusta y conectada a múltiples bases PostgreSQL

- Usa config_db.py con SQLAlchemy para conectar las bases
- Corrige advertencia de pandas (usa engine)
- Evita ValueError si no hay suficientes datos para entrenar
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
from sqlalchemy import text
from config_db import air_quality_engine, predictions_engine  # tu archivo config_db.py

MODEL_DIR = "models"
os.makedirs(MODEL_DIR, exist_ok=True)

# ------------------ Cargar datos ------------------

def fetch_model_features(start_dt=None, end_dt=None, bbox=None, limit=None):
    """Carga filas desde model_features usando SQLAlchemy (sin warnings)."""
    q = "SELECT * FROM model_features"
    clauses = []
    params = {}

    if start_dt:
        clauses.append("datetime_utc >= :start_dt")
        params["start_dt"] = start_dt if isinstance(start_dt, str) else start_dt.isoformat()
    if end_dt:
        clauses.append("datetime_utc <= :end_dt")
        params["end_dt"] = end_dt if isinstance(end_dt, str) else end_dt.isoformat()
    if bbox:
        lat_min, lat_max, lon_min, lon_max = bbox
        clauses.append("lat BETWEEN :lat_min AND :lat_max")
        clauses.append("lon BETWEEN :lon_min AND :lon_max")
        params.update({"lat_min": lat_min, "lat_max": lat_max, "lon_min": lon_min, "lon_max": lon_max})

    if clauses:
        q += " WHERE " + " AND ".join(clauses)
    if limit:
        q += f" LIMIT {int(limit)}"

    with air_quality_engine.connect() as conn:
        df = pd.read_sql(text(q), conn, params=params)

    print(f"📊 Se cargaron {len(df)} filas desde model_features")
    return df

# ------------------ Preparación ------------------

def prepare_X_y(df, target="pm25"):
    """Prepara X e y asegurando que haya suficientes filas válidas."""
    candidate_cols = ["temp", "wind_speed", "no2", "o3", "pm25", "lat", "lon"]
    cols = [c for c in candidate_cols if c in df.columns]

    if target not in cols:
        if target in df.columns:
            cols.append(target)
        else:
            raise ValueError(f"Target {target} no existe en los datos")

    df = df.dropna(subset=[target])
    if len(df) < 5:
        raise RuntimeError(f"No hay suficientes filas para entrenar ({len(df)} registros válidos)")

    feature_cols = [c for c in cols if c != target]
    X = df[feature_cols].copy()
    for c in X.columns:
        if X[c].isna().any():
            X[c] = X[c].fillna(X[c].median())
    y = df[target].astype(float)
    return X, y, feature_cols

# ------------------ Entrenamiento ------------------

def train_model_for(target='pm25', days_history=180, bbox=None, test_size=0.2):
    """Entrena un modelo RandomForest y lo guarda."""
    end_dt = datetime.now(timezone.utc)
    start_dt = end_dt - timedelta(days=days_history)

    print(f"🔎 Cargando datos entre {start_dt.isoformat()} y {end_dt.isoformat()} (target={target})")
    df = fetch_model_features(start_dt=start_dt.isoformat(), end_dt=end_dt.isoformat(), bbox=bbox)
    if df.empty:
        print("⚠️ No se encontraron datos en model_features. Entrenamiento cancelado.")
        return None

    try:
        X, y, feature_names = prepare_X_y(df, target=target)
    except RuntimeError as e:
        print(f"⚠️ {e}. Entrenamiento cancelado.")
        return None

    # Evita error si hay muy pocas filas
    if len(X) < 10:
        print(f"⚠️ Muy pocos datos ({len(X)} filas). Entrenamiento cancelado.")
        return None

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=test_size, random_state=42)

    print(f"📦 Entrenando RandomForest ({len(X_train)} train / {len(X_test)} test)...")
    model = RandomForestRegressor(n_estimators=200, max_depth=12, random_state=42)
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    rmse = math.sqrt(mean_squared_error(y_test, y_pred))
    r2 = r2_score(y_test, y_pred)

    model_path = os.path.join(MODEL_DIR, f"{target}_rf.joblib")
    joblib.dump({"model": model, "features": feature_names}, model_path)

    print(f"✅ Modelo guardado en {model_path}")
    print(f"📊 Métricas: RMSE={rmse:.4f}, R2={r2:.4f}")

    return {"rmse": rmse, "r2": r2, "features": feature_names}

# ------------------ Cargar modelo ------------------

def load_model(target='pm25'):
    path = os.path.join(MODEL_DIR, f"{target}_rf.joblib")
    if not os.path.exists(path):
        raise FileNotFoundError(f"No existe el modelo {path}")
    obj = joblib.load(path)
    return obj['model'], obj['features']

# ------------------ Predicción ------------------

def predict_for(lat, lon, dt_iso, target='pm25'):
    model, feature_names = load_model(target)
    X_row = pd.DataFrame([{"lat": lat, "lon": lon, "temp": 25, "wind_speed": 2, "no2": 10, "o3": 15}])
    X_row = X_row.reindex(columns=feature_names, fill_value=0.0)
    pred = model.predict(X_row)
    val = float(pred[0])

    # Guardar en base predictions
    df_pred = pd.DataFrame([{
        "timestamp": pd.Timestamp.now(),
        "lat": lat,
        "lon": lon,
        f"{target}_pred": val,
        "modelo_version": "v1.0"
    }])
    df_pred.to_sql("predictions", predictions_engine, if_exists="append", index=False)
    print(f"💾 Predicción guardada en la base: {val:.4f}")
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
    return p.parse_args()

def main():
    args = parse_args()
    if args.train:
        res = train_model_for(target=args.param)
        if res:
            print("✅ Entrenamiento completado.")
    if args.predict:
        if args.lat is None or args.lon is None:
            raise ValueError("Faltan parámetros --lat y --lon")
        dt = args.datetime or datetime.now(timezone.utc).isoformat()
        val = predict_for(args.lat, args.lon, dt, target=args.param)
        print(f"Predicción {args.param} @ {args.lat},{args.lon} = {val:.4f}")

if __name__ == "__main__":
    main()




