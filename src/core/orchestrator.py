import math
import re as _re
import pandas as pd
import numpy as np
import shap
import joblib
import chromadb
from sentence_transformers import SentenceTransformer
import ollama
from pathlib import Path


# ─── Constants ────────────────────────────────────────────────────────────────

REJECTION_THRESHOLD = 0.7855
WARN_THRESHOLD = 0.40
_GOVERNANCE_PASAL_RE = _re.compile(r'\bpasal\s+(?:[4-5]\d|6[0-2])\b', _re.IGNORECASE)

CORPORATE_KEYWORDS = [
    "likuidasi", "saham", "koperasi", "direktur", "komisaris",
    "asosiasi", "dewan", "pemegang", "pembubaran", "direksi",
    "pihak utama", "pihak terafiliasi", "pemegang saham",
    "anggota direksi", "dewan komisaris",
]

FALLBACK_LEGAL = (
    "Penyelenggara wajib menerapkan prinsip kehati-hatian dan analisis kelayakan "
    "kredit yang memadai sebelum menyalurkan Pendanaan, termasuk penilaian kemampuan "
    "membayar calon Penerima Dana berdasarkan riwayat keuangan dan profil risiko, "
    "sebagaimana diamanatkan dalam POJK tentang Layanan Pendanaan Bersama Berbasis "
    "Teknologi Informasi."
)

FEATURE_TRANSLATOR = {
    "RevolvingUtilizationOfUnsecuredLines": (
        "rasio utilisasi batas kredit tanpa agunan",
        "Nilai 0–1, di mana 1.0 berarti seluruh batas kredit telah digunakan (beban maksimum). "
        "Nilai tinggi = risiko tinggi."
    ),
    "age": (
        "usia calon peminjam",
        "Usia lebih muda umumnya berkorelasi dengan riwayat kredit yang lebih pendek."
    ),
    "NumberOfTime30-59DaysPastDueNotWorse": (
        "jumlah keterlambatan 30–59 hari",
        "Setiap insiden keterlambatan menambah sinyal risiko gagal bayar."
    ),
    "DebtRatio": (
        "rasio total beban utang terhadap pendapatan bulanan",
        "Nilai 1.0 berarti 100% pendapatan habis untuk utang — kondisi kritis."
    ),
    "MonthlyIncome": (
        "pendapatan bulanan",
        "Kapasitas pembayaran utama; nilai rendah meningkatkan probabilitas gagal bayar."
    ),
    "NumberOfOpenCreditLinesAndLoans": (
        "jumlah fasilitas kredit/pinjaman aktif",
        "Terlalu banyak fasilitas aktif dapat mengindikasikan ketergantungan pada utang."
    ),
    "NumberOfTimes90DaysLate": (
        "jumlah keterlambatan lebih dari 90 hari",
        "Keterlambatan > 90 hari adalah indikator kredit macet yang paling kuat."
    ),
    "NumberRealEstateLoansOrLines": (
        "jumlah pinjaman properti aktif",
        "Menunjukkan eksposur terhadap aset properti — bisa sebagai agunan atau beban."
    ),
    "NumberOfTime60-89DaysPastDueNotWorse": (
        "jumlah keterlambatan 60–89 hari",
        "Keterlambatan menengah — sinyal serius sebelum status macet penuh."
    ),
    "NumberOfDependents": (
        "jumlah tanggungan keluarga",
        "Lebih banyak tanggungan mengurangi kapasitas pembayaran bersih."
    ),
}


# ─── RAG Builder (run once) ──────────────────────────────────────────────────

def build_tagged_vector_db(pdf_path: str, db_path: str):
    """
    Rebuild the ChromaDB collection with:
    - Per-pasal chunking
    - Metadata tags: 'scope' = 'firm' | 'borrower' | 'general'
    - Keyword-based auto-tagging to pre-filter corporate governance pasal
    """
    from PyPDF2 import PdfReader

    reader = PdfReader(pdf_path)
    full_text = "".join(
        page.extract_text() or "" for page in reader.pages
    )

    chunks = [c.strip() for c in _re.split(r'(?=\bPasal\s+\d+\b)', full_text) if len(c.strip()) > 80]

    BORROWER_SIGNALS = ["penerima dana", "peminjam", "kemampuan membayar", "credit scoring",
                        "kelayakan", "wanprestasi", "gagal bayar"]
    FIRM_SIGNALS = ["penyelenggara", "direksi", "komisaris", "saham", "modal",
                    "likuidasi", "izin usaha", "laporan keuangan"]

    def tag_scope(text: str) -> str:
        t = text.lower()
        b = sum(1 for w in BORROWER_SIGNALS if w in t)
        f = sum(1 for w in FIRM_SIGNALS if w in t)
        if b > f:
            return "borrower"
        if f > b:
            return "firm"
        return "general"

    client = chromadb.PersistentClient(path=db_path)
    try:
        client.delete_collection("pojk_credit_v2")
    except Exception:
        pass
    collection = client.create_collection("pojk_credit_v2")

    model = SentenceTransformer("all-MiniLM-L6-v2")
    pasal_re = _re.compile(r'\bPasal\s+(\d+)\b')

    docs, embeddings, metadatas, ids = [], [], [], []
    for i, chunk in enumerate(chunks):
        scope = tag_scope(chunk)
        pasal_match = pasal_re.search(chunk)
        pasal_num = pasal_match.group(1) if pasal_match else "0"

        docs.append(chunk)
        embeddings.append(model.encode(chunk).tolist())
        metadatas.append({"pasal": pasal_num, "scope": scope})
        ids.append(f"chunk_{i}")

    collection.add(documents=docs, embeddings=embeddings, metadatas=metadatas, ids=ids)
    print(f"Built pojk_credit_v2 with {collection.count()} chunks.")
    return collection


# ─── Orchestrator ────────────────────────────────────────────────────────────

class CreditRiskOrchestrator:

    def __init__(self, project_root: Path):
        self.xgb_model = joblib.load(project_root / "models" / "xgboost_grandmaster.joblib")
        self.feature_names = joblib.load(project_root / "models" / "feature_names.joblib")
        self.explainer = shap.TreeExplainer(self.xgb_model)

        client = chromadb.PersistentClient(path=str(project_root / "chroma_db"))
        self.collection = client.get_collection("pojk_credit_v2")
        self.embed_model = SentenceTransformer("all-MiniLM-L6-v2")

    # ── Public API ─────────────────────────────────────────────────────────

    def analyze_batch(self, X_df: pd.DataFrame, n: int = 5) -> list[dict]:
        probs = self.xgb_model.predict_proba(X_df)[:, 1]
        shap_vals = self.explainer(X_df)
        results = []

        for i in range(min(n, len(X_df))):
            prob = float(probs[i])
            shap_i = shap_vals[i]
            top_idx = int(np.abs(shap_i.values).argmax())
            raw_feature = self.feature_names[top_idx]
            raw_value = float(X_df.iloc[i, top_idx])

            status = "TOLAK" if prob >= REJECTION_THRESHOLD else "LULUS"

            context = self._build_reasoning_context(raw_feature, raw_value, prob, status)
            legal = self._retrieve_legal(raw_feature)
            report = self._generate_report(context, legal)

            print(f"\nNasabah {i} | Prob={prob:.4f} | Status={status} | Fitur={raw_feature}")
            print(f"LAPORAN:\n{report}\n{'─'*60}")

            results.append({"idx": i, "status": status, "prob": prob, "report": report})

        return results

    # ── Reasoning context builder (pure Python logic) ──────────────────────

    def _build_reasoning_context(
        self, raw_feature: str, raw_value: float, prob: float, status: str
    ) -> dict:
        """
        All math and domain logic lives HERE, not in the LLM.
        Returns a dict of pre-resolved strings ready for template injection.
        """
        feat_name, feat_interpretation = FEATURE_TRANSLATOR.get(
            raw_feature, (raw_feature, "Fitur teknis dari model ML.")
        )

        prob_pct = prob * 100
        threshold_pct = REJECTION_THRESHOLD * 100

        # ── Math resolved to strings (LLM never sees raw floats to compare) ──
        if status == "TOLAK":
            math_verdict = (
                f"probabilitas gagal bayar {prob_pct:.1f}% MELEBIHI batas maksimal "
                f"yang dapat diterima ({threshold_pct:.1f}%)"
            )
            risk_label = "SANGAT BERISIKO TINGGI"
        elif prob > WARN_THRESHOLD:
            risk_label = "WASPADA — RISIKO MENENGAH"
            math_verdict = (
                f"probabilitas gagal bayar {prob_pct:.1f}% masih berada di bawah ambang "
                f"penolakan sistem ({threshold_pct:.1f}%), sehingga secara teknis memenuhi "
                f"syarat untuk diluluskan. Namun demikian, kondisi ini mendekati zona bahaya "
                f"dan memerlukan pemantauan ketat pasca-pencairan"
            )
        else:
            math_verdict = (
                f"probabilitas gagal bayar {prob_pct:.1f}% jauh di bawah batas "
                f"aman ({threshold_pct:.1f}%)"
            )
            risk_label = "AMAN — KREDIT SEHAT"

        if math.isnan(raw_value):
            value_meaning = "nilai tidak tersedia (data tidak lengkap)"
            return {
                "status": status,
                "risk_label": risk_label,
                "math_verdict": math_verdict,
                "feat_name": feat_name,
                "feat_interpretation": feat_interpretation,
                "value_meaning": value_meaning,
            }

        # ── Feature value interpretation (LLM never needs to infer this) ──
        value_str = f"{raw_value:.2f}"

        if raw_feature == "RevolvingUtilizationOfUnsecuredLines":
            if raw_value >= 0.9:
                value_meaning = f"utilisasi {value_str} — batas kredit hampir/sudah penuh (kondisi kritis)"
            elif raw_value >= 0.5:
                value_meaning = f"utilisasi {value_str} — separuh lebih batas kredit terpakai (elevated)"
            else:
                value_meaning = f"utilisasi {value_str} — penggunaan kredit masih terkendali"

        elif raw_feature == "DebtRatio":
            if raw_value >= 1.0:
                value_meaning = f"rasio utang {value_str} — seluruh pendapatan habis untuk cicilan (kritis)"
            elif raw_value >= 0.5:
                value_meaning = f"rasio utang {value_str} — lebih dari separuh pendapatan untuk utang"
            else:
                value_meaning = f"rasio utang {value_str} — beban utang masih proporsional"

        elif raw_feature in ("NumberOfTimes90DaysLate",
                             "NumberOfTime60-89DaysPastDueNotWorse",
                             "NumberOfTime30-59DaysPastDueNotWorse"):
            count = int(raw_value)
            if count == 0:
                value_meaning = f"{count} insiden keterlambatan — riwayat pembayaran bersih"
            elif count == 1:
                value_meaning = f"{count} insiden keterlambatan — sinyal peringatan"
            else:
                value_meaning = f"{count} insiden keterlambatan — pola keterlambatan berulang (sangat berisiko)"

        else:
            value_meaning = f"nilai terukur {value_str}"

        return {
            "status": status,
            "risk_label": risk_label,
            "math_verdict": math_verdict,
            "feat_name": feat_name,
            "feat_interpretation": feat_interpretation,
            "value_meaning": value_meaning,
        }

    # ── RAG retrieval with scope filter ───────────────────────────────────

    def _retrieve_legal(self, raw_feature: str) -> str:
        feat_name, _ = FEATURE_TRANSLATOR.get(raw_feature, (raw_feature, ""))
        query = (
            f"kewajiban penyelenggara dalam menilai kemampuan membayar dan "
            f"mitigasi risiko kredit terkait {feat_name}"
        )
        query_vec = self.embed_model.encode(query).tolist()

        for scope_filter in ({"scope": "borrower"}, {"scope": "general"}, None):
            kwargs = dict(query_embeddings=[query_vec], n_results=3)
            if scope_filter:
                kwargs["where"] = scope_filter
            try:
                results = self.collection.query(**kwargs)
                for doc in results["documents"][0]:
                    doc_lower = doc.lower()
                    if any(kw in doc_lower for kw in CORPORATE_KEYWORDS):
                        continue
                    if _GOVERNANCE_PASAL_RE.search(doc_lower):
                        continue
                    return doc
            except Exception:
                continue

        return FALLBACK_LEGAL

    # ── Prompt: fill-in-the-blank template ────────────────────────────────

    def _generate_report(self, ctx: dict, legal: str) -> str:
        is_real_pasal = legal != FALLBACK_LEGAL and len(legal) > 120

        fact_block = (
            f"Probabilitas gagal bayar nasabah adalah {ctx['math_verdict']}. "
            f"Faktor teknis dominan adalah {ctx['feat_name']}: {ctx['value_meaning']}. "
            f"{ctx['feat_interpretation']} "
            f"Sistem mengklasifikasikan kondisi ini sebagai {ctx['risk_label']} "
            f"dan menetapkan keputusan {ctx['status']}."
        )

        if is_real_pasal:
            legal_block = (
                f"Referensi regulasi yang relevan dari dokumen POJK:\n{legal[:400]}"
            )
        else:
            legal_block = (
                "Referensi regulasi: Penyelenggara wajib menerapkan prinsip kehati-hatian "
                "dan analisis kelayakan kredit sebelum menyalurkan Pendanaan."
            )

        system = (
            "Anda adalah auditor risiko kredit senior yang menulis laporan formal.\n"
            "FORMAT WAJIB: dua paragraf prosa, tanpa judul, tanpa poin bernomor, "
            "tanpa bullet, tanpa pengulangan kalimat dari konteks.\n"
            "Paragraf 1: elaborasi kondisi nasabah dari FAKTA NASABAH.\n"
            "Paragraf 2: kewajiban regulasi penyelenggara dari REFERENSI REGULASI.\n"
            "Jika REFERENSI REGULASI tidak menyebut nomor Pasal atau tahun, "
            "Anda juga tidak boleh menyebutnya."
        )

        user = (
            f"FAKTA NASABAH:\n{fact_block}\n\n"
            f"REFERENSI REGULASI:\n{legal_block}\n\n"
            "Tulis laporan audit dua paragraf berdasarkan fakta dan referensi di atas."
        )

        try:
            resp = ollama.chat(
                model="llama3.2",
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            )
            content = resp["message"]["content"].strip()

            paragraphs = [p.strip() for p in content.split("\n\n") if p.strip()]
            first_para = paragraphs[0] if paragraphs else ""

            _META_SIGNALS = ["[", "(1)", "(2)", "lanjutkan", "paragraf 1", "fakta nasabah"]
            is_glitch = (
                    len(first_para) < 80
                    or any(sig in first_para.lower() for sig in _META_SIGNALS)
            )

            if is_glitch:
                p1 = fact_block
                p2 = paragraphs[1] if len(paragraphs) > 1 else (
                    "Berdasarkan ketentuan POJK yang berlaku, penyelenggara memiliki kewajiban "
                    "untuk menerapkan prinsip kehati-hatian dan mitigasi risiko yang memadai "
                    "sebelum menyalurkan Pendanaan kepada calon Penerima Dana."
                )
                return f"{p1}\n\n{p2}"

            return content

        except Exception as e:
            return f"[SYSTEM ERROR: {e}]"


# ─── Entry point ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse
    from preprocessor import prepare_give_me_some_credit_grandmaster

    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--rebuild-db",
        action="store_true",
        help="Hancurkan dan bangun ulang ChromaDB dari PDF. Jalankan SEKALI saja.",
    )
    args = parser.parse_args()

    root = Path(__file__).resolve().parent.parent.parent

    if args.rebuild_db:
        build_tagged_vector_db(
            pdf_path=str(root / "docs/POJK/POJK 40 Tahun 2024 Layanan Pendanaan Bersama Berbasis Teknologi Informasi.pdf"),
            db_path=str(root / "chroma_db"),
        )
        print("Database selesai dibangun. Jalankan ulang tanpa --rebuild-db untuk inferensi.")
        raise SystemExit(0)

    orchestrator = CreditRiskOrchestrator(root)
    _, X_test, _, _, feat_names = prepare_give_me_some_credit_grandmaster(
        str(root / "data/raw/Give Me Some Credit/cs-training.csv")
    )
    X_df = pd.DataFrame(X_test, columns=feat_names).sample(n=5, random_state=42)
    orchestrator.analyze_batch(X_df, n=5)