# Deploy Tool_X

## Quan trọng: Vercel **không** chạy được pipeline video

Tool_X cần **yt-dlp + ffmpeg + disk + job dài**.  
Vercel Serverless:

- Không có binary hệ thống ổn định
- Timeout ngắn
- Disk `/tmp` tạm, không persistent

→ **Không deploy full Tool_X chỉ trên Vercel.**

---

## Cách khuyến nghị (đơn giản nhất)

### Đưa **cả app** lên Railway / Render / Fly (Docker)

1. Push code lên GitHub
2. [Railway](https://railway.app) → New Project → Deploy from GitHub
3. Railway detect `Dockerfile` / `railway.toml`
4. Add volume (optional) mount `/app/data` để giữ cookies/jobs
5. Mở public URL → dùng như local

**Env worker (optional):**

```
CORS_ORIGIN=*
NODE_PATH_BIN=/usr/local/bin/node
```

Xong. Domain `*.up.railway.app` dùng được ngay — **không cần Vercel**.

---

## Cách hybrid: UI Vercel + Worker Docker

Dùng khi bạn **muốn domain/UI trên Vercel**.

```
Browser  →  Vercel (Next.js UI only)
                │
                │  NEXT_PUBLIC_API_URL
                ▼
         Railway Docker (yt-dlp + ffmpeg + API)
```

### Bước 1 — Worker (Railway)

1. Deploy repo bằng **Dockerfile** (như trên)
2. Lấy URL worker, ví dụ: `https://toolx-production.up.railway.app`
3. Env:

```
CORS_ORIGIN=https://your-app.vercel.app
```

Kiểm tra: `https://worker.../api/health` → `"ok": true`, `ytdlp` + `ffmpeg` true.

### Bước 2 — UI (Vercel)

1. Import repo trên [vercel.com](https://vercel.com)
2. Framework: Next.js
3. Environment Variables:

| Name | Value |
|------|--------|
| `NEXT_PUBLIC_API_URL` | `https://toolx-production.up.railway.app` |

4. Deploy

UI gọi API sang Railway (analyze, jobs, cookies, download).

### Bước 3 — Cookies

Upload cookies **trên UI** — file lưu trên **worker** (`/app/data/cookies`), không lưu trên Vercel.

---

## Checklist sau deploy

- [ ] `GET {worker}/api/health` → `ok: true`
- [ ] UI chip **yt-dlp / ffmpeg** xanh
- [ ] Phân tích 1 link TikTok public
- [ ] Convert + tải MP4
- [ ] (IG/FB) upload cookies đã login

---

## Bảo mật (tool cá nhân)

- Đây là tool **self-host / private** — ai có URL đều dùng được
- Nên:
  - Không share URL public rộng
  - Hoặc thêm password (phase sau)
  - Không commit `cookies.txt`
- `CORS_ORIGIN=*` chỉ nên dùng khi tool private

---

## Local vs production

| Môi trường | Cách chạy |
|------------|-----------|
| Dev máy bạn | `npm run dev` + yt-dlp/ffmpeg local |
| Full cloud | Docker trên Railway (1 service) |
| Vercel brand | UI Vercel + worker Railway |

---

## Lỗi thường gặp

| Lỗi | Nguyên nhân | Fix |
|-----|-------------|-----|
| Health `ok: false` trên Vercel | API cùng origin Vercel không có binary | Set `NEXT_PUBLIC_API_URL` → worker |
| CORS blocked | Worker chặn origin Vercel | `CORS_ORIGIN=https://xxx.vercel.app` |
| IG/FB fail | Thiếu cookies | Upload cookies trên UI |
| Job mất sau sleep | Railway free sleep / no volume | Bật volume `/app/data` hoặc paid |
