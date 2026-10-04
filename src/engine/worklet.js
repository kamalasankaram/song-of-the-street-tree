// Live synthesis for stumps added from a photo. Runs on the audio thread and
// makes both tracks as they play, so a 22-minute side never exists as a file.
// Output 0 is the indexical track, output 1 the metaphorical one; the player
// crossfades them with gain nodes exactly as it does recorded tracks.
//
// processorOptions: { verts: Float64Array, species: {...}, rings, duration }
// port messages in: 'play', 'pause'. Out: { time } a few times a second,
// { ended: true } at the end of the side.
import { pointRecord } from './photo.js';
import { indexicalTrack, metaphoricalTrack } from './tracks.js';

class StumpProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const { verts, species, rings, duration } = options.processorOptions;
    const rd = pointRecord(verts);
    this.idx = indexicalTrack(rd, species, { duration, sampleRate });
    this.met = metaphoricalTrack(rd, rings, { duration, sampleRate });
    this.pos = 0;
    this.playing = false;
    this.lastReport = 0;
    this.port.onmessage = e => {
      if (e.data === 'play') this.playing = true;
      else if (e.data === 'pause') this.playing = false;
    };
  }

  process(inputs, outputs) {
    const outI = outputs[0][0], outM = outputs[1][0];
    if (!this.playing) return true;
    const n = Math.min(outI.length, this.idx.total - this.pos);
    if (n > 0) {
      outI.set(this.idx.render(this.pos, n));
      outM.set(this.met.next(n));
      this.pos += n;
    }
    if (this.pos >= this.idx.total) {
      this.playing = false;
      this.port.postMessage({ time: this.pos / sampleRate, ended: true });
    } else if (this.pos - this.lastReport >= sampleRate / 4) {
      this.lastReport = this.pos;
      this.port.postMessage({ time: this.pos / sampleRate });
    }
    return true;
  }
}

registerProcessor('stump-processor', StumpProcessor);
