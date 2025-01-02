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

  const handleDownload = () => {
    if (audioUrl) {
      const link = document.createElement('a');
      link.href = audioUrl;
      link.download = `speed-adjusted-${audioFile?.name || 'audio'}.mp3`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
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
