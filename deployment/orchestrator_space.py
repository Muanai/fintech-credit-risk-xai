import os
from groq import Groq
from src.core.orchestrator_local import CreditRiskOrchestrator as BaseOrchestrator
from src.core.orchestrator_local import _strip_hallucinated_dates


class CreditRiskOrchestrator(BaseOrchestrator):
    def _generate_report(self, ctx: dict, legal: str) -> str:
        is_real_pasal = legal != "Penyelenggara wajib menerapkan prinsip kehati-hatian..." and len(legal) > 120

        fact_block = (
            f"Probabilitas gagal bayar nasabah adalah {ctx['math_verdict']}. "
            f"Faktor teknis dominan adalah {ctx['feat_name']}: {ctx['value_meaning']}. "
            f"{ctx['feat_interpretation']} "
            f"Sistem mengklasifikasikan kondisi ini sebagai {ctx['risk_label']} "
            f"dan menetapkan keputusan {ctx['status']}."
        )

        if is_real_pasal:
            legal_block = f"Referensi regulasi yang relevan dari dokumen POJK:\n{legal[:400]}"
        else:
            legal_block = (
                "Referensi regulasi: Penyelenggara wajib menerapkan prinsip kehati-hatian "
                "dan analisis kelayakan kredit sebelum menyalurkan Pendanaan."
            )

        system_prompt = (
            "Anda adalah auditor risiko kredit senior yang menulis laporan formal.\n"
            "FORMAT WAJIB: tepat dua paragraf prosa, tanpa judul, tanpa poin bernomor, "
            "tanpa bullet, tanpa pengulangan kalimat dari konteks.\n"
            "Paragraf 1: elaborasi kondisi nasabah dari FAKTA NASABAH.\n"
            "Paragraf 2: kewajiban regulasi penyelenggara dari REFERENSI REGULASI.\n"
            "LARANGAN KERAS:\n"
            "- Jangan menyebut tanggal, bulan, tahun.\n"
            "- Jangan mengarang nama nasabah, nomor rekening, atau statistik baru."
        )

        user_prompt = f"FAKTA NASABAH:\n{fact_block}\n\nREFERENSI REGULASI:\n{legal_block}\nTulis laporan audit dua paragraf."

        try:
            api_key = os.environ.get("GROQ_API_KEY")
            if not api_key:
                return f"{fact_block}\n\n[SYSTEM ERROR: GROQ_API_KEY tidak ditemukan di environment. Laporan ditangguhkan.]"

            client = Groq(api_key=api_key)

            completion = client.chat.completions.create(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                model="llama-3.1-8b-instant",
                temperature=0.0,
            )

            content = completion.choices[0].message.content.strip()
            content = _strip_hallucinated_dates(content)

            paragraphs = [p.strip() for p in content.split("\n\n") if p.strip()]
            if len(paragraphs) < 1 or len(paragraphs[0]) < 80:
                raise ValueError("LLM Format Glitch")

            return content

        except Exception as e:
            print(f"[Groq API Error]: {e}")
            p2 = (
                "Berdasarkan ketentuan POJK yang berlaku, penyelenggara memiliki kewajiban "
                "untuk menerapkan prinsip kehati-hatian dan mitigasi risiko yang memadai "
                "sebelum menyalurkan Pendanaan kepada calon Penerima Dana."
            )
            return f"{fact_block}\n\n{p2}"