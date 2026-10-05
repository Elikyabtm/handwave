"use client";

import { useRef, useState } from "react";
import HandTracker from "@/components/HandTracker";
import { startAudio } from "@/lib/audioEngine";

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [error, setError] = useState("");

  const startCamera = async () => {
    try {
      setError("");
      await startAudio();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: "user" },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraActive(true);
      }
    } catch (err) {
      console.error(err);
      setError("Impossible d'accéder à la caméra.");
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-black text-white">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`absolute inset-0 h-full w-full scale-x-[-1] object-cover transition-opacity duration-700 ${
          cameraActive ? "opacity-60" : "opacity-0"
        }`}
      />

      <HandTracker videoRef={videoRef} cameraActive={cameraActive} />

      <div className="pointer-events-none absolute inset-0 z-[6] bg-gradient-to-b from-black/20 via-transparent to-black/70" />

      <div className="pointer-events-none relative z-10 flex flex-col items-center gap-8 text-center">
        <div>
          <p className="mb-3 text-xs tracking-[0.5em] text-white/40">GESTURE INSTRUMENT</p>
          <h1 className="text-6xl font-semibold tracking-tight md:text-8xl">
            HAND<span className="text-white/30">WAVE</span>
          </h1>
          <p className="mt-5 text-sm text-white/50">Transform your hands into music.</p>
        </div>

        {!cameraActive ? (
          <button
            onClick={startCamera}
            className="pointer-events-auto rounded-full border border-white/20 bg-white px-8 py-4 text-sm font-medium text-black transition hover:scale-105 hover:bg-white/90"
          >
            START EXPERIENCE
          </button>
        ) : (
          <div className="flex items-center gap-2 text-xs tracking-widest text-white/50">
            <span className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
            CAMERA ACTIVE
          </div>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>

      <div className="absolute bottom-8 left-0 right-0 z-10 flex justify-center">
        <p className="text-[10px] tracking-[0.4em] text-white/20">MOVE • CREATE • PLAY</p>
      </div>
    </main>
  );
}
