'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Download, Upload } from 'lucide-react';

export default function Home() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [originalDuration, setOriginalDuration] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setAudioFile(file);
      setIsProcessing(true);
      try {
        const url = URL.createObjectURL(file);
        setAudioUrl(url);
        
        // Get duration using audio element
        const audio = new Audio(url);
        audio.addEventListener('loadedmetadata', () => {
          setOriginalDuration(audio.duration);
          setIsProcessing(false);
        });

        // Initialize AudioContext
        audioContextRef.current = new AudioContext();
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
        
        // Create source node
        sourceRef.current = audioContextRef.current.createBufferSource();
        sourceRef.current.buffer = audioBuffer;
        sourceRef.current.playbackRate.value = playbackRate;
        sourceRef.current.connect(audioContextRef.current.destination);
      } catch (error) {
        console.error('Error processing file:', error);
        setIsProcessing(false);
      }
    }
  };

  const handleSpeedChange = (value: number[]) => {
    const rate = value[0];
    setPlaybackRate(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  };

  const handleDownload = async () => {
    if (!audioFile || !audioContextRef.current) return;

    setIsProcessing(true);
    try {
      const arrayBuffer = await audioFile.arrayBuffer();
      const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);

      // Create offline context for processing
      const offlineContext = new OfflineAudioContext(
        audioBuffer.numberOfChannels,
        Math.ceil(audioBuffer.length / playbackRate),
        audioBuffer.sampleRate
      );

      // Create source node
      const source = offlineContext.createBufferSource();
      source.buffer = audioBuffer;

      // Create a ScriptProcessorNode for pitch-preserved time stretching
      const frameSize = 2048;
      const processor = offlineContext.createScriptProcessor(frameSize, 1, 1);
      
      let phase = 0;
      let lastPhase = 0;
      let sumPhase = 0;
      let expectedPhase = 0;
      let omega = (2 * Math.PI * frameSize) / audioBuffer.sampleRate;

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const outputData = e.outputBuffer.getChannelData(0);

        for (let i = 0; i < frameSize; i++) {
          // Phase vocoder algorithm
          phase = Math.atan2(inputData[i], lastPhase);
          let unwrappedPhase = phase + 2 * Math.PI * Math.round((expectedPhase - phase) / (2 * Math.PI));
          let instantFreq = (unwrappedPhase - lastPhase) / omega;

          // Maintain pitch while changing speed
          sumPhase += instantFreq * omega * playbackRate;
          outputData[i] = Math.cos(sumPhase);

          lastPhase = phase;
          expectedPhase += omega * playbackRate;
        }
      };

      // Connect the nodes
      source.connect(processor);
      processor.connect(offlineContext.destination);
      source.start(0);

      // Render the processed audio
      const renderedBuffer = await offlineContext.startRendering();

      // Convert to WAV
      const wavBlob = encodeWAV(renderedBuffer);
      const url = URL.createObjectURL(wavBlob);

      // Trigger download
      const link = document.createElement('a');
      link.href = url;
      link.download = `speed-adjusted-${audioFile.name.replace(/\.[^/.]+$/, '')}.wav`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      console.error('Error processing audio:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const encodeWAV = (buffer: AudioBuffer) => {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const length = buffer.length;
    const bitsPerSample = 16;
    const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
    const blockAlign = (numChannels * bitsPerSample) / 8;
    const dataSize = length * numChannels * 2;

    const bufferSize = 44 + dataSize;
    const arrayBuffer = new ArrayBuffer(bufferSize);
    const view = new DataView(arrayBuffer);

    // Write WAV header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size
    view.setUint16(20, 1, true); // AudioFormat (PCM)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    // Write PCM data
    let offset = 44;
    for (let i = 0; i < length; i++) {
      for (let channel = 0; channel < numChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    }

    return new Blob([view], { type: 'audio/wav' });
  };

  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  const adjustedDuration = originalDuration / playbackRate;

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'}`}>
      <div className="container mx-auto p-4">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Audio Speed Control</h1>
          <div className="flex items-center space-x-2">
            <Label htmlFor="dark-mode">Dark Mode</Label>
            <Switch id="dark-mode" checked={isDarkMode} onCheckedChange={setIsDarkMode} />
          </div>
        </div>

        <div className="max-w-lg mx-auto space-y-6">
          <div className="space-y-2">
            <Label htmlFor="audio-file">Upload Audio File</Label>
            <div className="flex items-center justify-center w-full">
              <label
                htmlFor="audio-file"
                className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer ${
                  isDarkMode ? 'border-gray-700 hover:bg-gray-800' : 'border-gray-300 hover:bg-gray-100'
                }`}
              >
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Upload className="w-8 h-8 mb-2" />
                  <p className="text-sm">Click to upload or drag and drop</p>
                  <p className="text-xs">MP3, WAV, OGG, etc.</p>
                </div>
                <input
                  id="audio-file"
                  type="file"
                  accept="audio/*"
                  onChange={handleFileChange}
                  className="hidden"
                  disabled={isProcessing}
                />
              </label>
            </div>
          </div>

          {audioFile && (
            <>
              <div className="space-y-2">
                <Label htmlFor="speed">Playback Speed: {playbackRate.toFixed(1)}x</Label>
                <Slider
                  id="speed"
                  defaultValue={[1]}
                  min={0.5}
                  max={2}
                  step={0.1}
                  onValueChange={handleSpeedChange}
                />
              </div>

              <div className="space-y-2">
                <audio
                  ref={audioRef}
                  src={audioUrl || ''}
                  controls
                  className="w-full"
                />
                <div className="grid grid-cols-2 gap-4 text-sm text-center">
                  <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800">
                    <div className="font-medium">Original Duration</div>
                    <div>{formatDuration(originalDuration)}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800">
                    <div className="font-medium">Adjusted Duration</div>
                    <div>{formatDuration(adjustedDuration)}</div>
                  </div>
                </div>
                <div className="text-center text-sm text-gray-600 dark:text-gray-400">
                  Difference: {formatDuration(Math.abs(originalDuration - adjustedDuration))}
                </div>
              </div>

              <Button 
                onClick={handleDownload} 
                className="w-full"
                disabled={isProcessing}
              >
                <Download className="mr-2 h-4 w-4" />
                {isProcessing ? 'Processing...' : 'Download Processed Audio'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}
