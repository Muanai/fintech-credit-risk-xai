import re
import chromadb
from sentence_transformers import SentenceTransformer
from PyPDF2 import PdfReader
from pathlib import Path


def build_smart_vector_db():
    pdf_path = Path(
        '../../docs/POJK/POJK 40 Tahun 2024 Layanan Pendanaan Bersama Berbasis Teknologi Informasi.pdf').resolve()

    reader = PdfReader(str(pdf_path))
    full_text = ""
    for page in reader.pages:
        extracted = page.extract_text()
        if extracted:
            full_text += extracted + "\n"

    pasal_chunks = re.split(r'(?=\bPasal\s+\d+\b)', full_text)

    cleaned_chunks = [chunk.strip() for chunk in pasal_chunks if len(chunk.strip()) > 50]

    chroma_client = chromadb.PersistentClient(path="../../chroma_db")
    collection_name = "pojk_40_2024_smart"

    try:
        chroma_client.delete_collection(name=collection_name)
    except Exception:
        pass

    collection = chroma_client.create_collection(name=collection_name)
    embedding_model = SentenceTransformer('all-MiniLM-L6-v2')

    documents = []
    embeddings = []
    metadatas = []
    ids = []

    for i, chunk in enumerate(cleaned_chunks):
        documents.append(chunk)
        embeddings.append(embedding_model.encode(chunk).tolist())

        pasal_match = re.search(r'\bPasal\s+(\d+)\b', chunk)
        pasal_num = pasal_match.group(1) if pasal_match else "Unknown"

        metadatas.append({"source": "POJK_40_2024", "pasal": pasal_num})
        ids.append(f"pasal_{i}")

    collection.add(
        documents=documents,
        embeddings=embeddings,
        metadatas=metadatas,
        ids=ids
    )

    print(f"Database baru selesai dibangun dengan {collection.count()} Pasal independen.")


if __name__ == "__main__":
    build_smart_vector_db()