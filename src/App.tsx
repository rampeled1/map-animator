import React, { useState, useEffect } from 'react';
import { HomePage } from './components/HomePage';
import { EditorPage } from './components/EditorPage';
import { MapProject, Route } from './types';
import { parseRouteFile } from './utils/gpxParser';

const STORAGE_KEY = 'mapanimator_projects_v1';

export const App: React.FC = () => {
  const [projects, setProjects] = useState<MapProject[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  // Sync projects to LocalStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    } catch (e) {
      console.warn('Failed to save projects to storage:', e);
    }
  }, [projects]);

  const activeProject = projects.find((p) => p.id === activeProjectId);

  const handleCreateProject = (name: string) => {
    const newProj: MapProject = {
      id: `proj-${Date.now()}`,
      name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      aspect: '16:9',
      size: 1080,
      fps: 30,
      scenes: [
        {
          id: `scene-${Date.now()}`,
          name: 'Scene 1',
          duration: 15,
          holdStartSec: 1,
          holdEndSec: 2,
          mapThemeId: 'liberty',
          routes: [
            {
              id: `route-${Date.now()}`,
              name: 'Main Route',
              color: '#ff4d2e',
              width: 8,
              style: 'solid',
              transportType: 'car',
              legs: [],
              points: [],
            },
          ],
          signs: [],
          cameraBlocks: [],
          overlays: {
            showDistance: true,
            showAltitude: true,
            showSpeed: true,
            showElevationProfile: true,
            showCompass: true,
            unit: 'metric',
            theme: 'dark',
          },
        },
      ],
    };

    setProjects((prev) => [newProj, ...prev]);
    setActiveProjectId(newProj.id);
  };

  const handleUpdateProject = (updater: (prev: MapProject) => MapProject) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === activeProjectId ? updater(p) : p))
    );
  };

  const handleDeleteProject = (id: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== id));
    if (activeProjectId === id) setActiveProjectId(null);
  };

  /**
   * Universal file importer supporting .gpx, .kml, .kmz, .igc (Oct 15 & 29 changelog)
   */
  const handleImportGPX = async (
    file: File,
    options?: { importWaypoints: boolean; createDayEndSigns: boolean }
  ) => {
    if (!activeProjectId) return;
    try {
      const { tracks, signs } = await parseRouteFile(file, options);

      if (tracks.length === 0 && signs.length === 0) {
        alert('No tracks or waypoints found in file.');
        return;
      }

      const colors = ['#ff4d2e', '#ff9800', '#2196f3', '#4caf50', '#9c27b0', '#ffd600'];

      handleUpdateProject((prev) => {
        const activeScene = prev.scenes[0];
        const existingRoutes = activeScene.routes.filter((r) => r.points.length > 0);

        const newRoutes: Route[] = tracks.map((t, idx) => ({
          id: `route-${Date.now()}-${idx}`,
          name: t.name || `Track ${existingRoutes.length + idx + 1}`,
          color: colors[(existingRoutes.length + idx) % colors.length],
          width: 8,
          style: 'solid',
          transportType: 'car',
          legs: [],
          points: t.points,
          stats: t.stats,
        }));

        const mergedRoutes = [...existingRoutes, ...newRoutes];
        const mergedSigns = [...activeScene.signs, ...signs];

        return {
          ...prev,
          updatedAt: Date.now(),
          scenes: [
            {
              ...activeScene,
              routes: mergedRoutes.length > 0 ? mergedRoutes : activeScene.routes,
              signs: mergedSigns,
            },
          ],
        };
      });
    } catch (err) {
      console.error('Failed to parse route file:', err);
      alert('Could not open route file. Ensure it is a valid GPX, KML, KMZ or IGC file.');
    }
  };

  const handleImportProjectFile = async (file: File) => {
    try {
      const text = await file.text();
      const imported: MapProject = JSON.parse(text);
      if (imported.id && imported.scenes) {
        imported.id = `proj-${Date.now()}`;
        setProjects((prev) => [imported, ...prev]);
        setActiveProjectId(imported.id);
      }
    } catch {
      alert('Could not open project file: invalid JSON');
    }
  };

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
