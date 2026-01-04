import { useState, useRef, useEffect } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import {
  FileVideo,
  Upload,
  Play,
  Pause,
  Square,
  Download,
  CheckCircle2,
  Loader2,
  Trash2,
  Settings2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const FORMATS = ['mp4', 'mp3', 'mov', 'flv', '3gp', 'webm', 'mkv', 'avi'];

export default function App() {
  const [files, setFiles] = useState([]);
  const [isReady, setIsReady] = useState(false);
  const ffmpegRef = useRef(new FFmpeg());
  const [isBatchConverting, setIsBatchConverting] = useState(false);

  useEffect(() => {
    loadFFmpeg();
  }, []);

  const loadFFmpeg = async () => {
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
    const ffmpeg = ffmpegRef.current;

    // Bind progress to setFiles
    ffmpeg.on('log', ({ message }) => {
      // Could parse logs for more info if needed
      console.log(message);
    });

    try {
      // Reverting to standard loading to bypass unpkg worker CORS issues
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      setIsReady(true);
    } catch (err) {
      console.error("FFmpeg Load Error:", err);
    }
  };

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files).map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      name: file.name,
      size: (file.size / (1024 * 1024)).toFixed(2),
      status: 'ready',
      progress: 0,
      targetFormat: 'mp4',
      customName: file.name.replace(/\.[^/.]+$/, ""),
      outputUrl: null
    }));
    setFiles(prev => [...prev, ...selectedFiles]);
  };

  const convertFile = async (id) => {
    const fileItem = files.find(f => f.id === id);
    if (!fileItem || !isReady) return;

    setFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'processing', progress: 0 } : f));

    const ffmpeg = ffmpegRef.current;
    const { file, targetFormat, name } = fileItem;
    const inputName = `input_${id}`;
    const outputName = `output_${id}.${targetFormat}`;

    // Progress handler
    const progressHandler = ({ progress }) => {
      setFiles(prev => prev.map(f => f.id === id ? { ...f, progress: Math.round(progress * 100) } : f));
    };
    ffmpeg.on('progress', progressHandler);

    const getMimeType = (format) => {
      const mimeMap = {
        'mp4': 'video/mp4',
        'mp3': 'audio/mpeg',
        'mov': 'video/quicktime',
        'flv': 'video/x-flv',
        '3gp': 'video/3gpp',
        'webm': 'video/webm',
        'mkv': 'video/x-matroska',
        'avi': 'video/x-msvideo'
      };
      return mimeMap[format] || 'application/octet-stream';
    };

    try {
      await ffmpeg.writeFile(inputName, await fetchFile(file));

      // Optimized conversion arguments
      let ffmpegArgs = [];

      switch (targetFormat) {
        case 'mp3':
          ffmpegArgs = ['-i', inputName, '-vn', '-ab', '192k', '-ar', '44100', '-y', outputName];
          break;
        case 'mp4':
          // Match original resolution and use fast H.264 encoding
          ffmpegArgs = ['-i', inputName, '-preset', 'ultrafast', '-crf', '22', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-y', outputName];
          break;
        case '3gp':
          // Standard 3GP settings
          ffmpegArgs = ['-i', inputName, '-r', '15', '-s', '176x144', '-vcodec', 'h263', '-acodec', 'amr_nb', '-ar', '8000', '-ac', '1', '-y', outputName];
          break;
        case 'flv':
          ffmpegArgs = ['-i', inputName, '-c:v', 'flv1', '-c:a', 'mp3', '-y', outputName];
          break;
        default:
          // General high-quality settings for other formats (MOV, MKV, AVI, etc.)
          ffmpegArgs = ['-i', inputName, '-preset', 'ultrafast', '-y', outputName];
      }

      await ffmpeg.exec(ffmpegArgs);

      const data = await ffmpeg.readFile(outputName);

      // FFmpeg.wasm v0.12 returns a Uint8Array. 
      // Passing it directly in an array to the Blob constructor is the standard way.
      const mimeType = getMimeType(targetFormat);
      const fileBlob = new Blob([data], { type: mimeType });
      const url = URL.createObjectURL(fileBlob);

      const finalFileName = `${fileItem.customName}_vidmorph.${targetFormat}`;

      console.log(`Generated file: ${finalFileName}, Mime: ${mimeType}, Size: ${data.length} bytes`);

      setFiles(prev => prev.map(f => f.id === id ? {
        ...f,
        status: 'done',
        progress: 100,
        outputUrl: url,
        outputName: finalFileName
      } : f));
    } catch (err) {
      console.error("Conversion error:", err);
      setFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'error' } : f));
    } finally {
      ffmpeg.off('progress', progressHandler);
      // Clean up FS
      try {
        await ffmpeg.deleteFile(inputName);
        await ffmpeg.deleteFile(outputName);
      } catch (e) { }
    }
  };

  const downloadFile = (file) => {
    const link = document.createElement('a');
    link.href = file.outputUrl;
    link.download = file.outputName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const stopConversion = (id) => {
    // Current FFmpeg.wasm doesn't support easy 'stop' per file once shared worker is busy
    // But we can simulate UI reset. For true stop, we'd need to kill the worker.
    setFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'ready', progress: 0 } : f));
  };

  const removeFile = (id) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleFormatChange = (id, format) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, targetFormat: format } : f));
  };

  const batchConvert = async () => {
    setIsBatchConverting(true);
    const readyFiles = files.filter(f => f.status === 'ready');
    for (const file of readyFiles) {
      await convertFile(file.id);
    }
    setIsBatchConverting(false);
  };

  const [isOver, setIsOver] = useState(false);

  return (
    <div className="container">
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1>VidMorph</h1>
        <p className="subtitle">High-performance client-side video conversion</p>
      </motion.header>

      {!isReady ? (
        <div className="glass" style={{ padding: '3rem', textAlign: 'center', borderRadius: 'var(--radius)' }}>
          <Loader2 className="animate-spin" style={{ margin: '0 auto 1rem', color: 'var(--primary)' }} size={40} />
          <p>Initializing High-Performance Engines...</p>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <motion.label
            className={`dropzone ${isOver ? 'active' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setIsOver(true); }}
            onDragLeave={() => setIsOver(false)}
            onDrop={(e) => { e.preventDefault(); setIsOver(false); handleFileChange({ target: { files: e.dataTransfer.files } }); }}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
          >
            <input type="file" multiple hidden onChange={handleFileChange} accept="video/*" />
            <div className="dropzone-content">
              <div className="icon-stack">
                <Upload size={48} className="upload-icon" />
              </div>
              <h3>Drag & Drop or Click to Upload</h3>
              <p>Supports MP4, MOV, AVI, FLV, 3GP and more</p>
            </div>
          </motion.label>

          <AnimatePresence>
            {files.length > 0 && (
              <motion.div
                className="file-list"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {files.map((file) => (
                  <motion.div
                    key={file.id}
                    className="file-item glass"
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                  >
                    <div className="file-info">
                      <div className="file-header">
                        <FileVideo size={18} className="text-primary" />
                        <input
                          className="name-input"
                          value={file.customName}
                          onChange={(e) => handleNameChange(file.id, e.target.value)}
                          disabled={file.status !== 'ready'}
                          title="Click to rename"
                        />
                        <span className="size-badge">{file.size} MB</span>
                      </div>

                      <div className="progress-container">
                        <div
                          className="progress-bar"
                          style={{ width: `${file.progress}%`, background: file.status === 'done' ? '#22c55e' : 'var(--primary)' }}
                        />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                        <span>{file.status === 'processing' ? `Converting... ${file.progress}%` : file.status.toUpperCase()}</span>
                        {file.status === 'done' && <span style={{ color: '#22c55e' }}>Ready for download</span>}
                      </div>
                    </div>

                    <div className="controls-group">
                      <select
                        className="format-select"
                        value={file.targetFormat}
                        onChange={(e) => handleFormatChange(file.id, e.target.value)}
                        disabled={file.status === 'processing'}
                      >
                        {FORMATS.map(f => <option key={f} value={f}>{f.toUpperCase()}</option>)}
                      </select>

                      <div className="controls">
                        {file.status === 'ready' && (
                          <button className="btn btn-primary" onClick={() => convertFile(file.id)}>
                            <Play size={16} fill="currentColor" /> Start
                          </button>
                        )}

                        {file.status === 'processing' && (
                          <>
                            <button className="btn btn-secondary" disabled>
                              <Loader2 size={16} className="animate-spin" />
                            </button>
                            <button className="btn btn-danger" onClick={() => stopConversion(file.id)}>
                              <Square size={16} fill="currentColor" />
                            </button>
                          </>
                        )}

                        {file.status === 'done' && (
                          <button onClick={() => downloadFile(file)} className="btn btn-primary">
                            <Download size={16} /> Download
                          </button>
                        )}

                        <button className="btn btn-secondary" onClick={() => removeFile(file.id)} disabled={file.status === 'processing'}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}

                <div className="batch-actions">
                  <button
                    className="btn btn-secondary"
                    onClick={() => setFiles([])}
                    disabled={isBatchConverting}
                  >
                    Clear All
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={batchConvert}
                    disabled={isBatchConverting || !files.some(f => f.status === 'ready')}
                  >
                    {isBatchConverting ? <><Loader2 size={16} className="animate-spin" /> Converting Batch</> : 'Convert All'}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      <footer style={{ marginTop: '4rem', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '0.8rem' }}>
        <p>Built with FFmpeg.wasm • All processing happens locally on your device</p>
      </footer>
    </div>
  );
}
