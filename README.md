# 🧠 DocuMind — Intelligent Document-Grounded RAG Chatbot

An intelligent, full-stack Retrieval-Augmented Generation (RAG) chatbot that answers questions using uploaded documents, with conditional web search fallback and an integrated AI-powered study companion.

Built during an **AI/ML Internship at Synergech Technologies**.

---

## ✨ Features

- **📚 Two-Stage Retrieval:** Combines semantic vector search using ChromaDB with cross-encoder reranking to retrieve the most relevant document passages.
- **🌐 Conditional Web Search:** Integrates Tavily search as a fallback when document relevance scores do not meet the defined threshold.
- **🛡️ Multi-Layer AI Guardrails:** Uses regex-based filtering and an LLM safety classifier (`openai/gpt-oss-safeguard-20b`) to detect crisis-related content, hate speech, violence, illegal requests, and off-topic queries, with additional output-level safety checks.
- **🎓 AI Study Companion:** Generates study notes, flashcards, and multiple-choice quizzes from retrieved document content using GPT-OSS-120B.
- **📊 Source Confidence Visualization:** Displays score-based relevance indicators for retrieved sources, with web search attribution.
- **🔍 Retrieval Debug Panel:** Provides visibility into retrieved document chunks, reranker scores, and search queries.
- **⚡ Streaming Responses:** Delivers token-by-token responses using Server-Sent Events (SSE).
- **💬 Multi-Chat Support:** Maintains persistent conversation history using browser localStorage, with options to rename and delete chats.
- **📂 Drag-and-Drop Document Upload:** Supports PDF, DOCX, TXT, and Markdown files with live processing progress.
- **🔄 Query Rewriting:** Generates two alternative query formulations to improve retrieval coverage and relevance.
- **🧩 Context-Aware Follow-ups:** Resolves pronoun references such as "it", "this", and "they" using previous conversation context.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python, FastAPI |
| Vector Database | ChromaDB (Cosine Similarity) |
| Embeddings | BAAI/bge-base-en-v1.5 (SentenceTransformers) |
| Reranking | cross-encoder/ms-marco-MiniLM-L-6-v2 |
| LLM – Response Generation | OpenAI GPT-OSS-120B via Groq |
| LLM – Query Rewriting | Llama 3.1 8B Instant via Groq |
| Safety Classification | OpenAI GPT-OSS-Safeguard-20B via Groq |
| Web Search | Tavily API |
| Frontend | HTML, CSS, Vanilla JavaScript |
| Document Processing | PyPDF, pdfplumber, python-docx, NLTK |
| Communication | Server-Sent Events (SSE) |

---

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/rag-chatbot.git
cd rag-chatbot
```

### 2. Create and Activate a Virtual Environment

```bash
python -m venv venv
```

**Windows:**
```bash
venv\Scripts\activate
```

**Mac/Linux:**
```bash
source venv/bin/activate
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure Environment Variables

Create a `.env` file in the project root:

```env
GROQ_API_KEY=your_groq_api_key
TAVILY_API_KEY=your_tavily_api_key
```

Get your API keys:

- [Groq Console](https://console.groq.com/)
- [Tavily](https://tavily.com/)

### 5. Run the Application

```bash
uvicorn main:app --reload
```

### 6. Open in Browser

```text
http://localhost:8000
```

---

## 🔄 How It Works

### 📂 Document Upload Pipeline

Uploaded documents pass through the following stages:

1. **Text Extraction:** Extracts text from PDF, DOCX, TXT, and Markdown files.
2. **Semantic Chunking:** Splits extracted text into 600-character chunks with one-sentence overlap.
3. **Embedding Generation:** Generates normalized dense vector embeddings using BAAI/bge-base-en-v1.5.
4. **Vector Storage:** Stores embeddings, document chunks, and source metadata in ChromaDB.

### 💬 Query Processing Pipeline

1. **Pronoun Resolution:** Identifies contextual references in follow-up questions using recent conversation history.
2. **Query Rewriting:** Uses Llama 3.1 8B Instant to generate two alternative search queries.
3. **Vector Search:** Retrieves up to 10 candidates per query variant from ChromaDB and removes duplicate chunks.
4. **Cross-Encoder Reranking:** Ranks up to 15 candidates using a cross-encoder and selects the top 5.
5. **Conditional Web Search:** Uses Tavily when document relevance is insufficient.
6. **LLM Generation:** Uses GPT-OSS-120B to generate context-grounded answers with token-by-token streaming.

### 🛡️ Multi-Layer Guardrail Pipeline

```text
                    User Query
                        |
                        v
                Regex-Based Filter
                        |
                        v
                LLM Safety Classifier
             (GPT-OSS-Safeguard-20B)
                        |
              +---------+---------+
              |                   |
            Unsafe               Safe
              |                   |
              v                   v
        Policy Response     Retrieval Pipeline
                                  |
                                  v
                           LLM Generation
                           (GPT-OSS-120B)
                                  |
                                  v
                         Output Classification
                                  |
                                  v
                           Final Response
```

The system performs both input-level and output-level safety checks to add multiple layers of protection.

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Serves the frontend |
| `GET` | `/health` | Checks backend health |
| `GET` | `/documents` | Lists uploaded documents |
| `GET` | `/documents/chunks` | Returns chunk counts per document |
| `DELETE` | `/documents/{filename}` | Deletes a document |
| `POST` | `/upload` | Uploads and processes documents with streaming progress |
| `POST` | `/ask` | Processes questions with SSE response streaming |
| `POST` | `/study` | Generates notes, flashcards, and quizzes |

---

## 🔑 Environment Variables

| Variable | Description |
|---|---|
| `GROQ_API_KEY` | API key for Groq-powered LLM inference |
| `TAVILY_API_KEY` | API key for conditional web search |

---

## 🎯 Key Highlights

- Implements an end-to-end RAG architecture combining semantic retrieval and neural reranking.
- Improves retrieval coverage through multi-query search and contextual query resolution.
- Minimizes unnecessary external searches through relevance-based web fallback.
- Integrates document question answering with AI-powered study tools.
- Implements input and output safety classification.
- Provides retrieval transparency through source relevance visualization and debugging tools.
- Supports persistent document storage and multi-session chat history.


