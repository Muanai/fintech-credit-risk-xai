import streamlit as st
import pandas as pd
import numpy as np
import plotly.graph_objects as go
from pathlib import Path
import sys
import os
from dotenv import load_dotenv

# ─── 1. PAGE CONFIG HARUS PALING ATAS ───────────────────────────────────────
# Agar UI langsung me-render sesuatu sebelum import berat berjalan
st.set_page_config(
    page_title="AI Credit Risk Auditor (XAI + RAG)",
    page_icon="🏦",
    layout="wide"
)

# ─── 2. PATH HANDLING ───────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

load_dotenv(BASE_DIR / ".env")


# ─── 3. LAZY LOADING UNTUK MESIN BERAT ──────────────────────────────────────
@st.cache_resource
def init_orchestrator():
    """Import dan Load Engine HANYA dipanggil saat dibutuhkan, di-cache selamanya"""
    from src.core.orchestrator import CreditRiskOrchestrator
    return CreditRiskOrchestrator(BASE_DIR)


@st.cache_data
def get_test_data():
    """Import data loader dan baca CSV, di-cache selamanya"""
    from src.core.preprocessor import prepare_give_me_some_credit_grandmaster
    _, X_test, _, _, feat_names = prepare_give_me_some_credit_grandmaster(
        str(BASE_DIR / "data/raw/Give Me Some Credit/cs-training.csv")
    )
    return X_test, feat_names


# Custom CSS
st.markdown("""
    <style>
    .main { background-color: #f1f5f9; }

    /* Box Laporan Audit */
    .report-box { 
        background-color: #ffffff !important; 
        color: #0f172a !important; /* Warna teks biru-hitam gelap (Slate 900) */
        padding: 30px; 
        border-radius: 15px; 
        border-left: 8px solid #005088; 
        box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);
        line-height: 1.6;
        font-size: 1.1rem;
    }

    /* Memastikan teks paragraf di dalam box juga mengikuti warna gelap */
    .report-box p, .report-box div, .report-box span {
        color: #0f172a !important;
    }

    /* Styling tambahan untuk visual metrik */
    .stMetric { 
        background-color: #ffffff; 
        padding: 20px; 
        border-radius: 10px; 
        border: 1px solid #e2e8f0; 
    }

    h1 { color: #005088; font-weight: 800; }
    h2, h3 { color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; }
    </style>
    """, unsafe_allow_html=True)


def create_gauge(prob, status):
    color = "red" if status == "TOLAK" else "orange" if prob > 0.4 else "green"
    fig = go.Figure(go.Indicator(
        mode="gauge+number",
        value=prob * 100,
        domain={'x': [0, 1], 'y': [0, 1]},
        title={'text': "Probabilitas Gagal Bayar (%)", 'font': {'size': 20}},
        gauge={
            'axis': {'range': [None, 100], 'tickwidth': 1, 'tickcolor': "darkblue"},
            'bar': {'color': color},
            'bgcolor': "white",
            'borderwidth': 2,
            'bordercolor': "gray",
            'steps': [
                {'range': [0, 40], 'color': '#dcfce7'},
                {'range': [40, 78.55], 'color': '#fef9c3'},
                {'range': [78.55, 100], 'color': '#fee2e2'}],
            'threshold': {
                'line': {'color': "black", 'width': 4},
                'thickness': 0.75,
                'value': 78.55}}))
    fig.update_layout(height=350, margin=dict(l=20, r=20, t=50, b=20))
    return fig


def main():
    # Sidebar
    with st.sidebar:
        st.image("https://cdn-icons-png.flaticon.com/512/2830/2830284.png", width=100)
        st.title("Control Panel")
        st.info("Sistem ini berjalan 100% lokal (Privacy-Preserved)")

        token_status = "✅ HF_TOKEN Loaded" if os.getenv("HF_TOKEN") else "⚠️ HF_TOKEN Missing"
        st.caption(token_status)

        st.divider()
        n_audit = st.number_input("Jumlah Nasabah untuk Audit", 1, 20, 3)
        run_btn = st.button("🚀 Jalankan Audit Batch", use_container_width=True)

    # Header Tampil Langsung!
    st.title("🏦 AI Credit Risk & Legal Auditor")
    st.markdown("### Integrasi *Explainable AI* (SHAP) dan *Regulasi POJK* (RAG)")

    # Menampilkan Loading Spinner saat proses berat terjadi
    with st.spinner("🔧 Menginisialisasi Mesin AI (XGBoost & ChromaDB)... (Hanya pada saat awal)"):
        orchestrator = init_orchestrator()
        X_test, feat_names = get_test_data()

    if run_btn:
        X_df = pd.DataFrame(X_test, columns=feat_names).sample(n=n_audit, random_state=np.random.randint(1, 1000))

        with st.spinner("🧠 Menganalisis risiko & meninjau pasal hukum..."):
            results = orchestrator.analyze_batch(X_df, n=n_audit)

        st.toast("Audit selesai untuk semua nasabah!")

        for i, res in enumerate(results):
            st.divider()
            st.subheader(f"Nasabah #{res['idx']} - Keputusan: {res['status']}")

            col_left, col_right = st.columns([1, 1.5])

            with col_left:
                st.plotly_chart(create_gauge(res['prob'], res['status']), use_container_width=True)

                st.markdown("#### 🔍 Pemicu Utama (SHAP)")
                st.warning(
                    f"**Fitur Terdeteksi:** {res['report'].split('(')[0].split('berupa')[-1].strip() if 'berupa' in res['report'] else 'Analisis Teknis'}")
                st.caption(
                    "Fitur ini memberikan kontribusi terbesar terhadap skor risiko nasabah berdasarkan model XGBoost.")

            with col_right:
                st.markdown("#### 📄 Laporan Audit Hukum Otomatis")
                formatted_report = res['report'].replace("\n\n", "<br><br>")
                st.markdown(f"""
                <div class="report-box">
                    {formatted_report}
                </div>
                """, unsafe_allow_html=True)

                st.caption("Laporan ini dihasilkan oleh Llama-3 dengan referensi langsung dari dokumen POJK 40/2024.")

    else:
        st.info("👈 Pilih jumlah nasabah di sidebar dan klik 'Jalankan Audit' untuk memulai proses evaluasi.")

        col_a, col_b, col_c = st.columns(3)
        col_a.metric("Model Engine", "XGBoost v1.2")
        col_b.metric("XAI Engine", "SHAP TreeExplainer")
        col_c.metric("RAG Engine", "ChromaDB + Llama-3.2")


if __name__ == "__main__":
    main()