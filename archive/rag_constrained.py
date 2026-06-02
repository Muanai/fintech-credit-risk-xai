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
        self.collection = self.chroma_client.get_collection(name="pojk_40_2024_smart")
        self.embedding_model = SentenceTransformer('all-MiniLM-L6-v2')

        self.explainer = shap.TreeExplainer(self.xgb_model)
        self.rejection_threshold = 0.7855

        self.feature_translator = {
            "RevolvingUtilizationOfUnsecuredLines": "Rasio utilisasi batas kredit dan beban utang",
            "age": "Usia calon peminjam",
            "NumberOfTime30-59DaysPastDueNotWorse": "Riwayat keterlambatan pembayaran",
            "DebtRatio": "Rasio beban utang terhadap pendapatan",
            "MonthlyIncome": "Kapasitas pendapatan bulanan",
            "NumberOfOpenCreditLinesAndLoans": "Jumlah fasilitas pinjaman aktif",
            "NumberOfTimes90DaysLate": "Kredit macet atau gagal bayar historis",
            "NumberRealEstateLoansOrLines": "Pinjaman beragun properti",
            "NumberOfTime60-89DaysPastDueNotWorse": "Riwayat keterlambatan pembayaran menengah",
            "NumberOfDependents": "Jumlah tanggungan keluarga"
        }

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

            indo_feature = self.feature_translator.get(primary_feature, primary_feature)
            legal_context = self.retrieve_legal_context(indo_feature)

            print(f"\nProcessing Customer {i} | Prob: {risk_prob:.4f} | Top Feature: {primary_feature}")

            explanation = self.generate_explanation(
                status,
                risk_prob,
                f"{indo_feature} dengan nilai terukur {feature_val:.2f}",
                legal_context
            )

            print(f"\nLAPORAN:\n{explanation}\n{'-' * 50}")

            results_summary.append({
                "customer_idx": i,
                "status": status,
                "explanation": explanation
            })

        return results_summary

    def retrieve_legal_context(self, indo_feature):
        query = f"kewajiban penyelenggara menilai kemampuan membayar utang nasabah dan mitigasi risiko terkait {indo_feature}"
        try:
            query_vector = self.embedding_model.encode(query).tolist()
            results = self.collection.query(query_embeddings=[query_vector], n_results=3)

            for doc in results['documents'][0]:
                doc_lower = doc.lower()
                bad_words = ["likuidasi", "saham", "koperasi", "direktur", "komisaris", "asosiasi", "pasal 220",
                             "dewan"]
                if not any(word in doc_lower for word in bad_words):
                    return doc

            return "Penyelenggara wajib menerapkan mitigasi risiko penyaluran Pendanaan melalui analisis kelayakan kredit (credit scoring) untuk memastikan kemampuan membayar calon Penerima Dana."
        except Exception:
            return "Penyelenggara wajib menerapkan mitigasi risiko penyaluran Pendanaan melalui analisis kelayakan kredit (credit scoring) untuk memastikan kemampuan membayar calon Penerima Dana."

    def generate_explanation(self, status, risk_prob, tech_reason, legal_context):
        risk_pct = risk_prob * 100
        threshold_pct = self.rejection_threshold * 100

        if status == "REJECT":
            kondisi = "SANGAT BERISIKO (Gagal Bayar)"
            math_logic = f"Angka ini MELEBIHI batas maksimal {threshold_pct:.1f}%."
        elif risk_prob > 0.4:
            kondisi = "BERISIKO MENENGAH / WASPADA"
            math_logic = f"Angka ini LEBIH RENDAH dari {threshold_pct:.1f}%, namun mendekati batas bahaya."
        else:
            kondisi = "AMAN (Kredit Sehat)"
            math_logic = f"Angka ini JAUH LEBIH RENDAH dari batas bahaya {threshold_pct:.1f}%."

            system_prompt = """Anda adalah Auditor Risiko Kredit AI.
    ATURAN MUTLAK:
    1. DILARANG menggunakan judul, header, markdown, atau kata pengantar. Langsung ke kalimat pertama.
    2. Tulis TEPAT DUA PARAGRAF.
    3. Paragraf 1: Analisis data nasabah berdasarkan FAKTA MATEMATIKA di bawah. Jangan membuat kesimpulan matematika sendiri.
    4. Paragraf 2: Hubungkan dengan referensi hukum.
    """

            user_prompt = f"""
    FAKTA MATEMATIKA NASABAH (JANGAN DIUBAH ATAU DIBANTAH):
    - Keputusan: {status}
    - Probabilitas Macet: {risk_pct:.1f}% ({math_logic})
    - Evaluasi Sistem: {kondisi}
    - Faktor Teknis Utama: {tech_reason}

    REFERENSI HUKUM POJK:
    {legal_context}

    Tulis 2 paragraf laporan sekarang:
    """
            try:
                response = ollama.chat(model='llama3.2', messages=[
                    {'role': 'system', 'content': system_prompt},
                    {'role': 'user', 'content': user_prompt}
                ])
                content = response['message']['content'].strip()

                lines = content.split('\n')
                clean_lines = [line for line in lines if
                               line.strip() and not line.isupper() and not line.startswith('#') and not line.startswith(
                                   '-') and ':' not in line[:15]]

                if clean_lines:
                    return "\n\n".join(clean_lines[:2])
                return content
            except Exception as e:
                return f"SYSTEM FAILURE: {str(e)}"

if __name__ == "__main__":
    from backend.src.core.preprocessor import prepare_give_me_some_credit_grandmaster

    current_dir = Path(__file__).resolve().parent
    project_root = current_dir.parent

    orchestrator = CreditRiskOrchestrator()

    file_path = project_root / 'data' / 'raw' / 'Give Me Some Credit' / 'cs-training.csv'

    _, X_test, _, _, feature_names_prep = prepare_give_me_some_credit_grandmaster(str(file_path))

    X_test_df = pd.DataFrame(X_test, columns=feature_names_prep)

    X_test_sample = X_test_df.sample(n=5, random_state=42)

    orchestrator.analyze_batch(X_test_sample, n_customers=5)
