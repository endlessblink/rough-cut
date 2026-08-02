import { createHash } from 'node:crypto';

const mode = process.argv[2];
const base = 'http://127.0.0.1:37333/__rough_cut__';
const snapshot = await (await fetch(`${base}/snapshot`)).json();
const project = snapshot.projects.find((candidate) => candidate.id === '9ed6026f-4451-453c-88bb-f4a0f389672e');
if (!project) throw new Error('active project not found');
const item = project.timeline?.items?.[0];
if (!item) throw new Error('active timeline item not found');
const originalLabel = item.label.replace(' [LIVE SYNC CHECK]', '');
item.label = mode === 'changed' ? `${originalLabel} [LIVE SYNC CHECK]` : originalLabel;
const response = await fetch(`${base}/save`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(project),
});
if (!response.ok) throw new Error(`save failed: ${response.status}`);
const timelineFingerprint = createHash('sha256').update(JSON.stringify(project.timeline)).digest('hex');
console.log(JSON.stringify({ projectId: project.id, mode, label: item.label, timelineFingerprint }));
