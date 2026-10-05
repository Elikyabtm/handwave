import * as Tone from "tone";

let synth: Tone.PolySynth | null = null;
let filter: Tone.Filter | null = null;
let volume: Tone.Volume | null = null;

let audioStarted = false;
let currentChord: string[] = [];

export async function startAudio() {
  if (audioStarted) return;

  await Tone.start();

  volume = new Tone.Volume(-10).toDestination();

  filter = new Tone.Filter({
    frequency: 8000,
    type: "lowpass",
    rolloff: -24,
  }).connect(volume);

  synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "triangle" },
    envelope: {
      attack: 0.06,
      decay: 0.2,
      sustain: 0.65,
      release: 0.55,
    },
  }).connect(filter);

  synth.volume.value = -4;
  audioStarted = true;
}

export function playChord(notes: string[]) {
  if (!synth || !audioStarted) return;

  const sameChord =
    currentChord.length === notes.length &&
    currentChord.every((note, index) => note === notes[index]);

  if (sameChord) return;

  if (currentChord.length > 0) {
    synth.triggerRelease(currentChord);
  }

  synth.triggerAttack(notes);
  currentChord = [...notes];
}

export function stopChord() {
  if (!synth) return;

  if (currentChord.length > 0) {
    synth.triggerRelease(currentChord);
    currentChord = [];
  }
}

export function setVolume(amount: number) {
  if (!volume) return;

  const value = Math.min(Math.max(amount, 0), 1);
  const db = -36 + value * 36;
  volume.volume.rampTo(db, 0.08);
}

export function setFilter(amount: number) {
  if (!filter) return;

  const value = Math.min(Math.max(amount, 0), 1);
  const minFrequency = 180;
  const maxFrequency = 14000;
  const frequency = minFrequency * Math.pow(maxFrequency / minFrequency, value);

  filter.frequency.rampTo(frequency, 0.08);
}

export function stopAllNotes() {
  if (!synth) return;

  synth.releaseAll();
  currentChord = [];
}
