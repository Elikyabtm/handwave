"use client";

import { useEffect, useRef } from "react";
import {
  FilesetResolver,
  HandLandmarker,
  NormalizedLandmark,
} from "@mediapipe/tasks-vision";
import {
  playChord,
  stopChord,
  setVolume,
  setFilter,
} from "@/lib/audioEngine";

type HandTrackerProps = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  cameraActive: boolean;
};

type FingerState = {
  thumb: boolean;
  index: boolean;
  middle: boolean;
  ring: boolean;
  pinky: boolean;
};

type ChordMode =
  | "normal"
  | "octave"
  | "firstInversion"
  | "maj7"
  | "dominant7";

type HandData = {
  landmarks: NormalizedLandmark[];
  palm: { x: number; y: number };
  screenX: number;
};

const connections = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

const chromaticNotes = [
  "C", "C#", "D", "D#", "E", "F",
  "F#", "G", "G#", "A", "A#", "B",
];

const scaleRoots = ["C", "D", "E", "F", "G", "A", "B"];

function distance(a: NormalizedLandmark, b: NormalizedLandmark) {
  return Math.sqrt(
    Math.pow(a.x - b.x, 2) +
      Math.pow(a.y - b.y, 2) +
      Math.pow((a.z ?? 0) - (b.z ?? 0), 2)
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function lerp(start: number, end: number, amount: number) {
  return start + (end - start) * amount;
}

function getMainFingers(landmarks: NormalizedLandmark[]) {
  const wrist = landmarks[0];

  const isFingerExtended = (tipIndex: number, pipIndex: number) => {
    const tipDistance = distance(landmarks[tipIndex], wrist);
    const pipDistance = distance(landmarks[pipIndex], wrist);
    return tipDistance > pipDistance * 1.18;
  };

  return {
    index: isFingerExtended(8, 6),
    middle: isFingerExtended(12, 10),
    ring: isFingerExtended(16, 14),
    pinky: isFingerExtended(20, 18),
  };
}

function getDegreeFingerStates(
  landmarks: NormalizedLandmark[]
): FingerState {
  const fingers = getMainFingers(landmarks);
  const thumbTip = landmarks[4];
  const indexMcp = landmarks[5];
  const palmWidth = distance(landmarks[5], landmarks[17]);
  const thumbDistance = distance(thumbTip, indexMcp);
  const thumb = thumbDistance > palmWidth * 0.85;

  return {
    thumb,
    index: fingers.index,
    middle: fingers.middle,
    ring: fingers.ring,
    pinky: fingers.pinky,
  };
}

function getChordFingerStates(
  landmarks: NormalizedLandmark[]
): FingerState {
  const fingers = getMainFingers(landmarks);
  const thumbTip = landmarks[4];
  const indexMcp = landmarks[5];
  const pinkyMcp = landmarks[17];
  const palmWidth = distance(indexMcp, pinkyMcp);
  const thumbDistance = distance(thumbTip, indexMcp);
  const thumbRatio = thumbDistance / palmWidth;
  const thumb = thumbRatio > 1.05;

  return {
    thumb,
    index: fingers.index,
    middle: fingers.middle,
    ring: fingers.ring,
    pinky: fingers.pinky,
  };
}

function detectDegree(fingers: FingerState): number | null {
  const { thumb, index, middle, ring, pinky } = fingers;

  if (!thumb && index && !middle && !ring && !pinky) return 1;
  if (!thumb && index && middle && !ring && !pinky) return 2;
  if (!thumb && index && middle && ring && !pinky) return 3;
  if (!thumb && index && middle && ring && pinky) return 4;
  if (thumb && index && middle && ring && pinky) return 5;
  if (!thumb && index && !middle && !ring && pinky) return 6;
  if (thumb && index && !middle && !ring && pinky) return 7;

  return null;
}

function detectChordMode(fingers: FingerState): ChordMode | null {
  const { thumb, index, middle, ring, pinky } = fingers;

  if (!thumb && index && !middle && !ring && !pinky) return "normal";
  if (thumb && index && !middle && !ring && !pinky) return "octave";
  if (thumb && index && middle && !ring && !pinky) return "firstInversion";
  if (thumb && index && middle && !ring && pinky) return "maj7";
  if (thumb && index && middle && ring && pinky) return "dominant7";

  return null;
}

function getPalmCenter(landmarks: NormalizedLandmark[]) {
  const points = [
    landmarks[0],
    landmarks[5],
    landmarks[9],
    landmarks[13],
    landmarks[17],
  ];

  const x = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const y = points.reduce((sum, point) => sum + point.y, 0) / points.length;

  return { x, y };
}

function midiToNote(midi: number) {
  const note = chromaticNotes[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${note}${octave}`;
}

function rootToMidi(root: string, octave = 4) {
  const index = chromaticNotes.indexOf(root);
  return (octave + 1) * 12 + index;
}

function buildChord(root: string, mode: ChordMode) {
  const rootMidi = rootToMidi(root, 4);

  if (mode === "normal") {
    return [
      midiToNote(rootMidi),
      midiToNote(rootMidi + 4),
      midiToNote(rootMidi + 7),
    ];
  }

  if (mode === "octave") {
    return [
      midiToNote(rootMidi - 12),
      midiToNote(rootMidi - 8),
      midiToNote(rootMidi - 5),
    ];
  }

  if (mode === "firstInversion") {
    return [
      midiToNote(rootMidi + 4),
      midiToNote(rootMidi + 7),
      midiToNote(rootMidi + 12),
    ];
  }

  if (mode === "maj7") {
    return [
      midiToNote(rootMidi),
      midiToNote(rootMidi + 4),
      midiToNote(rootMidi + 7),
      midiToNote(rootMidi + 11),
    ];
  }

  return [
    midiToNote(rootMidi),
    midiToNote(rootMidi + 4),
    midiToNote(rootMidi + 7),
    midiToNote(rootMidi + 10),
  ];
}

function getModeLabel(mode: ChordMode) {
  switch (mode) {
    case "normal": return "NORMAL";
    case "octave": return "OCTAVE -1";
    case "firstInversion": return "1ST INVERSION";
    case "maj7": return "MAJ7";
    case "dominant7": return "DOMINANT 7";
  }
}

function getChordName(root: string, mode: ChordMode) {
  if (mode === "normal" || mode === "octave") return root;

  if (mode === "firstInversion") {
    const rootIndex = chromaticNotes.indexOf(root);
    const third = chromaticNotes[(rootIndex + 4) % 12];
    return `${root}/${third}`;
  }

  if (mode === "maj7") return `${root}maj7`;
  return `${root}7`;
}

export default function HandTracker({
  videoRef,
  cameraActive,
}: HandTrackerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const animationRef = useRef<number | null>(null);

  const degreeRef = useRef<number>(1);
  const degreeCandidateRef = useRef<number | null>(null);
  const degreeCandidateStartRef = useRef<number>(0);

  const chordModeRef = useRef<ChordMode>("normal");
  const chordCandidateRef = useRef<ChordMode | null>(null);
  const chordCandidateStartRef = useRef<number>(0);

  const lastChordRef = useRef<string>("");
  const isPlayingRef = useRef<boolean>(false);

  const volumeRef = useRef<number>(0.65);
  const filterRef = useRef<number>(0.75);

  const DEGREE_HOLD_TIME = 180;
  const CHORD_HOLD_TIME = 300;

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );

        const landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.6,
          minHandPresenceConfidence: 0.6,
          minTrackingConfidence: 0.6,
        });

        if (cancelled) {
          landmarker.close();
          return;
        }

        handLandmarkerRef.current = landmarker;
      } catch (error) {
        console.error("MediaPipe error:", error);
      }
    }

    initialize();

    return () => {
      cancelled = true;

      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }

      handLandmarkerRef.current?.close();
      stopChord();
    };
  }, []);

  useEffect(() => {
    if (!cameraActive) return;

    const detect = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const landmarker = handLandmarkerRef.current;

      if (!video || !canvas || !landmarker || video.readyState < 2) {
        animationRef.current = requestAnimationFrame(detect);
        return;
      }

      const width = video.videoWidth;
      const height = video.videoHeight;

      if (!width || !height) {
        animationRef.current = requestAnimationFrame(detect);
        return;
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, width, height);

      const now = performance.now();
      const results = landmarker.detectForVideo(video, now);

      const hands: HandData[] = results.landmarks.map((landmarks) => {
        const palm = getPalmCenter(landmarks);
        return {
          landmarks,
          palm,
          screenX: 1 - palm.x,
        };
      });

      hands.sort((a, b) => a.screenX - b.screenX);

      const harmonyHand = hands.length >= 2 ? hands[0] : null;
      const controlHand = hands.length >= 2 ? hands[hands.length - 1] : null;

      let detectedDegree: number | null = null;

      if (harmonyHand) {
        const degreeFingers = getDegreeFingerStates(harmonyHand.landmarks);
        detectedDegree = detectDegree(degreeFingers);

        if (detectedDegree !== degreeCandidateRef.current) {
          degreeCandidateRef.current = detectedDegree;
          degreeCandidateStartRef.current = now;
        }

        if (
          detectedDegree !== null &&
          detectedDegree === degreeCandidateRef.current &&
          now - degreeCandidateStartRef.current >= DEGREE_HOLD_TIME
        ) {
          degreeRef.current = detectedDegree;
        }
      }

      let detectedChordMode: ChordMode | null = null;

      if (controlHand) {
        const chordFingers = getChordFingerStates(controlHand.landmarks);
        detectedChordMode = detectChordMode(chordFingers);

        if (detectedChordMode !== chordCandidateRef.current) {
          chordCandidateRef.current = detectedChordMode;
          chordCandidateStartRef.current = now;
        }

        if (
          detectedChordMode !== null &&
          detectedChordMode === chordCandidateRef.current &&
          now - chordCandidateStartRef.current >= CHORD_HOLD_TIME
        ) {
          chordModeRef.current = detectedChordMode;
        }

        const x = controlHand.screenX;
        const rawFilter = clamp((x - 0.15) / 0.7, 0, 1);
        filterRef.current = lerp(filterRef.current, rawFilter, 0.1);
        setFilter(filterRef.current);

        const y = controlHand.palm.y;
        const rawVolume = clamp(1 - (y - 0.15) / 0.7, 0, 1);
        volumeRef.current = lerp(volumeRef.current, rawVolume, 0.1);
        setVolume(volumeRef.current);
      }

      const degree = degreeRef.current;
      const mode = chordModeRef.current;
      const root = scaleRoots[degree - 1];
      const chord = buildChord(root, mode);
      const chordKey = chord.join("-");

      const chordGestureStable =
        controlHand !== null &&
        detectedChordMode !== null &&
        detectedChordMode === chordModeRef.current;

      if (chordGestureStable) {
        if (!isPlayingRef.current || chordKey !== lastChordRef.current) {
          playChord(chord);
          isPlayingRef.current = true;
          lastChordRef.current = chordKey;
        }
      } else if (isPlayingRef.current) {
        stopChord();
        isPlayingRef.current = false;
        lastChordRef.current = "";
      }

      hands.forEach((hand, index) => {
        const isHarmony = index === 0;
        ctx.strokeStyle = isHarmony
          ? "rgba(255,255,255,0.8)"
          : "rgba(255,255,255,0.45)";
        ctx.lineWidth = isHarmony ? 3 : 2;

        connections.forEach(([start, end]) => {
          const a = hand.landmarks[start];
          const b = hand.landmarks[end];

          ctx.beginPath();
          ctx.moveTo(width - a.x * width, a.y * height);
          ctx.lineTo(width - b.x * width, b.y * height);
          ctx.stroke();
        });

        hand.landmarks.forEach((point) => {
          const x = width - point.x * width;
          const y = point.y * height;

          ctx.beginPath();
          ctx.arc(x, y, 4, 0, Math.PI * 2);
          ctx.fillStyle = isHarmony
            ? "rgba(255,255,255,0.85)"
            : "rgba(255,255,255,0.6)";
          ctx.fill();
        });

        const palmX = width - hand.palm.x * width;
        const palmY = hand.palm.y * height;

        ctx.beginPath();
        ctx.arc(palmX, palmY, 13, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();

        ctx.textAlign = "center";
        ctx.font = "bold 13px Arial";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(isHarmony ? "DEGREE" : "CHORD", palmX, palmY + 33);
      });

      const degrees = ["I", "II", "III", "IV", "V", "VI", "VII"];

      degrees.forEach((label, index) => {
        const number = index + 1;
        const x = width / 2 - 240 + index * 80;
        const active = number === degree;

        ctx.textAlign = "center";
        ctx.font = active ? "bold 27px Arial" : "17px Arial";
        ctx.fillStyle = active ? "#ffffff" : "rgba(255,255,255,0.25)";
        ctx.fillText(label, x, 55);

        if (active) {
          ctx.beginPath();
          ctx.arc(x, 70, 3, 0, Math.PI * 2);
          ctx.fillStyle = "#ffffff";
          ctx.fill();
        }
      });

      const chordName = getChordName(root, mode);

      ctx.textAlign = "center";
      ctx.font = "bold 68px Arial";
      ctx.fillStyle = isPlayingRef.current
        ? "#ffffff"
        : "rgba(255,255,255,0.4)";
      ctx.fillText(chordName, width / 2, 145);

      ctx.font = "bold 14px Arial";
      ctx.fillStyle = "rgba(255,255,255,0.65)";
      ctx.fillText(getModeLabel(mode), width / 2, 180);

      ctx.font = "13px Arial";
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillText(chord.join("  •  "), width / 2, 205);

      const modes: { mode: ChordMode; label: string }[] = [
        { mode: "normal", label: "NORMAL" },
        { mode: "octave", label: "OCT -1" },
        { mode: "firstInversion", label: "1ST INV" },
        { mode: "maj7", label: "MAJ7" },
        { mode: "dominant7", label: "DOM7" },
      ];

      const spacing = 105;
      const startX = width / 2 - ((modes.length - 1) * spacing) / 2;

      modes.forEach((item, index) => {
        const x = startX + index * spacing;
        const active = item.mode === mode;

        ctx.textAlign = "center";
        ctx.font = active ? "bold 13px Arial" : "11px Arial";
        ctx.fillStyle = active ? "#ffffff" : "rgba(255,255,255,0.25)";
        ctx.fillText(item.label, x, 250);

        if (active) {
          ctx.beginPath();
          ctx.arc(x, 262, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = "#ffffff";
          ctx.fill();
        }
      });

      const barWidth = 210;
      const barX = width - 270;

      ctx.textAlign = "left";
      ctx.font = "12px Arial";
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.fillText(
        `FILTER ${Math.round(filterRef.current * 100)}%`,
        barX,
        height - 105
      );

      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fillRect(barX, height - 95, barWidth, 7);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(barX, height - 95, barWidth * filterRef.current, 7);

      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.fillText(
        `VOLUME ${Math.round(volumeRef.current * 100)}%`,
        barX,
        height - 60
      );

      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fillRect(barX, height - 50, barWidth, 7);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(barX, height - 50, barWidth * volumeRef.current, 7);

      ctx.textAlign = "left";
      ctx.font = "bold 12px Arial";
      ctx.fillStyle = "rgba(255,255,255,0.65)";
      ctx.fillText(`DEGREE DETECTED: ${detectedDegree ?? "—"}`, 35, height - 90);
      ctx.fillText(
        `CHORD DETECTED: ${
          detectedChordMode ? getModeLabel(detectedChordMode) : "—"
        }`,
        35,
        height - 68
      );

      ctx.fillStyle = isPlayingRef.current
        ? "#ffffff"
        : "rgba(255,255,255,0.35)";
      ctx.fillText(
        isPlayingRef.current ? "● PLAYING" : "○ WAITING FOR CHORD",
        35,
        height - 45
      );

      animationRef.current = requestAnimationFrame(detect);
    };

    detect();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      stopChord();
    };
  }, [cameraActive, videoRef]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-[5] h-full w-full object-cover"
    />
  );
}
