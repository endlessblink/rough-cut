import { z } from 'zod';
import type React from 'react';
import { TitleCard } from './compositions/TitleCard.js';
import { CaptionOverlay } from './compositions/CaptionOverlay.js';
import { LowerThird } from './compositions/LowerThird.js';
import { TextPop } from './compositions/TextPop.js';
import { GradientBackground } from './compositions/GradientBackground.js';
import { ZoomTitle } from './compositions/ZoomTitle.js';
import { IntroBumper } from './compositions/IntroBumper.js';
import { Outro } from './compositions/Outro.js';

export type TemplateCategory = 'titles' | 'captions' | 'lower-thirds' | 'transitions' | 'backgrounds';

export interface TemplateRegistryEntry {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  component: React.FC<any>;
  schema: z.ZodObject<any>;
  defaultProps: Record<string, unknown>;
  defaultDurationFrames: number;
}

// --- Schemas ---

const titleCardSchema = z.object({
  title: z.string().default('My Video'),
  subtitle: z.string().default('A Rough Cut Production'),
  backgroundColor: z.string().default('#0f0f0f'),
  textColor: z.string().default('#ffffff'),
  accentColor: z.string().default('#2563eb'),
});

const captionOverlaySchema = z.object({
  words: z.array(z.object({
    text: z.string(),
    startFrame: z.number(),
    endFrame: z.number(),
  })).default([
    { text: 'Hello', startFrame: 0, endFrame: 15 },
    { text: 'and', startFrame: 15, endFrame: 22 },
    { text: 'welcome', startFrame: 22, endFrame: 40 },
    { text: 'to', startFrame: 40, endFrame: 48 },
    { text: 'Rough', startFrame: 48, endFrame: 65 },
    { text: 'Cut', startFrame: 65, endFrame: 80 },
  ]),
  fontSize: z.number().min(16).max(120).default(48),
  color: z.string().default('#ffffff'),
  highlightColor: z.string().default('#2563eb'),
});

const lowerThirdSchema = z.object({
  name: z.string().default('John Doe'),
  role: z.string().default('Software Engineer'),
  accentColor: z.string().default('#2563eb'),
  textColor: z.string().default('#ffffff'),
  backgroundColor: z.string().default('rgba(0,0,0,0.75)'),
  position: z.enum(['left', 'center', 'right']).default('left'),
});

const textPopSchema = z.object({
  text: z.string().default('WOW!'),
  fontSize: z.number().min(24).max(200).default(96),
  color: z.string().default('#ffffff'),
  backgroundColor: z.string().default('#0f0f0f'),
  bounce: z.boolean().default(true),
});

const gradientBackgroundSchema = z.object({
  colorA: z.string().default('#1a1a2e'),
  colorB: z.string().default('#16213e'),
  colorC: z.string().default('#0f3460'),
  speed: z.number().min(0.1).max(5).default(1),
  angle: z.number().min(0).max(360).default(135),
});

const zoomTitleSchema = z.object({
  title: z.string().default('Chapter One'),
  fontSize: z.number().min(24).max(200).default(80),
  color: z.string().default('#ffffff'),
  backgroundColor: z.string().default('#0f0f0f'),
  zoomSpeed: z.number().min(0.5).max(3).default(1),
});

const introBumperSchema = z.object({
  projectName: z.string().default('Rough Cut'),
  tagline: z.string().default('Screen Recording Studio'),
  accentColor: z.string().default('#2563eb'),
  backgroundColor: z.string().default('#0a0a0a'),
  textColor: z.string().default('#ffffff'),
});

const outroSchema = z.object({
  heading: z.string().default('Thanks for watching!'),
  subtext: z.string().default('Like & Subscribe'),
  accentColor: z.string().default('#2563eb'),
  backgroundColor: z.string().default('#0a0a0a'),
  textColor: z.string().default('#ffffff'),
});

// --- Registry ---

export const TEMPLATE_REGISTRY: TemplateRegistryEntry[] = [
  {
    id: 'title-card',
    name: 'Title Card',
    description: 'Animated title with spring physics',
    category: 'titles',
    component: TitleCard,
    schema: titleCardSchema,
    defaultProps: titleCardSchema.parse({}),
    defaultDurationFrames: 90,
  },
  {
    id: 'caption-overlay',
    name: 'Caption Overlay',
    description: 'Word-by-word highlighted captions',
    category: 'captions',
    component: CaptionOverlay,
    schema: captionOverlaySchema,
    defaultProps: captionOverlaySchema.parse({}),
    defaultDurationFrames: 150,
  },
  {
    id: 'lower-third',
    name: 'Lower Third',
    description: 'Name and title bar with slide-in',
    category: 'lower-thirds',
    component: LowerThird,
    schema: lowerThirdSchema,
    defaultProps: lowerThirdSchema.parse({}),
    defaultDurationFrames: 120,
  },
  {
    id: 'text-pop',
    name: 'Text Pop',
    description: 'Single word or phrase with bounce',
    category: 'titles',
    component: TextPop,
    schema: textPopSchema,
    defaultProps: textPopSchema.parse({}),
    defaultDurationFrames: 60,
  },
  {
    id: 'gradient-background',
    name: 'Gradient Background',
    description: 'Animated gradient fill',
    category: 'backgrounds',
    component: GradientBackground,
    schema: gradientBackgroundSchema,
    defaultProps: gradientBackgroundSchema.parse({}),
    defaultDurationFrames: 150,
  },
  {
    id: 'zoom-title',
    name: 'Zoom Title',
    description: 'Title that zooms in dramatically',
    category: 'titles',
    component: ZoomTitle,
    schema: zoomTitleSchema,
    defaultProps: zoomTitleSchema.parse({}),
    defaultDurationFrames: 90,
  },
  {
    id: 'intro-bumper',
    name: 'Intro Bumper',
    description: 'Project name reveal animation',
    category: 'titles',
    component: IntroBumper,
    schema: introBumperSchema,
    defaultProps: introBumperSchema.parse({}),
    defaultDurationFrames: 90,
  },
  {
    id: 'outro',
    name: 'Outro',
    description: 'Call-to-action with fade out',
    category: 'titles',
    component: Outro,
    schema: outroSchema,
    defaultProps: outroSchema.parse({}),
    defaultDurationFrames: 120,
  },
];

export function getTemplate(id: string): TemplateRegistryEntry | undefined {
  return TEMPLATE_REGISTRY.find((t) => t.id === id);
}
