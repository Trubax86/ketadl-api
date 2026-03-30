const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const ytdlpModule = require('yt-dlp-exec');

// Configure yt-dlp path - use the correct location
const ytdlp = ytdlpModule.create('/usr/local/bin/yt-dlp');

const app = express();
const PORT = process.env.PORT || 3001;
const TEMP_DIR = path.join(__dirname, 'temp');

// Create temp directory if not exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json());

// Serve static files (webapp)
app.use(express.static(path.join(__dirname, 'public')));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Debug endpoint to check yt-dlp
app.get('/api/debug', async (req, res) => {
  const { exec } = require('child_process');
  
  exec('which yt-dlp && yt-dlp --version', (error, stdout, stderr) => {
    res.json({
      ytdlpFound: !error,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      error: error ? error.message : null,
      nodeVersion: process.version,
      platform: process.platform,
    });
  });
});

// Extract video info and available formats
app.get('/api/extract', async (req, res) => {
  const { videoId } = req.query;
  
  if (!videoId) {
    return res.status(400).json({ error: 'videoId is required' });
  }
  
  try {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    
    console.log('Extracting with yt-dlp:', videoId);
    console.log('yt-dlp path:', '/usr/bin/yt-dlp');
    
    const info = await ytdlp(url, {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true,
      addHeader: ['User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'],
    });
    
    // Audio formats
    const audioFormats = (info.formats || [])
      .filter(f => f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none'))
      .map(f => ({
        url: f.url,
        ext: f.ext || 'webm',
        acodec: f.acodec,
        abr: f.abr || Math.round((f.tbr || 0)),
        filesize: f.filesize || f.filesize_approx || 0,
        format_id: f.format_id,
        quality: f.abr ? `${Math.round(f.abr)}kbps` : (f.format_note || 'audio'),
        type: 'audio',
      }))
      .sort((a, b) => (b.abr || 0) - (a.abr || 0));
    
    // Video formats (with audio)
    const videoFormats = (info.formats || [])
      .filter(f => f.vcodec && f.vcodec !== 'none' && f.acodec && f.acodec !== 'none')
      .map(f => ({
        url: f.url,
        ext: f.ext || 'mp4',
        vcodec: f.vcodec,
        acodec: f.acodec,
        resolution: f.resolution || `${f.width}x${f.height}`,
        filesize: f.filesize || f.filesize_approx || 0,
        format_id: f.format_id,
        quality: f.format_note || f.resolution || 'video',
        type: 'video',
      }))
      .sort((a, b) => {
        const aRes = parseInt(a.resolution) || 0;
        const bRes = parseInt(b.resolution) || 0;
        return bRes - aRes;
      });
    
    console.log(`Found ${audioFormats.length} audio, ${videoFormats.length} video formats`);
    
    res.json({
      videoId,
      title: info.title || `Video ${videoId}`,
      uploader: info.uploader || info.channel || 'Unknown',
      duration: info.duration || 0,
      thumbnail: info.thumbnail || `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
      audioFormats,
      videoFormats,
      bestAudio: audioFormats[0],
      bestVideo: videoFormats[0],
      source: 'yt-dlp',
    });
    
  } catch (error) {
    console.error('Extraction error:', error.message);
    res.status(500).json({ 
      error: 'Extraction failed', 
      message: error.message 
    });
  }
});

// Download audio (best quality, native format - no ffmpeg needed)
app.get('/api/mp3', async (req, res) => {
  const { videoId } = req.query;
  
  if (!videoId) {
    return res.status(400).json({ error: 'videoId is required' });
  }
  
  try {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const outputTemplate = path.join(TEMP_DIR, `${videoId}.%(ext)s`);
    
    console.log('Downloading audio:', videoId);
    
    // Get video info first for title
    const info = await ytdlp(url, {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true,
    });
    
    const title = (info.title || videoId).replace(/[^\w\s-]/g, '').trim();
    
    // Download best audio - prefer m4a for better Android compatibility
    await ytdlp(url, {
      format: 'bestaudio[ext=m4a]/bestaudio',
      output: outputTemplate,
      noCheckCertificates: true,
      noWarnings: true,
    });
    
    // Find the downloaded file (could be .webm, .m4a, etc)
    const files = fs.readdirSync(TEMP_DIR).filter(f => f.startsWith(videoId));
    if (files.length === 0) {
      throw new Error('Audio file not created');
    }
    
    const downloadedFile = path.join(TEMP_DIR, files[0]);
    const ext = path.extname(files[0]).slice(1) || 'webm';
    
    // Determine content type
    const contentTypes = {
      'webm': 'audio/webm',
      'm4a': 'audio/mp4',
      'mp3': 'audio/mpeg',
      'opus': 'audio/opus',
      'ogg': 'audio/ogg',
    };
    
    res.setHeader('Content-Type', contentTypes[ext] || 'audio/webm');
    res.setHeader('Content-Disposition', `attachment; filename="${title}.${ext}"`);
    
    const stream = fs.createReadStream(downloadedFile);
    stream.pipe(res);
    
    stream.on('end', () => {
      fs.unlink(downloadedFile, () => {});
    });
    
    stream.on('error', () => {
      fs.unlink(downloadedFile, () => {});
    });
    
  } catch (error) {
    console.error('Audio error:', error.message);
    res.status(500).json({ 
      error: 'Audio download failed', 
      message: error.message 
    });
  }
});

// Download video (best quality with audio included - no ffmpeg merge needed)
app.get('/api/mp4', async (req, res) => {
  const { videoId, quality } = req.query;
  
  if (!videoId) {
    return res.status(400).json({ error: 'videoId is required' });
  }
  
  try {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const outputTemplate = path.join(TEMP_DIR, `${videoId}_video.%(ext)s`);
    
    console.log('Downloading video:', videoId, 'quality:', quality || 'best');
    
    // Get video info first for title
    const info = await ytdlp(url, {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true,
    });
    
    const title = (info.title || videoId).replace(/[^\w\s-]/g, '').trim();
    
    // Download best format with video+audio combined (no merge needed)
    // This selects formats that already have both video and audio
    let format = 'best[ext=mp4]/best';
    if (quality === '720') {
      format = 'best[height<=720][ext=mp4]/best[height<=720]';
    } else if (quality === '480') {
      format = 'best[height<=480][ext=mp4]/best[height<=480]';
    } else if (quality === '360') {
      format = 'best[height<=360][ext=mp4]/best[height<=360]';
    }
    
    await ytdlp(url, {
      format,
      output: outputTemplate,
      noCheckCertificates: true,
      noWarnings: true,
    });
    
    // Find the downloaded file
    const files = fs.readdirSync(TEMP_DIR).filter(f => f.startsWith(`${videoId}_video`));
    if (files.length === 0) {
      throw new Error('Video file not created');
    }
    
    const downloadedFile = path.join(TEMP_DIR, files[0]);
    const ext = path.extname(files[0]).slice(1) || 'mp4';
    
    const contentTypes = {
      'mp4': 'video/mp4',
      'webm': 'video/webm',
      'mkv': 'video/x-matroska',
    };
    
    res.setHeader('Content-Type', contentTypes[ext] || 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${title}.${ext}"`);
    
    const stream = fs.createReadStream(downloadedFile);
    stream.pipe(res);
    
    stream.on('end', () => {
      fs.unlink(downloadedFile, () => {});
    });
    
    stream.on('error', () => {
      fs.unlink(downloadedFile, () => {});
    });
    
  } catch (error) {
    console.error('Video error:', error.message);
    res.status(500).json({ 
      error: 'Video download failed', 
      message: error.message 
    });
  }
});

// Direct audio stream (no conversion, fastest)
app.get('/api/audio', async (req, res) => {
  const { videoId } = req.query;
  
  if (!videoId) {
    return res.status(400).json({ error: 'videoId is required' });
  }
  
  try {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    
    const result = await ytdlp(url, {
      getUrl: true,
      format: 'bestaudio',
      noCheckCertificates: true,
      noWarnings: true,
    });
    
    const audioUrl = result.trim();
    
    if (!audioUrl) {
      return res.status(404).json({ error: 'No audio URL found' });
    }
    
    res.redirect(audioUrl);
    
  } catch (error) {
    console.error('Audio error:', error.message);
    res.status(500).json({ 
      error: 'Audio download failed', 
      message: error.message 
    });
  }
});

app.listen(PORT, () => {
  console.log(`\n🎵 KetaDL API running on port ${PORT}`);
  console.log(`Using yt-dlp for extraction\n`);
  console.log(`Endpoints:`);
  console.log(`  GET /health - Health check`);
  console.log(`  GET /api/extract?videoId=ID - Get video info & formats`);
  console.log(`  GET /api/mp3?videoId=ID - Download as MP3`);
  console.log(`  GET /api/mp4?videoId=ID&quality=720 - Download as MP4`);
  console.log(`  GET /api/audio?videoId=ID - Direct audio stream\n`);
});
