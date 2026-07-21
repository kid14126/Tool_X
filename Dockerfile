# Tool_X — production image for Render / Railway / Fly
FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_PATH_BIN=/usr/local/bin/node \
    YTDLP_PATH=/usr/local/bin/yt-dlp \
    FFMPEG_PATH=/usr/bin/ffmpeg \
    FFPROBE_PATH=/usr/bin/ffprobe \
    YTDLP_IMPERSONATE=chrome \
    PATH="/opt/venv/bin:${PATH}"

# Do NOT set NODE_ENV=production before npm ci/build —
# otherwise devDependencies (tailwind, typescript, postcss) are skipped and `next build` fails.

# System tools
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    ffmpeg \
    python3 \
    python3-venv \
    python3-pip \
  && rm -rf /var/lib/apt/lists/* \
  && ffmpeg -version | head -n1 \
  && python3 --version

# yt-dlp + curl_cffi in venv
RUN python3 -m venv /opt/venv \
  && /opt/venv/bin/pip install --no-cache-dir -U pip setuptools wheel \
  && /opt/venv/bin/pip install --no-cache-dir -U "yt-dlp[default]" curl_cffi \
  && ln -sf /opt/venv/bin/yt-dlp /usr/local/bin/yt-dlp \
  && yt-dlp --version

WORKDIR /app

COPY package.json package-lock.json ./
# Install ALL deps including dev (needed for next build + tailwind)
RUN npm ci --no-audit --no-fund --include=dev

COPY . .

RUN mkdir -p /app/data/jobs /app/data/tmp /app/data/cookies \
  && npm run build \
  && npm prune --omit=dev

# Production runtime only after build succeeds
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

EXPOSE 3000

CMD ["sh", "-c", "exec npm run start -- -H 0.0.0.0 -p ${PORT:-3000}"]
