FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    ffmpeg \
    python3 \
    python3-pip \
  && pip3 install --no-cache-dir --break-system-packages "yt-dlp[default]" curl_cffi \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_PATH_BIN=/usr/local/bin/node
ENV YTDLP_IMPERSONATE=chrome
ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN mkdir -p /app/data/jobs /app/data/tmp /app/data/cookies \
  && npm run build

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Railway/Fly inject PORT — Next reads it via npm start
EXPOSE 3000

VOLUME ["/app/data"]

# Use shell form so $PORT expands on Railway
CMD ["sh", "-c", "npm run start -- -H 0.0.0.0 -p ${PORT:-3000}"]
