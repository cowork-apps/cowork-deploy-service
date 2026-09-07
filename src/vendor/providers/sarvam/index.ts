import type { ModelInfo } from "../../contracts/index.js";
import type { SpeechProvider } from "../interfaces.js";

const STT: ModelInfo[] = [
  { id: "saaras:v4", name: "Saaras v4", provider: "sarvam", contextLength: null, inputModalities: ["audio"], supportsTools: false, promptUsdPerM: null, completionUsdPerM: null, recommended: true },
  { id: "saaras:v3", name: "Saaras v3", provider: "sarvam", contextLength: null, inputModalities: ["audio"], supportsTools: false, promptUsdPerM: null, completionUsdPerM: null, recommended: false },
];

export class SarvamSpeech implements SpeechProvider {
  id = "sarvam" as const;
  constructor(private apiKey: string) {}
  listSttModels() { return STT; }

  async transcribe(audio: Blob | Uint8Array, opts: { model: string; languageCode?: string }) {
    const fd = new FormData();
    fd.append("file", audio instanceof Blob ? audio : new Blob([audio as any], { type: "audio/wav" }), "audio.wav");
    fd.append("model", opts.model);
    fd.append("language_code", opts.languageCode ?? "unknown");
    const res = await fetch("https://api.sarvam.ai/speech-to-text", { method: "POST", headers: { "api-subscription-key": this.apiKey }, body: fd });
    if (!res.ok) throw new Error(`Sarvam STT ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const r: any = await res.json();
    return { text: r.transcript ?? "", languageCode: r.language_code };
  }
}
