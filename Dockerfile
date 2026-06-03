FROM python:3.11-slim

WORKDIR /app

ENV MPLCONFIGDIR=/app/.config/matplotlib
ENV HF_HOME=/app/hf_cache

RUN mkdir -p /app/.config/matplotlib /app/hf_cache /app/chroma_db /app/data

COPY backend/requirements-docker.txt ./requirements-base.txt
COPY deployment/requirements-space.txt ./requirements-space.txt

RUN pip install --default-timeout=1000 --no-cache-dir torch torchvision torchaudio --extra-index-url https://download.pytorch.org/whl/cpu
RUN pip install --default-timeout=1000 --no-cache-dir -r requirements-base.txt
RUN pip install --default-timeout=1000 --no-cache-dir -r requirements-space.txt

COPY . .

RUN mv backend/src/core/orchestrator.py backend/src/core/orchestrator_local.py
COPY deployment/orchestrator_space.py backend/src/core/orchestrator.py

RUN python -c "import urllib.request; urllib.request.urlretrieve('https://huggingface.co/spaces/Muanai/fintech-credit-risk-api/resolve/main/backend/models/xgboost_grandmaster.joblib?download=true', 'backend/models/xgboost_grandmaster.joblib')"

ENV PYTHONPATH="/app/backend"

RUN pip install --no-cache-dir PyPDF2
RUN python -c "import chromadb; chromadb.PersistentClient(path='/app/backend/chroma_db').get_or_create_collection('pojk_credit_v2')"
RUN python -c "import sys, os; sys.path.insert(0, '/app/backend'); from src.core.orchestrator_local import build_tagged_vector_db; pdf='/app/backend/docs/POJK/POJK 40 Tahun 2024 Layanan Pendanaan Bersama Berbasis Teknologi Informasi.pdf'; build_tagged_vector_db(pdf, '/app/backend/chroma_db') if os.path.exists(pdf) else print('PDF tidak ada, menggunakan fallback collection kosong.')"

EXPOSE 7860

CMD ["uvicorn", "backend.src.api.main:app", "--host", "0.0.0.0", "--port", "7860", "--workers", "1"]