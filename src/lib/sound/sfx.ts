"use client";

import { Howl } from "howler";

export type SfxName = "draw" | "place" | "money" | "steal" | "no" | "turn" | "win";

const FREQUENCIES: Record<SfxName, number[]> = {
  draw: [440, 660],
  place: [320, 420],
  money: [660, 880, 1040],
  steal: [220, 180],
  no: [180, 150, 120],
  turn: [520, 680],
  win: [520, 660, 880, 1040],
};

const cache = new Map<SfxName, Howl>();

function toneUrl(frequencies: number[], durationSeconds = 0.22): string {
  const sampleRate = 22050;
  const samples = Math.floor(sampleRate * durationSeconds);
  const headerSize = 44;
  const buffer = new ArrayBuffer(headerSize + samples * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples * 2, true);

  for (let sample = 0; sample < samples; sample += 1) {
    const time = sample / sampleRate;
    const step = Math.min(frequencies.length - 1, Math.floor((sample / samples) * frequencies.length));
    const envelope = Math.sin(Math.PI * (sample / samples));
    const value = Math.sin(2 * Math.PI * frequencies[step] * time) * envelope * 0.18;
    view.setInt16(headerSize + sample * 2, Math.max(-1, Math.min(1, value)) * 32767, true);
  }

  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}

export function playSfx(name: SfxName, muted: boolean): void {
  if (muted || typeof window === "undefined") {
    return;
  }

  let howl = cache.get(name);
  if (!howl) {
    howl = new Howl({
      src: [toneUrl(FREQUENCIES[name])],
      format: ["wav"],
      volume: name === "win" ? 0.42 : 0.25,
    });
    cache.set(name, howl);
  }

  howl.play();
}
