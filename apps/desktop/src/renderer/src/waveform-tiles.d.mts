export type WaveformTile = {clipId:string; key:string; left:number; width:number; startSec:number; spanSec:number};
export function planWaveformTiles(input:{clips:{id:string;timelineIn:number;timelineOut:number;sourceIn:number}[];pixelsPerFrame:number;fps:number;sourceFrames:number;scrollLeft:number;viewWidth:number;labelWidth?:number}):WaveformTile[];
