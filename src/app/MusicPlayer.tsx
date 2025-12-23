/* eslint-disable */
/* @ts-nocheck */

"use client";

import { useEffect, useRef, useState } from "react";
import * as handpose from "@tensorflow-models/handpose";
import "@tensorflow/tfjs-backend-webgl";

import {
  Search,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  Repeat,
  Shuffle,
  Music2,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

interface Song {
  id: string;
  title: string;
  artist: string;
  image: string;
  url: string;
}

export default function MusicPlayer() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const modelRef = useRef<handpose.HandPose | null>(null);

  const lastVolumeChange = useRef(0);

  const [query, setQuery] = useState("");
  const [songs, setSongs] = useState<Song[]>([]);
  const [current, setCurrent] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(70);

  /* ---------------- AUDIO ---------------- */
  function setUnifiedVolume(v: number) {
    v = Math.min(100, Math.max(0, v));
    setVolume(v);
    if (audioRef.current) audioRef.current.volume = v / 100;
  }

  function adjustVolume(delta: number) {
    if (!audioRef.current) return;
    let v = Math.round(audioRef.current.volume * 100);
    v = Math.min(100, Math.max(0, v + delta));
    setUnifiedVolume(v);
  }

  function togglePlayPause() {
    if (!audioRef.current) return;
    audioRef.current.paused
      ? audioRef.current.play()
      : audioRef.current.pause();
  }

  function format(t: number) {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  }

  /* ---------------- MODEL + CAMERA ---------------- */
  useEffect(() => {
    let mounted = true;

    async function setup() {
      await handpose.load().then((model) => {
        modelRef.current = model;
      });

      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (!mounted) return;

      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();

      detectFrame();
    }

    async function detectFrame() {
      if (!videoRef.current || !canvasRef.current || !modelRef.current) {
        rafRef.current = requestAnimationFrame(detectFrame);
        return;
      }

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const predictions = await modelRef.current.estimateHands(video);

      if (predictions.length > 0) {
        const landmarks = predictions[0].landmarks;
        const palm = landmarks[9];
        const indexTip = landmarks[8];
        const thumbTip = landmarks[4];
        const pinkyTip = landmarks[20];

        const vecIndex = [indexTip[0] - palm[0], indexTip[1] - palm[1]];
        const vecThumb = [thumbTip[0] - palm[0], thumbTip[1] - palm[1]];

        const angle =
          Math.atan2(vecIndex[1], vecIndex[0]) -
          Math.atan2(vecThumb[1], vecThumb[0]);
        let angleDeg = (angle * 180) / Math.PI;

        if (angleDeg > 180) angleDeg -= 360;
        if (angleDeg < -180) angleDeg += 360;

        const maxAngle = 90;
        const maxRotSpeed = 3;
        let rotationSpeed =
          (Math.min(Math.abs(angleDeg), maxAngle) / maxAngle) * maxRotSpeed;

        const dxFingers = indexTip[0] - pinkyTip[0];
        const isRightHand = dxFingers < 0;

        rotationSpeed = isRightHand
          ? -rotationSpeed * Math.sign(angleDeg)
          : rotationSpeed * Math.sign(angleDeg);

        if (
          Math.abs(rotationSpeed) > 0.05 &&
          Date.now() - lastVolumeChange.current > 50
        ) {
          adjustVolume(rotationSpeed);
          lastVolumeChange.current = Date.now();
        }
      } else {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#888";
          ctx.fillText("Show fingers", 10, 30);
        }
      }

      rafRef.current = requestAnimationFrame(detectFrame);
    }

    setup();

    return () => {
      mounted = false;

      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const videoEl = videoRef.current;
      if (videoEl?.srcObject) {
        (videoEl.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  /* ---------------- SONG SEARCH & PLAY ---------------- */
  async function searchSongs(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setSongs([]);
    const res = await fetch(
      `https://jiosaavn-api-two-xi.vercel.app/api/search/songs?query=${encodeURIComponent(
        query
      )}`
    );
    const data = await res.json();
    setSongs(
      (data.data.results || []).map((s: any) => ({
        id: s.id,
        title: s.name,
        artist: s.artists.primary?.[0]?.name || "Unknown",
        image: s.image?.[2]?.url,
        url: s.downloadUrl?.[4]?.url,
      }))
    );
    setLoading(false);
  }

  function playSong(i: number) {
    setCurrent(i);
    setTimeout(() => audioRef.current?.play(), 80);
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-100 via-white to-white w-full">
      {/* Hidden canvas + video for gesture */}
      <canvas ref={canvasRef} className="hidden" />
      <video ref={videoRef} className="hidden" />

      {/* NAVBAR */}
      <header className="sticky py-2 px-4 top-0 z-50 border-b border-zinc-200 bg-white/70 backdrop-blur-xl">
        <div className="mx-auto flex items-center gap-5 px-8 py-3">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-black p-1.5">
              <Music2 className="h-4 w-4 text-white" />
            </div>
            <span className="text-base font-semibold tracking-tight">
              Soundwave
            </span>
          </div>

          <form onSubmit={searchSongs} className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search songs, artists, albums"
                className="w-full rounded-xl border border-zinc-200 bg-zinc-100/60 py-2.5 pl-10 pr-4 text-sm focus:border-black focus:ring-0"
              />
            </div>
          </form>
        </div>
      </header>

      {/* CONTENT */}
      <main
        className={cn(
          "mx-auto min-h-[80dvh] px-8 py-14",
          (loading || songs.length === 0) &&
            "flex flex-col items-center justify-center"
        )}
      >
        {loading && (
          <div className="py-24 text-center text-zinc-500">
            Searching for music…
          </div>
        )}

        {!loading && songs.length === 0 && (
          <div className="py-24 text-center">
            <p className="text-xl font-medium">Discover music</p>
            <p className="mt-2 text-zinc-500">Search to start listening</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-5">
          {songs.map((s, i) => (
            <Card
              key={s.id}
              onClick={() => playSong(i)}
              className="group cursor-pointer rounded-3xl border-0 bg-zinc-100/60 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.25)] transition hover:-translate-y-1"
            >
              <CardContent className="p-0">
                <div className="relative aspect-square overflow-hidden rounded-3xl">
                  <img
                    src={s.image}
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-black/30 opacity-0 transition group-hover:opacity-100" />
                  <div className="absolute bottom-4 right-4 translate-y-4 opacity-0 transition group-hover:translate-y-0 group-hover:opacity-100">
                    <div className="rounded-full bg-white p-4 shadow-xl">
                      {isPlaying && current === i ? (
                        <Pause className="h-5 w-5" />
                      ) : (
                        <Play className="ml-0.5 h-5 w-5" />
                      )}
                    </div>
                  </div>
                </div>
                <div className="px-4 pb-5 pt-4">
                  <p className="truncate text-sm font-medium">{s.title}</p>
                  <p className="truncate text-xs text-zinc-500">{s.artist}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>

      {/* PLAYER */}
      <footer className="sticky  py-2 px-4 inset-x-0 bottom-0 z-50 border-t border-zinc-200 bg-white/80 backdrop-blur-xl">
        {current !== null && songs[current] && (
          <div className="mx-auto px-8 py-3">
            <div className="grid grid-cols-[1fr_2fr_1fr] items-center gap-4">
              <div className="flex items-center gap-3">
                <img
                  src={songs[current].image}
                  className="h-12 w-12 rounded-lg object-cover"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {songs[current].title}
                  </p>
                  <p className="truncate text-xs text-zinc-500">
                    {songs[current].artist}
                  </p>
                </div>
              </div>

              <div className="flex flex-col items-center gap-2">
                <div className="flex items-center gap-4">
                  <Shuffle className="h-3.5 w-3.5 text-zinc-400" />
                  <SkipBack
                    className="h-5 w-5 cursor-pointer"
                    onClick={() => current > 0 && playSong(current - 1)}
                  />
                  <button
                    onClick={togglePlayPause}
                    className="grid h-11 w-11 place-items-center rounded-full bg-black text-white shadow-lg"
                  >
                    {isPlaying ? (
                      <Pause className="h-5 w-5" />
                    ) : (
                      <Play className="ml-0.5 h-5 w-5" />
                    )}
                  </button>
                  <SkipForward
                    className="h-5 w-5 cursor-pointer"
                    onClick={() =>
                      current < songs.length - 1 && playSong(current + 1)
                    }
                  />
                  <Repeat className="h-3.5 w-3.5 text-zinc-400" />
                </div>

                <div className="flex w-full items-center gap-2">
                  <span className="text-xs tabular-nums text-zinc-500">
                    {format(currentTime)}
                  </span>
                  <Slider
                    value={[duration ? (currentTime / duration) * 100 : 0]}
                    onValueChange={(v) => {
                      if (!audioRef.current) return;
                      const t = (v[0] / 100) * duration;
                      audioRef.current.currentTime = t;
                      setCurrentTime(t);
                    }}
                  />
                  <span className="text-xs tabular-nums text-zinc-500">
                    {format(duration)}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <Volume2 className="h-4 w-4 text-zinc-400" />
                <Slider
                  value={[volume]}
                  max={100}
                  onValueChange={(v) => setUnifiedVolume(v[0])}
                  className="w-24"
                />
              </div>
            </div>

            <audio
              ref={audioRef}
              src={songs[current]?.url}
              onTimeUpdate={() => {
                if (!audioRef.current) return;
                setCurrentTime(audioRef.current.currentTime);
                setDuration(audioRef.current.duration);
              }}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            />
          </div>
        )}
      </footer>
    </div>
  );
}
