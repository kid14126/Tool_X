# Deploy Tool_X lên Railway (Cách 1)

## Đã chuẩn bị sẵn

- `Dockerfile` — Node + yt-dlp + ffmpeg + curl_cffi
- `railway.toml` — build Docker + healthcheck `/api/health`
- Repo git local (branch `main`)

## Bước 1 — Đẩy code lên GitHub

### Tạo repo trống trên GitHub

1. Mở https://github.com/new  
2. Tên repo: `Tool_X` (hoặc tên bạn thích)  
3. **Public** hoặc **Private**  
4. **Không** tick README / .gitignore / license (repo trống)  
5. Create repository  

### Push từ máy (PowerShell)

Trong thư mục project:

```powershell
cd "C:\Users\14126.eth\Documents\Grok Build\Tool_X"

# Thay YOUR_USER bằng username GitHub
git remote add origin https://github.com/YOUR_USER/Tool_X.git
git push -u origin main
```

Nếu GitHub hỏi login: dùng Personal Access Token (Settings → Developer settings → Tokens) thay mật khẩu.

## Bước 2 — Deploy trên Railway

1. Đăng nhập https://railway.app (login bằng GitHub cho nhanh)  
2. **New Project** → **Deploy from GitHub repo**  
3. Chọn repo `Tool_X` (cấp quyền nếu lần đầu)  
4. Railway sẽ build theo `Dockerfile`  
5. Vào service → **Settings** → **Networking** → **Generate Domain**  
6. Đợi build xong (vài phút)  

### Biến môi trường (optional)

Service → **Variables**:

| Key | Value | Ghi chú |
|-----|--------|---------|
| `CORS_ORIGIN` | `*` | Tool cá nhân |
| `NODE_PATH_BIN` | `/usr/local/bin/node` | Đã có sẵn trong image |

### Volume (khuyến nghị)

Settings → **Volumes** → mount:

- Mount path: `/app/data`  

Giữ cookies + job files khi redeploy.

## Bước 3 — Kiểm tra

Mở:

```
https://YOUR-APP.up.railway.app/api/health
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

Rồi mở homepage:

```
https://YOUR-APP.up.railway.app
```

- Chip **yt-dlp / ffmpeg / Node** xanh  
- Upload cookies (nếu cần TikTok/IG/FB)  
- Thử 1 link TikTok  

## Free tier Railway

- App có thể **sleep** khi không dùng → request đầu chậm  
- Không volume thì cookies mất khi redeploy  

## Lỗi thường gặp

| Hiện tượng | Cách xử lý |
|------------|------------|
| Build fail `npm ci` | Đảm bảo `package-lock.json` đã push |
| Health `ok: false` | Xem build logs; image phải cài ffmpeg + yt-dlp |
| 502 lúc analyze | TikTok chặn IP server Railway → upload cookies |
| Domain 404 | Generate Domain trong Networking |

## Cập nhật sau này

```powershell
cd "C:\Users\14126.eth\Documents\Grok Build\Tool_X"
git add .
git commit -m "Update Tool_X"
git push
```

Railway auto redeploy khi có push (nếu đã nối GitHub).
