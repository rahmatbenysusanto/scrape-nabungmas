# Gunakan Node.js slim untuk image lebih ringan
FROM node:20-slim

# Install dependencies untuk Puppeteer & Chromium (Linux) + tzdata untuk Zona Waktu
RUN apt-get update && apt-get install -y \
    chromium \
    tzdata \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set zona waktu default ke Jakarta
ENV TZ=Asia/Jakarta

# Install PM2 secara global
RUN npm install pm2 -g

WORKDIR /app

# Copy package.json untuk install dependencies terpusat
COPY package.json ./
RUN npm install --production

# Copy semua script scraper ke container
COPY . .

# Konfigurasi Environment
ENV CHROME_PATH=/usr/bin/chromium
ENV NODE_ENV=production

# Jalankan PM2 sebagai process manager utama
# Penjadwalan sekarang ditangani di dalam run_all.js menggunakan node-cron
CMD ["pm2-runtime", "start", "run_all.js", "--name", "gold-scraper", "--", "--cron"]
