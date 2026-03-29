# KetaDL - YouTube Downloader API

API per scaricare video e audio da YouTube in MP3 e MP4 usando yt-dlp.

## 🚀 Deploy su Railway (Consigliato)

Railway supporta Docker con yt-dlp + ffmpeg ed è gratuito per progetti piccoli.

### Passi:
1. Crea account su [railway.app](https://railway.app)
2. Crea un nuovo repository GitHub con questa cartella `youtube-api`
3. Su Railway: **New Project → Deploy from GitHub**
4. Seleziona il repository
5. Railway rileverà automaticamente il Dockerfile
6. Dopo il deploy, vai su **Settings → Networking → Generate Domain**
7. Copia l'URL (es. `https://ketadl.up.railway.app`)

### Costi:
- **Free tier**: $5 di crediti/mese (sufficiente per uso personale)
- **Hobby**: $5/mese illimitato

## 🌐 Deploy su Render (Alternativa)

1. Crea account su [render.com](https://render.com)
2. **New → Web Service → Connect GitHub**
3. Seleziona "Docker" come environment
4. Il file `render.yaml` configurerà tutto

### Nota:
- Free tier ha sleep dopo 15min di inattività
- Primo avvio può essere lento

## 📡 Endpoints API

### Health Check
```
GET /health
```

### Estrai info video
```
GET /api/extract?videoId=VIDEO_ID
```

### Download MP3 (audio)
```
GET /api/mp3?videoId=VIDEO_ID
```

### Download MP4 (video)
```
GET /api/mp4?videoId=VIDEO_ID&quality=720
```
Quality: `best`, `720`, `480`, `360`

### Audio stream diretto
```
GET /api/audio?videoId=VIDEO_ID
```

## 💻 Test Locale

Requisiti:
- Node.js 18+
- yt-dlp installato (`pip install yt-dlp`)
- ffmpeg installato (per conversione MP3)

```bash
cd youtube-api
npm install
npm start
```

Apri: http://localhost:3001

## 📱 Integrazione App Mobile

Aggiorna `downloadService.ts` con l'URL del tuo server:

```typescript
const CUSTOM_API_URL = 'https://ketadl.up.railway.app';

export async function fetchCustomApiStreams(videoId: string) {
  const res = await fetch(`${CUSTOM_API_URL}/api/extract?videoId=${videoId}`);
  const data = await res.json();
  return data.audioFormats;
}
```

## 🎨 Icona

L'icona è disponibile in `/public/icon.svg` - usala per:
- Favicon webapp
- Icona app mobile (converti in PNG)
- App store
