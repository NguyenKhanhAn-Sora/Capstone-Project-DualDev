# Moderation Service (FastAPI)

Microservice kiểm duyệt media cho Cordigram.

## Scope hiện tại

- `POST /moderate/image`: nhận 1 ảnh (`multipart/form-data`, field: `file`) và trả `decision`.
- `POST /moderate/video`: nhận 1 video, scan frame theo interval và trả `decision` tổng + `flaggedFrames`.
- `GET /health`: health check.

`decision` gồm:

- `approve`
- `blur`
- `reject`

> Phiên bản hiện tại ưu tiên provider `sightengine-v1` (API ngoài), và fallback sang `heuristic-v2` nếu lỗi kết nối hoặc thiếu key. Contract endpoint không đổi.

Luật quyết định hiện tại:

- `reject`: nội dung 18+ (`nudity` vượt ngưỡng reject).
- `blur`: `violence` hoặc `gore` hoặc `weapons` vượt ngưỡng blur.
- `approve`: các trường hợp còn lại.

## Cài đặt

```bash
cd moderation-service
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

## Chạy local

```bash
uvicorn app.main:app --reload --port 8010
```

- Swagger: `http://localhost:8010/docs`
- Health: `http://localhost:8010/health`

## Test nhanh endpoint

PowerShell:

```powershell
curl.exe -X POST "http://localhost:8010/moderate/image" `
  -H "accept: application/json" `
  -F "file=@C:\path\to\image.jpg"
```

Video:

```powershell
curl.exe -X POST "http://localhost:8010/moderate/video" `
  -H "accept: application/json" `
  -F "file=@C:\path\to\video.mp4"
```

Ví dụ response:

```json
{
  "decision": "blur",
  "scores": {
    "nudity": 0.63,
    "violence": 0.12,
    "gore": 0.09,
    "weapons": 0.22,
    "sensitive": 0.57
  },
  "reasons": [
    "nudity score 0.63 >= blur threshold 0.45"
  ],
  "provider": "sightengine-v1",
  "blurThreshold": 0.45,
  "rejectThreshold": 0.8,
  "processingMs": 31
}
```

## Tích hợp vào backend (bước tiếp theo)

- NestJS upload xong media -> gọi `POST /moderate/image` với file tương ứng.
- Dựa trên `decision`:
  - `approve`: publish bình thường.
  - `blur`: áp transformation blur (Cloudinary) và lưu URL đã blur.
  - `reject`: từ chối tạo post hoặc đánh dấu `moderationState`.

## Ghi chú

- Cấu hình Sightengine trong `.env`:
  - `MODERATION_PROVIDER=sightengine`
  - `SIGHTENGINE_API_USER=...`
  - `SIGHTENGINE_API_SECRET=...`
  - `SIGHTENGINE_ENDPOINT=https://api.sightengine.com/1.0/check.json`
- Nếu muốn chạy local không dùng API ngoài: `MODERATION_PROVIDER=heuristic`.
- Tham số scan video có thể cấu hình thêm trong `.env`:
  - `MAX_VIDEO_BYTES`
  - `VIDEO_SAMPLE_INTERVAL_SEC`
  - `VIDEO_MAX_FRAMES`
  - `VIOLENCE_BLUR_THRESHOLD`, `VIOLENCE_REJECT_THRESHOLD`
  - `GORE_BLUR_THRESHOLD`, `GORE_REJECT_THRESHOLD`
  - `WEAPONS_BLUR_THRESHOLD`, `WEAPONS_REJECT_THRESHOLD`
