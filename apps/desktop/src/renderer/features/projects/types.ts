export interface RecentProject {
  id: string;
  name: string;
  filePath: string;
  modifiedAt: string;        // ISO 8601
  resolution?: string;       // e.g. "1920x1080"
  thumbnailDataUrl?: string; // base64 PNG or undefined
}
