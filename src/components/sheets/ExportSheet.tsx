import { useState } from 'react';
import BottomSheet from '../BottomSheet';

type Stage = 'form' | 'rendering' | 'done' | 'error';
type Format = 'wav' | 'mp3';

interface RenderResult {
  blob: Blob;
  filename: string;
  mimeType: string;
}

interface Props {
  onRender: (
    name: string,
    format: Format,
    sampleRate: number,
    bitrateKbps: number,
    onProgress: (p: number) => void
  ) => Promise<RenderResult>;
  onClose: () => void;
}

const MP3_BITRATES = [128, 192, 256, 320];

export default function ExportSheet({ onRender, onClose }: Props) {
  const [name, setName] = useState('Mon morceau');
  const [format, setFormat] = useState<Format>('wav');
  const [sampleRate, setSampleRate] = useState(44100);
  const [bitrate, setBitrate] = useState(320);
  const [stage, setStage] = useState<Stage>('form');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<RenderResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [canShareFiles, setCanShareFiles] = useState(false);

  async function handleCreate() {
    setStage('rendering');
    setProgress(0);
    try {
      const res = await onRender(name.trim() || 'Mon morceau', format, sampleRate, bitrate, setProgress);
      setResult(res);
      const file = new File([res.blob], res.filename, { type: res.mimeType });
      setCanShareFiles(typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] }));
      setStage('done');
    } catch (err) {
      console.error('Erreur export', err);
      setErrorMessage(err instanceof Error ? err.message : 'Erreur inconnue');
      setStage('error');
    }
  }

  async function handleShare() {
    if (!result) return;
    const file = new File([result.blob], result.filename, { type: result.mimeType });
    try {
      await navigator.share({ files: [file], title: result.filename });
    } catch (err) {
      if ((err as DOMException)?.name !== 'AbortError') console.error('Partage annulé/échoué', err);
    }
  }

  function handleDownload() {
    if (!result) return;
    const url = URL.createObjectURL(result.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  return (
    <BottomSheet title="Exporter l'audio" onClose={onClose}>
      {stage === 'form' && (
        <>
          <label className="sheet-field">
            <span>Nom du fichier</span>
            <input
              className="sheet-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mon morceau"
              maxLength={80}
            />
          </label>

          <div className="sheet-field">
            <span>Format</span>
            <div className="chip-row">
              <button className={`chip ${format === 'wav' ? 'chip-selected' : ''}`} onClick={() => setFormat('wav')}>WAV</button>
              <button className={`chip ${format === 'mp3' ? 'chip-selected' : ''}`} onClick={() => setFormat('mp3')}>MP3</button>
            </div>
          </div>

          {format === 'wav' ? (
            <div className="sheet-field">
              <span>Qualité</span>
              <div className="chip-row">
                <button className={`chip ${sampleRate === 44100 ? 'chip-selected' : ''}`} onClick={() => setSampleRate(44100)}>44.1 kHz</button>
                <button className={`chip ${sampleRate === 48000 ? 'chip-selected' : ''}`} onClick={() => setSampleRate(48000)}>48 kHz</button>
              </div>
            </div>
          ) : (
            <div className="sheet-field">
              <span>Qualité</span>
              <div className="chip-row">
                {MP3_BITRATES.map((b) => (
                  <button key={b} className={`chip ${bitrate === b ? 'chip-selected' : ''}`} onClick={() => setBitrate(b)}>
                    {b} kbps
                  </button>
                ))}
              </div>
            </div>
          )}

          <button className="btn btn-add sheet-full-width" onClick={handleCreate}>Créer le fichier</button>
        </>
      )}

      {stage === 'rendering' && (
        <div className="export-progress">
          <p>Création de votre audio…</p>
          <div className="progress-bar">
            <div className="progress-bar-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <span className="progress-percent">{Math.round(progress * 100)}%</span>
        </div>
      )}

      {stage === 'done' && result && (
        <div className="export-done">
          <p className="export-done-title">Export terminé ✓</p>
          <p className="sheet-hint">{result.filename}</p>
          {canShareFiles ? (
            <button className="btn btn-add sheet-full-width" onClick={handleShare}>Partager / Enregistrer</button>
          ) : null}
          <button className={`btn sheet-full-width ${canShareFiles ? 'sheet-btn-secondary' : 'btn-add'}`} onClick={handleDownload}>
            Télécharger
          </button>
        </div>
      )}

      {stage === 'error' && (
        <div className="export-done">
          <p className="export-done-title">Erreur lors de l'export</p>
          <p className="sheet-hint">{errorMessage}</p>
          <button className="btn sheet-full-width" onClick={() => setStage('form')}>Réessayer</button>
        </div>
      )}
    </BottomSheet>
  );
}
