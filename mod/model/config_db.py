from sqlalchemy import create_engine

# 1️⃣ Base principal con datos climáticos
air_quality_engine = create_engine("postgresql://AirBytes2025@localhost:5432/air_quality_db")

# 2️⃣ Base con usuarios, preguntas y conversaciones
assistant_engine = create_engine("postgresql://postgres:miszorros@localhost:5432/assistant_db")

# 3️⃣ Base de autenticación
auth_engine = create_engine("postgresql://postgres:miszorros@localhost:5432/auth")

# 4️⃣ Base donde se guardan las predicciones del modelo
predictions_engine = create_engine("postgresql://postgres:miszorros@localhost:5432/predictions")
