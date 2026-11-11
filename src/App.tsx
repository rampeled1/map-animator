import React, { useState, useEffect } from 'react';
import { HomePage } from './components/HomePage';
import { EditorPage } from './components/EditorPage';
import { MapProject } from './types';
import { parseRouteFile } from './utils/gpxParser';
import { projectStorage, createNewProject } from './utils/indexedDbStorage';

export const App: React.FC = () => {
  const [projects, setProjects] = useState<MapProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [isStorageInitialized, setIsStorageInitialized] = useState(false);

  // Initialize IndexedDB and perform clean-start
  useEffect(() => {
    projectStorage
      .initialize()
      .then(async () => {
        setIsStorageInitialized(true);
        const list = await projectStorage.listProjects();
        const loaded: MapProject[] = [];
        for (const item of list) {
          const p = await projectStorage.loadProject(item.id);
          if (p) loaded.push(p);
        }
        setProjects(loaded);
      })
      .catch((err) => {
        console.error('Storage initialization failed:', err);
      });
  }, []);

  const activeProject = projects.find((p) => p.id === activeProjectId);

  const handleCreateProject = async (name: string) => {
    const summaries = await projectStorage.listProjects();
    const newProj = createNewProject(summaries);
    if (name.trim()) {
      newProj.name = name.trim();
    }
    await projectStorage.saveProject(newProj);
    setProjects((prev) => [newProj, ...prev]);
    setActiveProjectId(newProj.id);
  };

  const handleUpdateProject = (updater: (prev: MapProject) => MapProject) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id === activeProjectId) {
          const updated = updater(p);
          projectStorage.saveProject(updated).catch(console.error);
          return updated;
        }
        return p;
      })
    );
  };

  const handleDeleteProject = async (id: string) => {
    await projectStorage.deleteProject(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
    if (activeProjectId === id) setActiveProjectId(null);
  };

  /**
   * Universal file importer supporting .gpx, .kml, .kmz, .igc (Oct 15 & 29 changelog)
   */
  const handleImportGPX = async (
    file: File,
    options?: { importWaypoints: boolean; createDayEndSigns: boolean },
    sceneIndex = 0
  ) => {
    if (!activeProjectId) return;
    try {
      const { tracks, signs } = await parseRouteFile(file, options);

      if (tracks.length === 0 && signs.length === 0) {
        alert('No tracks or waypoints found in file.');
        return;
      }

      handleUpdateProject((prev) => {
        const canonical = prev.routes?.[0];
        const combinedGeometry = tracks.flatMap((t) => t.points);
        const combinedStops = combinedGeometry.length >= 2 ? [
          {
            id: `stop-${Date.now()}-start`,
            placeName: 'Start',
            customLabel: 'Start',
            showLabel: true,
            lng: combinedGeometry[0].lng,
            lat: combinedGeometry[0].lat,
          },
          {
            id: `stop-${Date.now()}-dest`,
            placeName: 'Destination',
            customLabel: 'Destination',
            showLabel: true,
            lng: combinedGeometry[combinedGeometry.length - 1].lng,
            lat: combinedGeometry[combinedGeometry.length - 1].lat,
          }
        ] : [];

        const updatedRoute = {
          ...canonical,
          id: canonical?.id || `route-${Date.now()}`,
          name: tracks[0]?.name || canonical?.name || 'Main Journey',
          status: 'calculated' as const,
          stops: combinedStops,
          segments: combinedStops.length === 2 ? [
            {
              id: `seg-${Date.now()}`,
              fromStopId: combinedStops[0].id,
              toStopId: combinedStops[1].id,
              transportType: 'car' as const,
              shapingPoints: [],
              use3dSymbol: true,
              status: 'calculated' as const,
              geometry: combinedGeometry,
            }
          ] : [],
          calculatedGeometry: combinedGeometry,
          stats: tracks[0]?.stats || canonical?.stats,
        };

        const targetIdx = Math.min(Math.max(0, sceneIndex), prev.scenes.length - 1);
        const activeScene = prev.scenes[targetIdx];
        const mergedSigns = [...activeScene.signs, ...signs];

        return {
          ...prev,
          updatedAt: Date.now(),
          routes: [updatedRoute as any],
          scenes: prev.scenes.map((scene, idx) =>
            idx === targetIdx ? { ...scene, signs: mergedSigns } : scene
          ),
        };
      });
    } catch (err) {
      console.error('Failed to parse route file:', err);
      alert('Could not open route file. Ensure it is a valid GPX, KML, KMZ or IGC file.');
    }
  };

  const handleImportProjectFile = async (file: File) => {
    try {
      const imported = await projectStorage.importProjectFile(file);
      setProjects((prev) => [imported, ...prev]);
      setActiveProjectId(imported.id);
    } catch (err: any) {
      alert(`Could not open project file: ${err?.message || 'Invalid format'}`);
    }
  };

  if (!isStorageInitialized) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900 text-white">
        <p className="text-lg">Initializing Map Animator storage...</p>
      </div>
    );
  }

  if (activeProject) {
    return (
      <EditorPage
        project={activeProject}
        onUpdateProject={handleUpdateProject}
        onBackToHome={() => setActiveProjectId(null)}
        onImportGPX={handleImportGPX}
      />
    );
  }

  return (
    <HomePage
      projects={projects}
      onCreateProject={handleCreateProject}
      onOpenProject={(proj) => setActiveProjectId(proj.id)}
      onDeleteProject={handleDeleteProject}
      onImportProjectFile={handleImportProjectFile}
    />
  );
};

export default App;
