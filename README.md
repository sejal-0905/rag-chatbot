# DocuMind — Intelligent Document-Grounded RAG Chatbot

A full-stack RAG (Retrieval-Augmented Generation) chatbot that answers questions from uploaded documents, with conditional web search fallback and a built-in study companion.

Built during an AI/ML internship at Synergech Technologies.

---

## Features

- **Two-stage retrieval** — vector search via ChromaDB followed by cross-encoder reranking for relevance-ranked results
- **Conditional web search** — Tavily only triggers when document relevance scores fall below threshold, not on every query
- **Multi-layer guardrails** — regex fast filter + LLM safety classifier (`gpt-oss-safeguard-20b`) blocking crisis content, hate speech, violence, illegal requests, and off-topic chat; output-level classification after generation
- **Study companion** — generates notes, flashcards, and quizzes from retrieved document chunks
- **Source confidence bars** — score-shifted reranker values visualised per source with web search attribution
- **Retrieval debug panel** — live view of retrieved chunks, reranker scores, and search query used
- **Streaming responses** — token-by-token SSE streaming with phased loading indicator
- **Multi-chat** — persistent chat history via localStorage with rename and delete
- **Drag and drop upload** — PDF, DOCX, TXT, MD supported with live progress streaming
- **Query rewriting** — generates 2 alternative phrasings per query for better recall
- **Pronoun resolution** — detects follow-up references ("it", "this", "they") and prepends conversation context

---

## Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI, Python |
| Vector DB | ChromaDB (cosine similarity) |
| Embeddings | BAAI/bge-base-en-v1.5 (SentenceTransformers) |
| Reranker | cross-encoder/ms-marco-MiniLM-L-6-v2 |
| LLM | Groq — Llama 3.3 70B (generation), Llama 3.1 8B (query rewriting) |
| Safety classifier | gpt-oss-safeguard-20b via Groq |
| Web search | Tavily API |
| Frontend | Vanilla HTML, CSS, JavaScript |

---

## Setup

**1. Clone the repo**
```bash
git clone https://github.com/YOUR_USERNAME/rag-chatbot.git
cd rag-chatbot
```

**2. Create and activate a virtual environment**
```bash
python -m venv venv
venv\Scripts\activate        # Windows
source venv/bin/activate     # Mac/Linux
```

**3. Install dependencies**
```bash
pip install -r requirements.txt
```

**4. Create a `.env` file**
```
GROQ_API_KEY=your_groq_api_key
TAVILY_API_KEY=your_tavily_api_key
```

**5. Run the server**
```bash
uvicorn main:app --reload
```

**6. Open in browser**
```
http://localhost:8000
```

---

## How It Works

### Upload
PDF/DOCX/TXT/MD → text extraction → semantic chunking (600 chars, 1-sentence overlap) → batch embedding → ChromaDB storage

### Query Pipeline
1. Pronoun resolution — checks if follow-up context is needed
2. Query rewriting — 3 variants generated (original + 2 rephrases) via Llama 3.1 8B
3. Vector search — top 10 candidates per variant from ChromaDB, deduplicated
4. Cross-encoder reranking — top 15 candidates scored, top 5 returned
5. Web fallback — Tavily fires only if best reranker score ≤ 0
6. LLM generation — Llama 3.3 70B streams answer from combined context

### Guardrail Pipeline
```
User query
  → Regex filter (explicit crisis phrases — instant, no API call)
  → LLM classifier (gpt-oss-safeguard-20b — catches indirect phrasing)
  → If unsafe: fixed policy response returned, pipeline stops
  → If safe: retrieval + generation proceeds
  → Output classifier (generated answer checked post-generation)
  → Final response streamed to user
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | Serves the frontend |
| GET | `/documents` | List uploaded documents |
| GET | `/documents/chunks` | Chunk count per document |
| DELETE | `/documents/{filename}` | Delete a document |
| POST | `/upload` | Upload a file (streaming progress) |
| POST | `/ask` | Ask a question (SSE streaming) |
| POST | `/study` | Generate notes, flashcards, or quiz |

---

## Environment Variables

| Variable | Description |
|---|---|
| `GROQ_API_KEY` | Groq API key |
| `TAVILY_API_KEY` | Tavily web search API key |
