import type { MapProject, CameraModePreset, DurationPreset, AspectRatioOption } from '../types/index.ts';

/**
 * Ensures backward-compatible defaults for saved and imported projects.
 */
export function migrateProjectDefaults(project: Partial<MapProject>): MapProject {
  const aspect = (project.aspectRatio || project.aspect || '16:9') as AspectRatioOption;
  const cameraPreset: CameraModePreset = project.cameraPreset || 'fly_along';
  const durationPreset: DurationPreset = project.durationPreset || 40;
  const duration = project.duration || project.scenes?.[0]?.duration || 40;

  return {
    id: project.id || `proj-${Date.now()}`,
    name: project.name || 'Untitled Project',
    createdAt: project.createdAt || Date.now(),
    updatedAt: Date.now(),
    aspect: project.aspect || aspect,
    aspectRatio: (['16:9', '9:16', '1:1'].includes(aspect) ? aspect : '16:9') as AspectRatioOption,
    duration,
    durationPreset,
    cameraPreset,
    cameraSettings: project.cameraSettings || {
      preset: cameraPreset,
      smoothness: 0.5,
    },
    size: project.size || 1080,
    fps: project.fps || 30,
    includeMapCredit: project.includeMapCredit ?? true,
    scenes: project.scenes || [],
  };
}

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

  const migrated = migrateProjectDefaults(parsed);
  return {
    ...migrated,
    id: `proj-${Date.now()}`,
    updatedAt: Date.now(),
  };
}

