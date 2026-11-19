import { useCallback, useEffect, useRef, useState } from 'react';
import { makeClick } from '../../lib/click';
import { MetronomeIcon } from '../icons';
import { BeatLights, Brand, SelectField, type SelectOption } from '../ui';

export interface MetronomeProps {
  defaultBpm?: number;
  defaultMeter?: number;
  minBpm?: number;
  maxBpm?: number;
  embedded?: boolean;
  onClose?: () => void;
}

const METER_OPTIONS: SelectOption[] = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
  value: n,
  label: String(n),
}));

export function Metronome({
  defaultBpm = 95,
  defaultMeter = 4,
  minBpm = 30,
  maxBpm = 190,
  embedded,
  onClose,
}: MetronomeProps) {
  const [bpm, setBpm] = useState(defaultBpm);
  const [bpmInput, setBpmInput] = useState(String(defaultBpm));
  const [meter, setMeter] = useState(defaultMeter);
  const [running, setRunning] = useState(false);
  const [activeBeat, setActiveBeat] = useState(-1);
  const [error, setError] = useState('');

  const audioRef = useRef<AudioContext | null>(null);
  const runningRef = useRef(false);
  const nextTimeRef = useRef(0);
  const beatRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const clicksRef = useRef<Set<OscillatorNode>>(new Set());
  const lightsRef = useRef<Set<number>>(new Set());
  const bpmRef = useRef(bpm);
  const meterRef = useRef(meter);

  bpmRef.current = bpm;
  meterRef.current = meter;

  const stop = useCallback(() => {
    generationRef.current += 1;
    runningRef.current = false;
    setRunning(false);
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    for (const tick of clicksRef.current) {
      try {
        tick.stop();
      } catch {
        // Ignore already-stopped oscillators.
      }
    }
    clicksRef.current.clear();
    for (const id of lightsRef.current) {
      window.clearTimeout(id);
    }
    lightsRef.current.clear();
    setActiveBeat(-1);
  }, []);

  const schedule = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (nextTimeRef.current < audio.currentTime - 0.05) {
      nextTimeRef.current = audio.currentTime;
    }
    while (nextTimeRef.current < audio.currentTime + 0.12) {
      const current = beatRef.current;
      const when = Math.max(audio.currentTime, nextTimeRef.current);
      const tick = makeClick(audio, audio.destination, when, current === 0);
      clicksRef.current.add(tick);
      tick.addEventListener('ended', () => clicksRef.current.delete(tick), { once: true });
      const delayMs = Math.max(0, (when - audio.currentTime) * 1000);
      const light = window.setTimeout(() => {
        lightsRef.current.delete(light);
        setActiveBeat(current);
      }, delayMs);
      lightsRef.current.add(light);
      nextTimeRef.current += 60 / bpmRef.current;
      beatRef.current = (beatRef.current + 1) % meterRef.current;
    }
  }, []);

  const toggleStart = useCallback(async () => {
    if (runningRef.current) {
      stop();
      return;
    }
    runningRef.current = true;
    const token = ++generationRef.current;
    setError('');
    try {
      const AudioCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioRef.current ??= new AudioCtor();
      await audioRef.current.resume();
      if (token !== generationRef.current) return;
      nextTimeRef.current = audioRef.current.currentTime + 0.02;
      beatRef.current = 0;
      setRunning(true);
      schedule();
      timerRef.current = window.setInterval(schedule, 25);
    } catch (err) {
      stop();
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [schedule, stop]);

  useEffect(() => {
    window.addEventListener('pagehide', stop);
    return () => {
      window.removeEventListener('pagehide', stop);
      stop();
    };
  }, [stop]);

  useEffect(() => {
    const isIframeEmbedded =
      embedded ??
      (window.parent !== window && new URLSearchParams(window.location.search).has('embedded'));
    if (!isIframeEmbedded) return;
    document.body.classList.add('embedded');
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (onClose) {
        onClose();
      } else if (window.parent !== window) {
        window.parent.postMessage('close-metronome', window.location.origin);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [embedded, onClose]);

  const commitBpm = (raw: string) => {
    const clamped = Math.max(minBpm, Math.min(maxBpm, Math.round(Number(raw)) || defaultBpm));
    setBpm(clamped);
    setBpmInput(String(clamped));
  };

  return (
    <main>
      <Brand title="midi-mixer" logoClassName="brand-mark" />
      <h1>
        <MetronomeIcon /> Metronome
      </h1>
      <div className="tempo">
        <input
          id="bpm"
          aria-label="Tempo in beats per minute"
          type="number"
          min={minBpm}
          max={maxBpm}
          value={bpmInput}
          onChange={(e) => {
            const nextRaw = e.target.value;
            setBpmInput(nextRaw);
            const parsed = Number(nextRaw);
            if (Number.isFinite(parsed) && parsed >= minBpm && parsed <= maxBpm) {
              setBpm(Math.round(parsed));
            }
          }}
          onBlur={(e) => commitBpm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commitBpm(e.currentTarget.value);
              e.currentTarget.blur();
            }
          }}
        />
        <label htmlFor="bpm">BPM</label>
      </div>
      <input
        id="slider"
        type="range"
        min={minBpm}
        max={maxBpm}
        value={bpm}
        aria-label="Tempo"
        onChange={(e) => {
          const next = Number(e.target.value);
          setBpm(next);
          setBpmInput(String(next));
        }}
      />
      <div className="controls">
        <SelectField
          id="meter"
          label="Beats per bar"
          options={METER_OPTIONS}
          value={meter}
          separateLabel
          onChange={(e) => {
            const next = Number(e.target.value);
            setMeter(next);
            beatRef.current = 0;
            setActiveBeat(-1);
          }}
        />
      </div>
      <BeatLights count={meter} activeIndex={activeBeat} />
      <button id="start" type="button" onClick={toggleStart}>
        {running ? '■ Stop' : '▶ Start'}
      </button>
      <p id="error" role="status">
        {error}
      </p>
    </main>
  );
}

export default Metronome;
