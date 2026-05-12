import sys
from pathlib import Path
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Dict
import pandas as pd
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

load_dotenv(BASE_DIR / ".env")

from src.core.orchestrator import CreditRiskOrchestrator
from src.core.preprocessor import prepare_give_me_some_credit_grandmaster

app = FastAPI(
    title="Fintech Credit Risk API",
    description="Explainable AI & Legal Audit Engine",
    version="1.0.0"
)

orchestrator = CreditRiskOrchestrator(BASE_DIR)
_, X_test, _, _, feat_names = prepare_give_me_some_credit_grandmaster(
    str(BASE_DIR / "data" / "raw" / "Give Me Some Credit" / "cs-training.csv")
)
df_test = pd.DataFrame(X_test, columns=feat_names)


class AuditResponse(BaseModel):
    idx: int
    status: str
    prob: float
    report: str
    feat_name: str
    value_meaning: str
    shap_top: Dict[str, float]


class SampleRequest(BaseModel):
    n_samples: int = 3


@app.get("/health")
def health_check():
    return {"status": "System Online", "engine": "XGBoost + RAG"}


@app.post("/audit/sample", response_model=List[AuditResponse])
def audit_sample(req: SampleRequest):
    try:
        X_sample = df_test.sample(n=req.n_samples)
        results = orchestrator.analyze_batch(X_sample, n=req.n_samples)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/audit/predict", response_model=List[AuditResponse])
def audit_predict(payload: List[Dict[str, float]]):
    try:
        X_input = pd.DataFrame(payload)
        missing_cols = set(feat_names) - set(X_input.columns)
        if missing_cols:
            raise HTTPException(status_code=400, detail=f"Missing features: {missing_cols}")

        X_input = X_input[feat_names]
        results = orchestrator.analyze_batch(X_input, n=len(X_input))
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))