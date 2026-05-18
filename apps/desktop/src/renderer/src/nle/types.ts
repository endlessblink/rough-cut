// Structural types so the NLE module doesn't depend on main.tsx's internal
// ProjectState shape. main.tsx passes its ProjectState through as-is.

export type NleAsset = {
  id?: string;
  type?: string;
  name?: string;
  label?: string;
  duration?: number;
  thumbnailUrl?: string;
} & Record<string, unknown>;

export type NleProject = {
  path: string;
  document: {
    name: string;
    assets?: ReadonlyArray<NleAsset>;
    composition?: { duration?: number } & Record<string, unknown>;
  } & Record<string, unknown>;
  recording?: ({ fps?: number; duration?: number } & Record<string, unknown>) | null;
  mediaUrl?: string | null;
  cameraMediaUrl?: string | null;
} & Record<string, unknown>;
