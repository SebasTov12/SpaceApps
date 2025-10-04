"""
climate_model_train.py

Entrena un modelo predictivo usando la tabla 'model_features'
de tu base de datos PostgreSQL (dump air_quality_db.sql).

Predice valores futuros de variables ambientales (pm25, no2, o3, etc.)
en función de fecha, ubicación (lat/lon) y otras condiciones.
"""

import os
import joblib
from datetime import datetime
from dateutil import parser
import pandas as pd
import numpy as np
from sqlalchemy import create_engine, text

from sklearn.model_selection import train_test_split
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.multioutput import MultiOutputRegressor
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_squared_error, mean_absolute_error

# Intentamos importar LightGBM (si no está, usamos RandomForest)
try:
    import lightgbm as lgb
    HAS_LGB = True
except ImportError:
    HAS_LGB = False

# -----------------------
# Función para obtener estación
# -----------------------
def month_to_season(month, hemisphere='north'):
    mapping_north = {
        12: 'invierno', 1: 'invierno', 2: 'invierno',
        3: 'primavera', 4: 'primavera', 5: 'primavera',
        6: 'verano', 7: 'verano', 8: 'verano',
        9: 'otoño', 10: 'otoño', 11: 'otoño'
    }
    mapping_south = {
        12: 'verano', 1: 'verano', 2: 'verano',
        3: 'otoño', 4: 'otoño', 5: 'otoño',
        6: 'invierno', 7: 'invierno', 8: 'invierno',
        9: 'primavera', 10: 'primavera', 11: 'primavera'
    }
    return mapping_south.get(month, 'desconocido') if hemisphere == 'south' else mapping_north.get(month, 'desconocido')

# -----------------------
# Conexión a la base de datos
# -----------------------
def load_data_from_db(connection_string, table_name):
    """Carga la tabla desde la base de datos."""
    engine = create_engine(connection_string)
    query = f"SELECT * FROM {table_name};"
    with engine.connect() as conn:
        df = pd.read_sql(text(query), conn)
    df["datetime_utc"] = pd.to_datetime(df["datetime_utc"])
    return df

# -----------------------
# Preprocesamiento
# -----------------------
def preprocess_df(df):
    """Crea variables de tiempo y prepara features/targets."""
    df = df.copy()
    df["year"] = df["datetime_utc"].dt.year
    df["month"] = df["datetime_utc"].dt.month
    df["day"] = df["datetime_utc"].dt.day
    df["dayofweek"] = df["datetime_utc"].dt.dayofweek
    df["dayofyear"] = df["datetime_utc"].dt.dayofyear
    df["season"] = df["month"].apply(month_to_season)

    # Features numéricas base
    feature_cols = ["lat", "lon", "year", "month", "day", "dayofweek", "dayofyear"]

    # Targets: variables ambientales
    target_cols = ["pm25", "no2", "o3", "temp", "wind_speed", "pm10", "humidity", "wind_dir", "pressure"]

    # Filtramos solo las columnas existentes (por si alguna falta)
    target_cols = [c for c in target_cols if c in df.columns]

    # Eliminamos filas con NaN en las columnas objetivo
    df = df.dropna(subset=target_cols)

    X = df[feature_cols + ["season"]]
    y = df[target_cols]

    preprocessor = ColumnTransformer([
        ("cat", OneHotEncoder(handle_unknown="ignore", sparse=False), ["season"]),
        ("num", StandardScaler(), feature_cols)
    ])

    return X, y, preprocessor, target_cols

# -----------------------
# Construcción del modelo
# -----------------------
def build_model(use_lightgbm=True):
    if use_lightgbm and HAS_LGB:
        base_model = lgb.LGBMRegressor(n_estimators=150, learning_rate=0.05, random_state=42)
    else:
        base_model = RandomForestRegressor(n_estimators=150, n_jobs=-1, random_state=42)
    model = MultiOutputRegressor(base_model)
    return model

# -----------------------
# Entrenamiento
# -----------------------
def train_model(df, model_save_path="models", use_lightgbm=True):
    X, y, preprocessor, target_cols = preprocess_df(df)

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, shuffle=True)

    X_train_prep = preprocessor.fit_transform(X_train)
    X_test_prep = preprocessor.transform(X_test)

    model = build_model(use_lightgbm=use_lightgbm)
    print(f"Entrenando modelo con {len(X_train)} muestras...")
    model.fit(X_train_prep, y_train)

    y_pred = model.predict(X_test_prep)

    metrics = {}
    for i, col in enumerate(target_cols):
        mse = mean_squared_error(y_test.iloc[:, i], y_pred[:, i])
        rmse = np.sqrt(mse)
        mae = mean_absolute_error(y_test.iloc[:, i], y_pred[:, i])
        metrics[col] = {"RMSE": rmse, "MAE": mae}
        print(f"{col}: RMSE={rmse:.4f}, MAE={mae:.4f}")

    os.makedirs(model_save_path, exist_ok=True)
    pipeline = {"preprocessor": preprocessor, "model": model, "target_cols": target_cols}
    joblib.dump(pipeline, os.path.join(model_save_path, "climate_pipeline.joblib"))
    print(f"\n✅ Modelo guardado en {model_save_path}/climate_pipeline.joblib")

    return metrics

# -----------------------
# Predicción
# -----------------------
def load_pipeline(pipeline_path="models/climate_pipeline.joblib"):
    pipeline = joblib.load(pipeline_path)
    return pipeline["preprocessor"], pipeline["model"], pipeline["target_cols"]

def predict_for_date(pipeline_path, predict_date, lat, lon):
    preprocessor, model, target_cols = load_pipeline(pipeline_path)

    if isinstance(predict_date, str):
        dt = parser.parse(predict_date)
    else:
        dt = predict_date

    row = pd.DataFrame([{
        "lat": lat,
        "lon": lon,
        "year": dt.year,
        "month": dt.month,
        "day": dt.day,
        "dayofweek": dt.weekday(),
        "dayofyear": dt.timetuple().tm_yday,
        "season": month_to_season(dt.month)
    }])

    X_prep = preprocessor.transform(row)
    pred = model.predict(X_prep)[0]

    return {target_cols[i]: float(pred[i]) for i in range(len(target_cols))}

# -----------------------
# Main de ejemplo
# -----------------------
if __name__ == "__main__":
    # Cambia esto por tu string real de conexión
    # Ejemplo PostgreSQL:
    CONNECTION_STRING = "postgresql://usuario:contraseña@localhost:5432/air_quality_db"

    print("Cargando datos desde la base de datos...")
    df = load_data_from_db(CONNECTION_STRING, "model_features")
    print(f"Datos cargados: {len(df)} filas")

    metrics = train_model(df, model_save_path="models", use_lightgbm=True)
    print("\nMétricas finales:", metrics)

    # Ejemplo de predicción
    example = predict_for_date("models/climate_pipeline.joblib", "2026-01-15", lat=-33.45, lon=-70.66)
    print("\nPredicción ejemplo para Santiago de Chile (2026-01-15):")
    print(example)

