import { MapProject } from '../types';

export function exportProjectFile(project: MapProject): void {
  const data = JSON.stringify(project, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const safeName = project.name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-') || 'project';

  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName}.mapanim`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function importProjectFromFile(file: File): Promise<MapProject> {
  const text = await file.text();
  const parsed = JSON.parse(text);

  if (!parsed.id || !Array.isArray(parsed.scenes)) {
    throw new Error('Invalid Map Animator project file format.');
  }

  return {
    ...parsed,
    id: `proj-${Date.now()}`,
    updatedAt: Date.now(),
  };
}
