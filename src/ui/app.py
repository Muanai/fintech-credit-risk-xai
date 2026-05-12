import streamlit as st
import pandas as pd
import numpy as np
import plotly.graph_objects as go
from pathlib import Path
import sys
import os
from dotenv import load_dotenv

st.set_page_config(
    page_title="AI Credit Risk Auditor (XAI + RAG)",
    page_icon="🏦",
    layout="wide"
)

BASE_DIR = Path(__file__).resolve().parent.parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))
load_dotenv(BASE_DIR / ".env")


@st.cache_resource(show_spinner=False)
def init_orchestrator():
    from src.core.orchestrator import CreditRiskOrchestrator
    return CreditRiskOrchestrator(BASE_DIR)


@st.cache_data(show_spinner=False)
def get_test_data():
    from src.core.preprocessor import prepare_give_me_some_credit_grandmaster
    _, X_test, _, _, feat_names = prepare_give_me_some_credit_grandmaster(
        str(BASE_DIR / "data/raw/Give Me Some Credit/cs-training.csv")
    )
    return X_test, feat_names


def create_gauge(prob: float, status: str) -> go.Figure:
    color = "#ef4444" if status == "TOLAK" else "#f59e0b" if prob > 0.4 else "#22c55e"
    fig = go.Figure(go.Indicator(
        mode="gauge+number",
        value=prob * 100,
        number={"suffix": "%", "font": {"size": 36}},
        title={"text": "Probabilitas Gagal Bayar", "font": {"size": 14}},
        gauge={
            "axis": {"range": [0, 100], "tickwidth": 1},
            "bar": {"color": color, "thickness": 0.3},
            "bgcolor": "white",
            "steps": [
                {"range": [0, 40],     "color": "#dcfce7"},
                {"range": [40, 78.55], "color": "#fef9c3"},
                {"range": [78.55, 100],"color": "#fee2e2"},
            ],
            "threshold": {
                "line": {"color": "#1e293b", "width": 3},
                "thickness": 0.75,
                "value": 78.55,
            },
        },
    ))
    fig.update_layout(height=280, margin=dict(l=20, r=20, t=40, b=10))
    return fig


def create_shap_bar(shap_vals: dict) -> go.Figure:
    """
    shap_vals: dict {feat_name: shap_value} — top N fitur dari orchestrator.
    Positif = mendorong ke TOLAK, negatif = mendorong ke LULUS.
    """
    items = sorted(shap_vals.items(), key=lambda x: abs(x[1]))
    feats = [k for k, _ in items]
    vals = [v for _, v in items]
    colors = ["#ef4444" if v > 0 else "#22c55e" for v in vals]

    fig = go.Figure(go.Bar(
        x=vals,
        y=feats,
        orientation="h",
        marker_color=colors,
        text=[f"{v:+.4f}" for v in vals],
        textposition="outside",
        textfont=dict(color="#0f172a", size=13)  # Kunci warna teks angka SHAP
    ))

    fig.update_layout(
        title={"text": "Kontribusi Fitur (SHAP)", "font": {"color": "#005088", "size": 16}},
        height=280,
        margin=dict(l=10, r=60, t=40, b=10),
        xaxis_title="SHAP Value",
        yaxis={"autorange": "reversed"},
        plot_bgcolor="white",
        paper_bgcolor="white",
        font=dict(color="#0f172a", family="Inter, sans-serif")
    )

    fig.update_xaxes(
        title_text="SHAP Value",
        title_font=dict(color="#0f172a"),
        tickfont=dict(color="#0f172a"),
        zeroline=True,
        zerolinecolor="#94a3b8",
        zerolinewidth=1.5
    )

    fig.update_yaxes(
        autorange="reversed",
        tickfont=dict(color="#0f172a")
    )

    return fig


st.markdown("""
<style>
.main { background-color: #f1f5f9; }
.report-box {
    background-color: #ffffff;
    color: #0f172a;
    padding: 28px 32px;
    border-radius: 12px;
    border-left: 6px solid #005088;
    box-shadow: 0 4px 12px rgba(0,0,0,0.08);
    line-height: 1.75;
    font-size: 1rem;
}
.report-box p { color: #0f172a; margin-bottom: 1em; }
.status-lulus {
    background: #dcfce7; color: #166534;
    padding: 4px 14px; border-radius: 20px;
    font-weight: 700; font-size: 1rem;
}
.status-tolak {
    background: #fee2e2; color: #991b1b;
    padding: 4px 14px; border-radius: 20px;
    font-weight: 700; font-size: 1rem;
}
.status-waspada {
    background: #fef9c3; color: #854d0e;
    padding: 4px 14px; border-radius: 20px;
    font-weight: 700; font-size: 1rem;
}
h1 { color: #005088; }
</style>
""", unsafe_allow_html=True)


def status_badge(status: str, prob: float) -> str:
    if status == "TOLAK":
        return '<span class="status-tolak">TOLAK</span>'
    if prob > 0.4:
        return '<span class="status-waspada">LULUS — WASPADA</span>'
    return '<span class="status-lulus">LULUS</span>'


def main():
    with st.sidebar:
        st.image("https://cdn-icons-png.flaticon.com/512/2830/2830284.png", width=80)
        st.title("Control Panel")
        st.info("Berjalan 100% lokal — data tidak dikirim ke server eksternal.")

        hf_ok = bool(os.getenv("HF_TOKEN"))
        st.caption("HF_TOKEN loaded" if hf_ok else "HF_TOKEN tidak ditemukan")
        st.divider()

        n_audit = st.number_input("Jumlah Nasabah", min_value=1, max_value=20, value=3)

        if "audit_seed" not in st.session_state:
            st.session_state.audit_seed = 42

        run_btn = st.button("Jalankan Audit Batch", use_container_width=True)
        if run_btn:
            st.session_state.audit_seed = np.random.randint(1, 9999)
            st.session_state.results = None

    st.title("🏦 AI Credit Risk & Legal Auditor")
    st.markdown("Integrasi **Explainable AI** (SHAP) dan **Regulasi POJK 40/2024** (RAG)")

    if "engine_ready" not in st.session_state:
        with st.spinner("Memuat mesin AI pertama kali..."):
            orchestrator = init_orchestrator()
            X_test, feat_names = get_test_data()
        st.session_state.engine_ready = True
    else:
        orchestrator = init_orchestrator()
        X_test, feat_names = get_test_data()

    if run_btn:
        X_df = pd.DataFrame(X_test, columns=feat_names).sample(
            n=n_audit, random_state=st.session_state.audit_seed
        )
        with st.spinner(f"Mengaudit {n_audit} nasabah..."):
            st.session_state.results = orchestrator.analyze_batch(X_df, n=n_audit)
        st.toast("Audit selesai!")

    if st.session_state.get("results"):
        for res in st.session_state.results:
            st.divider()

            badge = status_badge(res["status"], res["prob"])
            st.markdown(
                f"### Nasabah #{res['idx']} &nbsp; {badge}",
                unsafe_allow_html=True,
            )

            col_left, col_right = st.columns([1, 1.5], gap="large")

            with col_left:
                st.plotly_chart(
                    create_gauge(res["prob"], res["status"]),
                    use_container_width=True,
                )

                if "shap_top" in res:
                    st.plotly_chart(
                        create_shap_bar(res["shap_top"]),
                        use_container_width=True,
                    )

                if "feat_name" in res:
                    st.metric(
                        label="Faktor Risiko Utama",
                        value=res["feat_name"],
                        delta=res.get("value_meaning", ""),
                        delta_color="inverse",
                    )

            with col_right:
                st.markdown("#### 📄 Laporan Audit Hukum Otomatis")
                formatted = res["report"].replace("\n\n", "<br><br>")
                st.markdown(
                    f'<div class="report-box">{formatted}</div>',
                    unsafe_allow_html=True,
                )
                st.caption(
                    "Laporan dihasilkan oleh Llama 3.2 dengan referensi "
                    "langsung dari POJK 40/2024 via ChromaDB."
                )

    else:
        st.info("Pilih jumlah nasabah di sidebar dan klik **Jalankan Audit** untuk memulai.")
        col_a, col_b, col_c = st.columns(3)
        col_a.metric("Model Engine", "XGBoost")
        col_b.metric("XAI Engine", "SHAP TreeExplainer")
        col_c.metric("RAG Engine", "ChromaDB + Llama 3.2")


if __name__ == "__main__":
    main()