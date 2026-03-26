export type ParamType = 'number' | 'string' | 'boolean' | 'color' | 'enum';

export interface ParamDefinition {
  readonly key: string;
  readonly type: ParamType;
  readonly label: string;
  readonly defaultValue: number | string | boolean;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly options?: readonly string[];
}

export type ResolvedParams = Record<string, number | string | boolean>;

export interface EffectDefinition {
  readonly type: string;
  readonly name: string;
  readonly category: 'blur' | 'color' | 'transform' | 'stylize' | 'motion';
  readonly params: readonly ParamDefinition[];
  readonly description?: string;
}
