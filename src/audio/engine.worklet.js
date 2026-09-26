// AudioWorklet that runs the engine synth on the audio thread. Main thread → port messages:
// {type:'profile', profile} · {type:'params', params} · {type:'event', event}.
import { EngineSynth } from './dsp/engineSynth.js';

class CarEngineProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.synth = new EngineSynth(sampleRate, 1 + Math.floor(Math.random() * 1e9));
    this.port.onmessage = ({ data }) => {
      if (data.type === 'profile') this.synth.setProfile(data.profile);
      else if (data.type === 'params') this.synth.set(data.params);
      else if (data.type === 'event') this.synth.trigger(data.event);
    };
  }

  process(inputs, outputs) {
    const [left, right] = outputs[0];
    this.synth.process(left, right ?? new Float32Array(left.length));
    return true;
  }
}

registerProcessor('car-engine', CarEngineProcessor);
