import pandas as pd
import numpy as np
import shap
import joblib
import chromadb
from sentence_transformers import SentenceTransformer
import ollama
from pathlib import Path


class CreditRiskOrchestrator:
    def __init__(self):
        current_dir = Path(__file__).resolve().parent
        project_root = current_dir.parent

        model_path = project_root / 'models' / 'xgboost_grandmaster.joblib'
        features_path = project_root / 'models' / 'feature_names.joblib'

        self.xgb_model = joblib.load(str(model_path))
        self.feature_names = joblib.load(str(features_path))

        db_path = project_root / 'chroma_db'
        self.chroma_client = chromadb.PersistentClient(path=str(db_path))
        self.collection = self.chroma_client.get_collection(name="pojk_40_2024")
        self.embedding_model = SentenceTransformer('all-MiniLM-L6-v2')

        self.explainer = shap.TreeExplainer(self.xgb_model)
        self.rejection_threshold = 0.7855

    def analyze_batch(self, X_batch_df, n_customers=5):
        probs = self.xgb_model.predict_proba(X_batch_df)[:, 1]
        shap_values = self.explainer(X_batch_df)

        results_summary = []

        for i in range(min(n_customers, len(X_batch_df))):
            risk_prob = probs[i]

            customer_shap = shap_values[i]
            top_feature_idx = np.abs(customer_shap.values).argmax()
            primary_feature = self.feature_names[top_feature_idx]
            feature_val = X_batch_df.iloc[i, top_feature_idx]

            status = "REJECT" if risk_prob >= self.rejection_threshold else "APPROVE"

            legal_context = self.retrieve_legal_context(primary_feature)

            print(f"\nProcessing Customer {i} | Prob: {risk_prob:.4f} | Top Feature: {primary_feature}")

            explanation = self.generate_explanation(
                status,
                f"{primary_feature} dengan nilai {feature_val}",
                legal_context
            )

            print(f"\nLAPORAN:\n{explanation}\n{'-' * 50}")

            results_summary.append({
                "customer_idx": i,
                "status": status,
                "explanation": explanation
            })

        return results_summary

    def retrieve_legal_context(self, feature_name):
        query = f"Kriteria penilaian risiko kredit berdasarkan {feature_name} dan mitigasi kegagalan pembayaran"
        query_vector = self.embedding_model.encode(query).tolist()
        results = self.collection.query(query_embeddings=[query_vector], n_results=1)
        return results['documents'][0][0]

    def generate_explanation(self, status, tech_reason, legal_context):
        prompt = f"""
        Buat laporan audit singkat 2 paragraf dalam Bahasa Indonesia.
        Keputusan: {status}
        Alasan Teknis: {tech_reason}
        Referensi POJK: {legal_context}
        Paragraf 1 menjelaskan alasan teknis, Paragraf 2 menjelaskan kewajiban mitigasi risiko sesuai POJK.
        """
        response = ollama.chat(model='llama3.2', messages=[{'role': 'user', 'content': prompt}])
        return response['message']['content']


if __name__ == "__main__":
    from src.core.preprocessor import prepare_give_me_some_credit_grandmaster

    current_dir = Path(__file__).resolve().parent
    project_root = current_dir.parent

    orchestrator = CreditRiskOrchestrator()

    file_path = project_root / 'data' / 'raw' / 'Give Me Some Credit' / 'cs-training.csv'

    _, X_test, _, _, feature_names_prep = prepare_give_me_some_credit_grandmaster(str(file_path))

    X_test_df = pd.DataFrame(X_test, columns=feature_names_prep)

    X_test_sample = X_test_df.sample(n=5, random_state=42)

    orchestrator.analyze_batch(X_test_sample, n_customers=5)