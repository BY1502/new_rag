# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RAG AI System - A full-stack Retrieval-Augmented Generation application with multi-tool planning, document knowledge bases, vector search, knowledge graphs, Text-to-SQL, fine-tuning pipeline, and per-user custom model support.

## Commands

### Frontend (React + Vite)

```bash
cd frontend
npm run dev      # Dev server on http://localhost:5173
npm run build    # Production build
```

### Backend (FastAPI)

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload    # API server on http://localhost:8000
```

### Docker Services

```bash
docker-compose -f backend/docker-compose.yml up -d
```

Services: PostgreSQL (5432), Qdrant (6333), Redis (6379), Neo4j (7687), Portainer (9090)

## Architecture

```
Frontend (React 18 + Vite + Tailwind)
    ↓ HTTP/SSE
Backend (FastAPI)
    ├── /api/v1/auth        → User auth (JWT)
    ├── /api/v1/chat        → Streaming chat with RAG
    ├── /api/v1/knowledge   → Document upload & indexing
    ├── /api/v1/settings    → User settings, DB connections, MCP servers
    ├── /api/v1/training    → Feedback collection & dataset management
    └── /api/v1/finetuning  → Fine-tuning jobs & model management

Services Layer:
    ├── RAGService           → Multi-tool planner + RAG pipeline
    │   ├── _analyze_intent()   → Returns list[str] (multi-tool plan)
    │   ├── _web_search()       → Web search (DuckDuckGo/Serper/Brave/Tavily)
    │   ├── _retrieve_context() → Vector retrieval + graph context
    │   └── _generate_answer()  → LLM streaming response
    ├── XLAMService          → Extended Logistics Agent with tools
    ├── T2SQLService         → Text-to-SQL with business metadata
    ├── VectorStoreService   → Qdrant (BAAI/bge-m3, hybrid search, CLIP)
    ├── GraphStoreService    → Neo4j knowledge graph (conditional inclusion)
    ├── IngestionService     → Document processing (Docling) + formula handling
    ├── FineTuningService    → Ollama few-shot Modelfile creation
    ├── QLoRATraining        → Unsloth QLoRA fine-tuning
    └── ModelManager         → HuggingFace base model download/management

External:
    ├── Ollama           → Local LLM inference (per-user custom models)
    ├── Qdrant           → Vector embeddings (dense + sparse + hybrid)
    ├── Neo4j            → Knowledge graph (conditional by triple count)
    ├── PostgreSQL       → User data, settings, DB connections, fine-tuning jobs
    └── Redis            → Caching & session memory
```

## Key Data Flows

**Document Ingestion:**
Upload → Docling processing → Formula handling ([수식] placeholders) → Chunking → BAAI/bge-m3 embedding → Qdrant + Neo4j

**Chat Pipeline (Multi-Tool):**
Query → Intent Router (returns tool list) → Multi-tool execution loop:
  - `["rag"]`: Qdrant retrieval + conditional Neo4j graph → LLM
  - `["web_search"]`: Web search → LLM
  - `["web_search", "rag"]`: Web + RAG combined → LLM
  - `["process"]`: xLAM agent pipeline (standalone)

**Text-to-SQL Pipeline:**
Query → Schema extraction + Business metadata → NL→SQL → Validate (SELECT only) → Execute → Stream results

**Fine-Tuning Pipeline:**
Feedback collection → Dataset build/export → Ollama few-shot or Unsloth QLoRA → Custom model → Set as user default

**Model Selection Priority:**
Frontend explicit model > User's custom_model (DB) > System default (env)

## Core Features

### 1. Multi-Tool Planner
- `_analyze_intent()` returns `list[str]` instead of single route
- Deep Think mode: LLM plans multi-tool execution (e.g., `["web_search", "rag"]`)
- Fast mode: keyword-based single tool selection (backward compatible)
- Process/T2SQL routes remain standalone

### 2. T2SQL Schema Metadata
- `DbConnection.schema_metadata` column stores business metadata (JSON)
- Metadata prepended to DDL in SQL generation prompt
- `PUT /settings/db-connections/{id}/metadata` endpoint for updates
- Improves SQL accuracy by providing column/table descriptions

### 3. Conditional Knowledge Graph
- `get_graph_context()` returns `tuple[str, int]` (context, triple_count)
- `GRAPH_MIN_TRIPLES` config (default: 3) sets inclusion threshold
- Graph context only included when enough relevant triples found
- Prevents low-quality graph noise from degrading answers

### 4. Per-User Custom Model
- `UserSettings.custom_model` stores user's fine-tuned model name
- `POST /finetuning/models/set-default` and `clear-default` endpoints
- RAG service auto-selects: frontend > custom_model > system default
- FineTuningMonitor UI: "기본 모델로 설정" buttons on models/jobs

### 5. Formula Handling
- `[수식]` placeholder instead of deletion for math formulas
- Unicode math normalization (≤→<=, ∑→sum, ∫→int, etc.)
- Single math symbols preserved, only 3+ symbol clusters replaced
- Consecutive placeholders merged into one

## Backend Structure

- `backend/app/main.py` - FastAPI app entry point + auto-migration
- `backend/app/api/endpoints/` - Route handlers
  - `auth.py` - Authentication (JWT)
  - `chat.py` - Streaming chat
  - `knowledge.py` - Document upload & KB management
  - `settings.py` - User settings, API keys, DB connections, MCP servers
  - `feedback.py` - Conversation feedback (training data)
  - `finetuning.py` - Fine-tuning jobs, model management, set-default
- `backend/app/services/` - Business logic
  - `rag_service.py` - Multi-tool RAG pipeline (core)
  - `xlam_service.py` - Logistics agent
  - `t2sql_service.py` - Text-to-SQL with metadata
  - `vector_store.py` - Qdrant vector operations
  - `graph_store.py` - Neo4j graph operations
  - `ingestion.py` - Document processing + formula handling
  - `finetuning_service.py` - Ollama Modelfile generation
  - `qlora_training.py` - Unsloth QLoRA training
  - `model_manager.py` - HuggingFace model download
- `backend/app/models/` - SQLAlchemy ORM models
- `backend/app/schemas/` - Pydantic schemas
- `backend/app/crud/` - CRUD utilities (user_settings, etc.)
- `backend/app/core/config.py` - Environment configuration

## Frontend Structure

- `frontend/src/App.jsx` - Main routing & layout
- `frontend/src/api/client.js` - API client (fetch-based)
  - `streamChat`, `authAPI`, `knowledgeAPI`, `settingsAPI`
  - `feedbackAPI`, `datasetAPI`, `finetuningAPI`
- `frontend/src/features/` - Feature modules
  - `chat/` - Chat interface with streaming
  - `knowledge/` - KB management & graph visualization
  - `training/` - DatasetManager, FineTuningMonitor
  - `settings/` - User settings & connections
- `frontend/src/contexts/` - React contexts (AuthContext, StoreContext)
- `frontend/src/components/` - Shared UI components

## Environment Variables

Backend `.env` requires:

- `DATABASE_URL` - PostgreSQL connection
- `QDRANT_URL` - Vector DB (default: http://localhost:6333)
- `REDIS_URL` - Cache (default: redis://localhost:6379)
- `NEO4J_URL`, `NEO4J_USERNAME`, `NEO4J_PASSWORD` - Knowledge graph
- `OLLAMA_BASE_URL` - LLM server (default: http://localhost:11434)
- `SECRET_KEY` - JWT signing key
- `GRAPH_MIN_TRIPLES` - Min triples for graph inclusion (default: 3)
- `MODEL_STORAGE_DIR` - Base model storage path
- `FINETUNE_BASE_MODEL` - Default base model for QLoRA

## API Endpoints

### Auth
- `POST /api/v1/auth/register` - User registration
- `POST /api/v1/auth/login` - OAuth2 token login

### Chat
- `POST /api/v1/chat/stream` - Streaming chat (SSE, multi-tool)

### Knowledge
- `POST /api/v1/knowledge/upload` - Document upload
- `GET /api/v1/knowledge/bases` - List knowledge bases
- `GET /api/v1/knowledge/graph` - Get graph data

### Settings
- `GET/PUT /api/v1/settings/user` - User settings (incl. custom_model)
- `POST /api/v1/settings/db-connections` - Create DB connection
- `PUT /api/v1/settings/db-connections/{id}/metadata` - Update schema metadata
- `GET /api/v1/settings/db-connections/{id}/schema` - Get DB schema + metadata

### Training
- `POST /api/v1/training/feedback` - Submit feedback
- `POST /api/v1/training/datasets` - Create dataset
- `POST /api/v1/training/datasets/{id}/build` - Build dataset
- `GET /api/v1/training/datasets/{id}/export` - Export (chat/completion/instruction/tool_calling)

### Fine-Tuning
- `POST /api/v1/finetuning/jobs` - Create job (ollama/unsloth)
- `GET /api/v1/finetuning/models` - List custom models
- `POST /api/v1/finetuning/models/set-default` - Set user default model
- `POST /api/v1/finetuning/models/clear-default` - Clear user default model
- `POST /api/v1/finetuning/models/download` - Download base model
- `GET /api/v1/finetuning/models/base` - List base models

## DB Auto-Migration

On startup (`main.py` lifespan), the app automatically adds missing columns:
- `user_settings.dense_weight` (FLOAT)
- `conversation_feedbacks.tool_calls_json` (TEXT)
- `db_connections.schema_metadata` (TEXT)
- `user_settings.custom_model` (VARCHAR 200)

## Tech Stack

**Frontend:** React 18, Vite, Tailwind CSS, React Router, Fetch API
**Backend:** FastAPI, SQLAlchemy (async), LangChain, LangGraph, Pydantic
**AI/ML:** Ollama (LLM), BAAI/bge-m3 (embeddings), BAAI/bge-reranker-v2-m3 (reranker), Docling (document processing), Unsloth (QLoRA), CLIP (multimodal)
**Storage:** PostgreSQL, Qdrant (vectors), Neo4j (graphs), Redis (cache)
