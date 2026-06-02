import sys
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Dict, List, Optional

import pandas as pd
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent.parent.parent


load_dotenv(BASE_DIR / ".env")


class AppState:
    orchestrator = None
    df_test: Optional[pd.DataFrame] = None
    feat_names: Optional[list] = None


state = AppState()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Semua inisialisasi berat di sini. Jika gagal, server tidak start."""
    from src.core.orchestrator import CreditRiskOrchestrator
    from src.core.preprocessor import prepare_give_me_some_credit_grandmaster

    state.orchestrator = CreditRiskOrchestrator(BASE_DIR)

    _, X_test, _, _, feat_names = prepare_give_me_some_credit_grandmaster(
        str(BASE_DIR / "data" / "raw" / "Give Me Some Credit" / "cs-training.csv")
    )
    state.feat_names = feat_names
    state.df_test = pd.DataFrame(X_test, columns=feat_names)

    yield

    state.orchestrator = None


app = FastAPI(
    title="Fintech Credit Risk API",
    description="Explainable AI & Legal Audit Engine — POJK 40/2024",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    max_age=600,
)


class AuditResponse(BaseModel):
    request_id: str
    idx: int
    status: str
    prob: float
    report: str
    feat_name: str
    value_meaning: str
    shap_top: Dict[str, float]


class SampleRequest(BaseModel):
    n_samples: int = Field(default=3, ge=1, le=20)
    seed: Optional[int] = Field(default=None, description="Seed untuk reproducibility")


@app.get("/health")
def health_check():
    return {
        "status": "online",
        "engine": "XGBoost + ChromaDB + Llama 3.2",
        "model_loaded": state.orchestrator is not None,
        "test_rows": len(state.df_test) if state.df_test is not None else 0,
    }


@app.post("/audit/sample", response_model=List[AuditResponse])
def audit_sample(req: SampleRequest):
    seed = req.seed if req.seed is not None else 42
    X_sample = state.df_test.sample(n=req.n_samples, random_state=seed)
    results = state.orchestrator.analyze_batch(X_sample, n=req.n_samples)

    request_id = str(uuid.uuid4())
    for r in results:
        r["request_id"] = request_id

    return results


@app.post("/audit/predict", response_model=List[AuditResponse])
def audit_predict(payload: List[Dict[str, float]]):
    if not payload:
        raise HTTPException(status_code=400, detail="Payload kosong.")

    X_input = pd.DataFrame(payload)
    missing = set(state.feat_names) - set(X_input.columns)
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Fitur tidak lengkap: {sorted(missing)}"
        )

    X_input = X_input[state.feat_names]

    try:
        results = state.orchestrator.analyze_batch(X_input, n=len(X_input))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inferensi gagal: {str(e)}")

    request_id = str(uuid.uuid4())
    for r in results:
        r["request_id"] = request_id

    return results