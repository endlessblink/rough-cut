import {buildWaveformArgs} from '../apps/desktop/src/main/clip-visuals.mjs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
const ff=resolve('dist/rough-cut-mvp-linux-x64/resources/bin/ffmpeg');
const source=resolve('../fixtures/silence-quiet-loud-antiphase.wav');
execFileSync(ff,['-nostdin','-y','-v','error','-f','lavfi','-i',String.raw`aevalsrc=if(lt(t\,2)\,0\,if(lt(t\,4)\,0.02\,if(lt(t\,6)\,0.8\,0)))*sin(2*PI*440*t)|-if(lt(t\,2)\,0\,if(lt(t\,4)\,0.02\,if(lt(t\,6)\,0.8\,0)))*sin(2*PI*440*t):s=48000:d=8`,'-c:a','pcm_s16le',source],{stdio:'inherit'});
execFileSync(ff,buildWaveformArgs(source,resolve('../evidence/synthetic-waveform.png'),1024),{stdio:'inherit'});
