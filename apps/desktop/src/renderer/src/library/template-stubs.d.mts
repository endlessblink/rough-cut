import type { ProjectAspectRatio } from '../../../../../../packages/project-model/dist/index.js';

export interface TemplateStub {
  readonly id: 'short-form-vlog' | 'tutorial' | 'podcast-clip';
  readonly label: string;
  readonly aspectRatio: ProjectAspectRatio;
  readonly description: string;
}

export const TEMPLATE_STUBS: ReadonlyArray<TemplateStub>;

export function findTemplateStub(id: string): TemplateStub | null;
