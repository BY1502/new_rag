# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RAG AI System - A full-stack Retrieval-Augmented Generation application with multi-agent capabilities, document knowledge bases, vector search, and knowledge graphs.

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
    ├── /api/v1/auth     → User auth (JWT)
    ├── /api/v1/chat     → Streaming chat with RAG
    └── /api/v1/knowledge → Document upload & indexing

Services Layer:
    ├── RAGService       → Main RAG pipeline (retrieval + generation)
    ├── XLAMService      → Extended Logistics Agent with tools
    ├── VectorStoreService → Qdrant integration (BAAI/bge-m3 embeddings)
    ├── GraphStoreService  → Neo4j knowledge graph
    └── IngestionService   → Document processing (Docling)

External:
    ├── Ollama           → Local LLM inference (llama3.1)
    ├── Qdrant           → Vector embeddings
    ├── Neo4j            → Knowledge graph
    ├── PostgreSQL       → User data & metadata
    └── Redis            → Caching & session memory
```

## Key Data Flows

**Document Ingestion:**
Upload → Docling processing → Chunking → BAAI/bge-m3 embedding → Qdrant + Neo4j

**Chat Pipeline:**
Query → Intent Router → Qdrant retrieval + Neo4j context → Ollama LLM → SSE streaming response

**xLAM Pipeline:**
Query → Agent router → Tool execution (logistics tools) → Streamed execution logs

## Backend Structure

- `backend/app/main.py` - FastAPI app entry point
- `backend/app/api/endpoints/` - Route handlers (auth, chat, knowledge)
- `backend/app/services/` - Business logic (rag_service, xlam_service, vector_store, graph_store)
- `backend/app/tools/` - Agent tools (logistics.py)
- `backend/app/models/` - SQLAlchemy ORM models
- `backend/app/schemas/` - Pydantic schemas
- `backend/app/core/config.py` - Environment configuration

## Frontend Structure

- `frontend/src/App.jsx` - Main routing & layout
- `frontend/src/api/` - API client (Axios)
- `frontend/src/features/` - Feature modules (chat, knowledge, agent, video, settings)
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

## API Endpoints

- `POST /api/v1/auth/register` - User registration
- `POST /api/v1/auth/login` - OAuth2 token login
- `POST /api/v1/chat/stream` - Streaming chat (SSE)
- `POST /api/v1/knowledge/upload` - Document upload

## Tech Stack

**Frontend:** React 18, Vite, Tailwind CSS, React Router, Axios
**Backend:** FastAPI, SQLAlchemy (async), LangChain, LangGraph, Pydantic
**AI/ML:** Ollama (LLM), BAAI/bge-m3 (embeddings), Docling (document processing)
**Storage:** PostgreSQL, Qdrant (vectors), Neo4j (graphs), Redis (cache)
