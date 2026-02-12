# Multimodal Knowledge Base - Quick Start

Fast setup guide for developers. For comprehensive documentation, see [MULTIMODAL_GUIDE.md](./MULTIMODAL_GUIDE.md).

## Installation (5 minutes)

### 1. Install Dependencies
```bash
cd backend
pip install -r requirements.txt
```

### 2. Update .env
```env
ALLOWED_FILE_EXTENSIONS=.pdf,.docx,.doc,.txt,.md,.pptx,.xlsx,.jpg,.jpeg,.png,.gif,.webp
CLIP_MODEL=openai/clip-vit-base-patch32
IMAGE_STORAGE_DIR=backend/storage/images
ENABLE_THUMBNAIL=true
ENABLE_OCR=true
ENABLE_CAPTIONING=true
```

### 3. Migrate Database
```bash
python migrate_db.py
```

### 4. Test Installation
```bash
python test_image_upload.py
```

Expected output:
```
[OK] Config
[OK] IngestionService
[OK] CLIP
[OK] BLIP
[OK] EasyOCR
[SUCCESS] All tests passed!
```

### 5. Start Backend
```bash
uvicorn app.main:app --reload
```

---

## Usage (Frontend)

### Enable Multimodal Search
1. Go to ⚙️ Settings → Advanced Settings
2. Toggle "멀티모달 검색 활성화"
3. Save

### Upload Images
**Method 1**: Direct upload
- Knowledge Base → Select KB → 파일 업로드
- Choose `.jpg`, `.png`, `.gif`, `.webp`

**Method 2**: PDF with embedded images
- Upload PDF → images automatically extracted

### View Images
- Knowledge Base → Select KB → 청크 tab
- Expand image chunks to see:
  - Thumbnail preview
  - Auto-generated caption (BLIP)
  - Extracted text (EasyOCR)
  - Image metadata
- Click thumbnail for full-size view

### Search with Images
- Enable multimodal search in settings
- Text query finds relevant images
  - Example: "system architecture diagram"
  - Returns images with matching captions/OCR text

---

## API Quick Reference

### Upload Image
```bash
curl -X POST http://localhost:8000/api/v1/knowledge/kb_123/upload \
  -F "file=@diagram.png"
```

### Get Chunks (with images)
```bash
curl http://localhost:8000/api/v1/knowledge/kb_123/chunks?limit=10
```

Response includes:
```json
{
  "chunks": [
    {
      "id": "point-1",
      "content_type": "image",
      "thumbnail_path": "/images/kb_123/uuid_thumb.jpg",
      "caption": "A flowchart showing data processing",
      "ocr_text": "Input → Process → Output"
    }
  ]
}
```

### Search by Image
```bash
curl -X POST http://localhost:8000/api/v1/knowledge/kb_123/search-by-image \
  -F "image=@query.jpg" \
  -F "top_k=5" \
  -F "content_type_filter=text"
```

### Chat with Multimodal Search
```bash
curl -X POST http://localhost:8000/api/v1/chat/stream \
  -H "Content-Type: application/json" \
  -d '{
    "message": "show me architecture diagrams",
    "kb_ids": ["kb_123"],
    "use_multimodal_search": true,
    "model_name": "llama3.1:latest"
  }'
```

---

## Code Examples

### Python: Embed Image with CLIP
```python
from app.services.clip_embeddings import get_clip_embeddings

clip = get_clip_embeddings()
vector = clip.embed_image("path/to/image.jpg")  # 512-dim list
```

### Python: Generate Caption
```python
from app.services.image_captioning import get_image_captioning_service

captioner = get_image_captioning_service()
caption = captioner.generate_caption("image.jpg", max_length=50)
# "a diagram showing system architecture with databases"
```

### Python: Extract Text (OCR)
```python
from app.services.image_ocr import get_image_ocr_service

ocr = get_image_ocr_service()
text = ocr.extract_text("screenshot.png")
# "Login\nUsername\nPassword"
```

### Python: Multimodal Search
```python
from app.services.vdb.qdrant_store import QdrantStore
from app.services.clip_embeddings import get_clip_embeddings

# Encode query
clip = get_clip_embeddings()
query_vec = clip.embed_text_for_cross_modal("database schema diagram")

# Search Qdrant
store = QdrantStore("kb_abc123", client)
results = await store.multimodal_search(
    query_vector=query_vec,
    content_type_filter="image",  # Only return images
    top_k=5
)
```

---

## Troubleshooting

### "File validation failed: 허용되지 않는 파일 형식입니다"
**Fix**: Add image extensions to `.env` → Restart backend
```env
ALLOWED_FILE_EXTENSIONS=.pdf,.docx,.doc,.txt,.md,.pptx,.xlsx,.jpg,.jpeg,.png,.gif,.webp
```

### "ModuleNotFoundError: No module named 'easyocr'"
**Fix**:
```bash
pip install easyocr torch torchvision
```

### Images not displaying
**Fix**: Verify static file serving in `backend/app/main.py`:
```python
from fastapi.staticfiles import StaticFiles
app.mount("/images", StaticFiles(directory="backend/storage/images"), name="images")
```

### "column knowledge_bases.external_service_id does not exist"
**Fix**: Run migration
```bash
python migrate_db.py
```

---

## Architecture Overview

### Triple Vector Schema
```
Qdrant Collection:
  ├── dense (1024-dim): BGE-m3 text embeddings
  ├── text-sparse: BM25 keyword vectors
  └── clip (512-dim): CLIP image+text embeddings
```

### Image Storage
```
backend/storage/images/
  └── kb_{kb_id}/
      ├── {uuid}.png           # Original image
      └── {uuid}_thumb.jpg     # 300x300 thumbnail
```

### Processing Pipeline
```
Image Upload
  ↓
1. Save to filesystem
2. Generate thumbnail (Pillow)
3. Embed with CLIP (512-dim)
4. Generate caption (BLIP)
5. Extract text (EasyOCR)
  ↓
Index in Qdrant with metadata
  ↓
Display in Frontend (thumbnail + metadata)
```

---

## Performance

### GPU (RTX 3080)
- CLIP: ~10ms/image
- BLIP: ~80ms/caption
- OCR: ~150ms/text extraction
- **Total**: ~250ms per image

### CPU (Intel i7)
- CLIP: ~100ms/image
- BLIP: ~800ms/caption
- OCR: ~1500ms/text extraction
- **Total**: ~2.4s per image

### Storage
- Original image: ~200KB (JPEG)
- Thumbnail: ~15KB (300×300)
- CLIP vector: 2KB (512 floats)
- **Total per image**: ~217KB

---

## What's Next?

- **Full Documentation**: [MULTIMODAL_GUIDE.md](./MULTIMODAL_GUIDE.md)
- **System Architecture**: See [CLAUDE.md](../CLAUDE.md)
- **API Reference**: [MULTIMODAL_GUIDE.md#api-reference](./MULTIMODAL_GUIDE.md#api-reference)
- **Testing Guide**: [MULTIMODAL_GUIDE.md#testing](./MULTIMODAL_GUIDE.md#testing)

---

**Status**: ✅ Production Ready
**Version**: 1.0.0
