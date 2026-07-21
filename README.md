# Tool_X

Web tool **cá nhân / self-host**: dán link video ngắn từ **TikTok · Instagram · Facebook**, tải kèm **tiêu đề/caption**, convert sang **MP4 chuẩn đăng X** (H.264 + AAC).

> Phase 1: export file + caption  
> Phase 2 (sau): đăng thẳng lên X qua OAuth

## Tính năng MVP

- Phân tích link → thumbnail, title, duration, uploader
- Hỗ trợ **TikTok · Instagram Reel/Post · Facebook Reel/Watch** (normalize URL + multi-strategy)
- Tải video bằng [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- Convert bằng [ffmpeg](https://ffmpeg.org/) theo preset:
  - Dọc 9:16 (không upscale) ★
  - Vuông 1:1 · Ngang 16:9 · Giữ tỷ lệ
- Cắt ≤ 140s (giới hạn X non-Premium)
- Tải MP4, copy caption, **Copy caption + mở X**, lịch sử local
- Cookies Netscape cho TikTok / IG / FB

## Yêu cầu

- Node.js 20+
- **yt-dlp** trên PATH (hoặc `YTDLP_PATH`)
- **ffmpeg** + **ffprobe** trên PATH (hoặc `FFMPEG_PATH` / `FFPROBE_PATH`)

### Windows (local)

```powershell
# yt-dlp
pip install -U yt-dlp
# hoặc: winget install yt-dlp.yt-dlp

# ffmpeg
winget install Gyan.FFmpeg
```

Restart terminal sau khi cài, rồi kiểm tra:

```powershell
yt-dlp --version
ffmpeg -version
```

### Docker (khuyến nghị — đủ binary)

```bash
docker compose up --build
```

Mở http://localhost:3000

### Deploy cloud (Vercel / Railway)

**Vercel serverless không chạy được yt-dlp + ffmpeg.**  

Xem **[DEPLOY.md](./DEPLOY.md)**:

1. **Đơn giản:** full app Docker trên **Railway** (khuyến nghị)
2. **Hybrid:** UI **Vercel** + worker Docker Railway (`NEXT_PUBLIC_API_URL`)

## Chạy dev

```bash
npm install
npm run dev
```

Mở http://localhost:3000

## API

| Method | Path | Mô tả |
|--------|------|--------|
| `GET` | `/api/health` | Kiểm tra yt-dlp + ffmpeg |
| `POST` | `/api/analyze` | `{ "url" }` → metadata + caption |
| `POST` | `/api/jobs` | `{ "url", "preset?", "trimTo140s?" }` → job |
| `GET` | `/api/jobs/:id` | Trạng thái job |
| `GET` | `/api/jobs/:id/download?kind=video\|caption` | Tải file |

### Preset values

`vertical` | `square` | `landscape` | `keep`

## Cấu trúc

```
src/
  app/           # UI + API routes
  components/    # ToolXApp
  lib/
    ytdlp.ts     # download + metadata
    ffmpeg.ts    # encode chuẩn X
    jobs.ts      # queue in-process
    presets.ts
    url.ts
data/jobs/       # file tạm theo job (gitignore)
```

## Lưu ý pháp lý

Chỉ dùng cho **nội dung bạn sở hữu** hoặc **được phép** sử dụng. Tôn trọng ToS và bản quyền của từng nền tảng. Tool này không khuyến khích re-upload nội dung người khác trái phép.

## Cookies (TikTok / Instagram / Facebook)

TikTok hay chặn IP hoặc JS challenge. Tool đã bật:

- `--js-runtimes node` (Node.js)
- `--impersonate chrome` (cần `curl_cffi`: `pip install curl_cffi`)
- cookies Netscape nếu bạn upload

### Xuất cookies.txt

1. Cài extension **Get cookies.txt LOCALLY** (Chrome/Edge)
2. Đăng nhập **tiktok.com** (và/hoặc instagram.com, facebook.com) trên browser
3. Export cookies → file `.txt`
4. Trên UI Tool_X: **Upload cookies.txt**  
   (hoặc copy vào `data/cookies/cookies.txt`)

### CLI test

```powershell
yt-dlp --js-runtimes "node:C:\Program Files\nodejs\node.exe" --impersonate chrome --cookies data\cookies\cookies.txt -F "https://www.tiktok.com/@.../video/..."
```

## Troubleshooting

| Hiện tượng | Cách xử lý |
|------------|------------|
| Health báo thiếu yt-dlp/ffmpeg | Cài binary hoặc dùng Docker |
| `Unable to extract universal data for rehydration` | Cài Node + `curl_cffi`; restart app (đã auto bật) |
| `Your IP address is blocked` | **Upload cookies TikTok** (login sẵn) |
| IG/FB lỗi login / private | Upload cookies Netscape |
| Encode chậm | Normal trên CPU yếu; clip ngắn sẽ nhanh hơn |
| Job mất sau restart | Job store in-memory; file trong `data/jobs` có thể còn |

Dọn file cũ (>1h khi có job mới, hoặc thủ công):

```bash
npm run cleanup
```

## Roadmap ngắn

- [x] MVP export TikTok-first + multi-preset
- [ ] Cookies cho Instagram / Facebook
- [ ] Phase 2: OAuth + đăng thẳng X
