/**
 * Layout templates for the Record view.
 * Each template describes a camera position, screen layout, and aspect ratio.
 * These are UI-only presets — no project state integration yet.
 */

export interface LayoutTemplate {
  id: string;
  name: string;
  description: string;
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:3';
  cameraPosition: 'none' | 'corner-br' | 'corner-bl' | 'corner-tr' | 'corner-tl' | 'center' | 'hidden';
  screenLayout: 'full-screen' | 'pip' | 'split' | 'presentation';
}

export const LAYOUT_TEMPLATES: LayoutTemplate[] = [
  {
    id: 'screen-only-16x9',
    name: 'Screen Only',
    description: 'Full screen capture, no camera',
    aspectRatio: '16:9',
    cameraPosition: 'none',
    screenLayout: 'full-screen',
  },
  {
    id: 'screen-cam-br-16x9',
    name: 'Screen + Camera',
    description: 'Screen with camera in bottom-right',
    aspectRatio: '16:9',
    cameraPosition: 'corner-br',
    screenLayout: 'pip',
  },
  {
    id: 'screen-cam-bl-16x9',
    name: 'Screen + Camera (Left)',
    description: 'Screen with camera in bottom-left',
    aspectRatio: '16:9',
    cameraPosition: 'corner-bl',
    screenLayout: 'pip',
  },
  {
    id: 'presentation-16x9',
    name: 'Presentation',
    description: 'Slides with speaker overlay',
    aspectRatio: '16:9',
    cameraPosition: 'corner-tr',
    screenLayout: 'presentation',
  },
  {
    id: 'tutorial-16x9',
    name: 'Tutorial',
    description: 'Screen recording with face cam',
    aspectRatio: '16:9',
    cameraPosition: 'corner-br',
    screenLayout: 'pip',
  },
  {
    id: 'social-vertical',
    name: 'Social Vertical',
    description: 'Vertical format for social media',
    aspectRatio: '9:16',
    cameraPosition: 'center',
    screenLayout: 'split',
  },
  {
    id: 'talking-head',
    name: 'Talking Head',
    description: 'Camera-focused square format',
    aspectRatio: '1:1',
    cameraPosition: 'center',
    screenLayout: 'full-screen',
  },
  {
    id: 'minimal-4x3',
    name: 'Classic',
    description: 'Traditional 4:3 screen capture',
    aspectRatio: '4:3',
    cameraPosition: 'none',
    screenLayout: 'full-screen',
  },
];
