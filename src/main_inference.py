import os
import joblib
import chromadb
from sentence_transformers import SentenceTransformer
import ollama

import warnings

warnings.filterwarnings('ignore')


class CreditRiskOrchestrator:
    def __init__(self):
        print("[1/3] Membangunkan Sistem (Loading Models & DB)...")
        model_path = os.path.join(os.path.dirname(__file__), '../models/xgboost_grandmaster.joblib')
        features_path = os.path.join(os.path.dirname(__file__), '../models/feature_names.joblib')

        if not os.path.exists(model_path):
            raise FileNotFoundError(f"Model tidak ditemukan di {model_path}. Harap save model dari Notebook 04.")

        self.xgb_model = joblib.load(model_path)
        self.feature_names = joblib.load(features_path)

        # 2. Load Vector Database (RAG)
        db_path = os.path.join(os.path.dirname(__file__), '../chroma_db')
        self.chroma_client = chromadb.PersistentClient(path=db_path)
        self.collection = self.chroma_client.get_collection(name="pojk_40_2024")
        self.embedding_model = SentenceTransformer('all-MiniLM-L6-v2')

        self.rejection_threshold = 0.7855  # Threshold dari optimasi sebelumnya

    def retrieve_legal_context(self, search_query):
        """Mencari pasal relevan di Vector DB berdasarkan query teknis."""
        query_vector = self.embedding_model.encode(search_query).tolist()
        results = self.collection.query(
            query_embeddings=[query_vector],
            n_results=1
        )
        return results['documents'][0][0] if results['documents'][0] else "Tidak ditemukan aturan spesifik."

    def generate_explanation(self, status, technical_reason, legal_context):
        """Menggunakan Ollama (Llama-3) Lokal untuk menyintesis penjelasan."""
        print(f"\n[3/3] Meminta Llama-3 lokal menyusun laporan audit...")

        prompt = f"""
        Anda adalah Sistem AI Kepatuhan Risiko Kredit (Credit Underwriting Compliance AI) di Indonesia.

        TUGAS:
        Buat laporan audit singkat (maksimal 2 paragraf) dalam bahasa Indonesia yang formal dan profesional.

        DATA NASABAH:
        - Keputusan Sistem Prediksi: {status}
        - Alasan Teknis (Berdasarkan model SHAP): {technical_reason}

        REFERENSI HUKUM (POJK No. 40 Tahun 2024):
        {legal_context}

        INSTRUKSI PARAGRAF:
        1. Jelaskan mengapa aplikasi ini {status.lower()} secara teknis berdasarkan data nasabah.
        2. Berikan justifikasi hukum yang sangat mengikat bahwa keputusan ini diambil untuk mematuhi kewajiban penyelenggara dalam mitigasi risiko sebagaimana diatur dalam referensi hukum di atas.
        """

        response = ollama.chat(model='llama3.2', messages=[
            {
                'role': 'user',
                'content': prompt
            }
        ])

        return response['message']['content']

    def run_pipeline(self, customer_id, risk_prob, primary_shap_feature, rag_query_hint):
        """Menjalankan seluruh siklus (Mock Pipeline untuk demo)"""
        print(f"\n--- MEMULAI ANALISIS UNTUK NASABAH ID: {customer_id} ---")

        # 1. Klasifikasi (Threshold Logic)
        status = "DITOLAK (REJECT)" if risk_prob >= self.rejection_threshold else "DITERIMA (APPROVE)"
        print(f"[2/3] Probabilitas Macet: {risk_prob:.4f} -> Keputusan: {status}")

        # 2. Retrieval Hukum
        legal_context = self.retrieve_legal_context(rag_query_hint)

        # 3. LLM Synthesis
        explanation = self.generate_explanation(status, primary_shap_feature, legal_context)

        print("\n================ LAPORAN AUDIT KEPATUHAN ================")
        print(explanation)
        print("=========================================================")


if __name__ == "__main__":
    # Inisialisasi Sistem
    orchestrator = CreditRiskOrchestrator()

    # Skenario: Kita menyimulasikan nasabah yang di tolak karena beban utang terlalu besar
    # (Dalam sistem nyata, nilai risk_prob dan SHAP didapat langsung dari fungsi predict)
    orchestrator.run_pipeline(
        customer_id="CUST-99102",
        risk_prob=0.8520,
        primary_shap_feature="DebtRatio (Rasio Beban Utang) sangat tinggi, menyentuh 65% dari pendapatan bulanan.",
        rag_query_hint="analisis kelayakan pendanaan, mitigasi risiko gagal bayar, dan kemampuan membayar"
    )