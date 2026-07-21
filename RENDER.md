# Deploy Tool_X trên Render.com

Repo: https://github.com/kid14126/Tool_X

## Cách A — Web Service (Docker) — khuyến nghị, dễ nhất

1. Mở https://dashboard.render.com → Sign up / Log in bằng **GitHub**
2. Cho phép Render truy cập repo `kid14126/Tool_X` (nếu hỏi)
3. **New +** → **Web Service**
4. Connect repository → chọn **`Tool_X`**
5. Điền form:

| Field | Value |
|--------|--------|
| Name | `tool-x` |
| Region | **Singapore** (gần VN) hoặc Oregon |
| Runtime | **Docker** |
| Branch | `main` |
| Dockerfile Path | `./Dockerfile` |
| Instance type | **Free** |

6. **Advanced** → Health Check Path: `/api/health`
7. Environment variables (Add):

| Key | Value |
|-----|--------|
| `NODE_PATH_BIN` | `/usr/local/bin/node` |
| `CORS_ORIGIN` | `*` |
| `YTDLP_PATH` | `/usr/local/bin/yt-dlp` |
| `FFMPEG_PATH` | `/usr/bin/ffmpeg` |
| `FFPROBE_PATH` | `/usr/bin/ffprobe` |

8. **Create Web Service**
9. Đợi build (5–15 phút lần đầu — cài ffmpeg + yt-dlp + `npm run build`)
10. Khi status **Live**, mở URL dạng:

```
https://tool-x-xxxx.onrender.com
```

## Cách B — Blueprint (`render.yaml`)

1. Dashboard → **New +** → **Blueprint**
2. Chọn repo `Tool_X`
3. Render đọc `render.yaml` → Apply
4. Deploy

## Kiểm tra sau deploy

```
https://YOUR-SERVICE.onrender.com/api/health
```

Kỳ vọng:

```json
{
  "ok": true,
  "ytdlp": true,
  "ffmpeg": true,
  "node": true
}
```

UI: chip yt-dlp / ffmpeg / Node xanh → upload cookies → thử link TikTok.

## Lưu ý Free tier

- App **sleep** sau ~15 phút không traffic → request đầu có thể chờ 30–60s (spin up)
- **Không** có disk persistent trên free → cookies mất khi redeploy/sleep lâu; upload lại khi cần
- Build Docker nặng — lần đầu lâu là bình thường

## Nếu build fail

1. Logs → tab **Build** → copy lỗi đỏ cuối
2. Thường do timeout / OOM free → Redeploy 1 lần
3. Vẫn fail → gửi log cho dev

## Cập nhật code sau này

```powershell
cd "C:\Users\14126.eth\Documents\Grok Build\Tool_X"
git add .
git commit -m "Update"
git push origin main
```

Render auto redeploy khi push `main` (nếu bật Auto-Deploy).
