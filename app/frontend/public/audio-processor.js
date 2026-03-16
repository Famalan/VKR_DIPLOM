class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._bufferSize = 1600;
    this._buffer = new Float32Array(this._bufferSize);
    this._bufferIndex = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channelData = input[0];

    const inputSampleRate = sampleRate;
    const targetSampleRate = 16000;
    const ratio = inputSampleRate / targetSampleRate;

    for (let i = 0; i < channelData.length; i += ratio) {
      const idx = Math.floor(i);
      if (idx < channelData.length) {
        this._buffer[this._bufferIndex] = channelData[idx];
        this._bufferIndex++;

        if (this._bufferIndex >= this._bufferSize) {
          const pcm16 = new Int16Array(this._bufferSize);
          for (let j = 0; j < this._bufferSize; j++) {
            const s = Math.max(-1, Math.min(1, this._buffer[j]));
            pcm16[j] = s < 0 ? s * 0x8000 : s * 0x7fff;
          }

          this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
          this._buffer = new Float32Array(this._bufferSize);
          this._bufferIndex = 0;
        }
      }
    }

    return true;
  }
}

registerProcessor("audio-processor", AudioProcessor);
