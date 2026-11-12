import React, { useState, useRef, useEffect } from 'react';
import { MapProject } from '../types';
import { projectStorage } from '../utils/indexedDbStorage';
import { createPortal } from 'react-dom';

interface HomePageProps {
  projects: MapProject[];
  onCreateProject: (name: string) => void;
  onOpenProject: (project: MapProject) => void;
  onImportProjectFile: (file: File) => void;
  onDeleteProject: (id: string) => void;
}

export const HomePage: React.FC<HomePageProps> = ({
  projects,
  onCreateProject,
  onOpenProject,
  onImportProjectFile,
  onDeleteProject,
}) => {
  const [projectName, setProjectName] = useState('');
  const [faqOpen, setFaqOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFaqOpen(false);
        setHelpOpen(false);
        setChangelogOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = projectName.trim() || 'Alps by motorcycle';
    onCreateProject(name);
  };

  const handlePageDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      onImportProjectFile(file);
    }
  };

  return (
    <div
      className="site"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handlePageDrop}
    >
      <header className="site-header">
        <div className="site-bar wide">
          <a className="brand" href="/" onClick={(e) => e.preventDefault()}>
            <span className="baldinger" role="img" aria-label="Baldinger">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="2 2.4 133.4 42.3" fill="currentColor">
                <path d="M12 3L2 21h20L12 3z" />
              </svg>
            </span>
            <span className="brand-name">Map Animator</span>
          </a>

          <nav aria-label="Main">
            <a href="#faq" onClick={(e) => { e.preventDefault(); setFaqOpen(true); }}>
              FAQ
            </a>
            <a href="#help" onClick={(e) => { e.preventDefault(); setHelpOpen(true); }}>
              Help
            </a>
            <a href="#changelog" onClick={(e) => { e.preventDefault(); setChangelogOpen(true); }}>
              Changelog<span className="news-pill">New</span>
            </a>
            <a href="#about">About</a>
            <span className="nav-tutorial">
              <a href="https://youtu.be/7UxEJsWk7cc" target="_blank" rel="noopener noreferrer">
                <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" className="nav-tutorial-icon">
                  <path d="M7 4.5v15l12.5-7.5z" fill="currentColor" />
                </svg>
                <span className="nav-tutorial-text"> Tutorial</span>
              </a>
            </span>
            <a className="nav-donate" href="https://www.paypal.com/donate/?hosted_button_id=4Z34EYQP2T548" target="_blank" rel="noopener noreferrer">
              <span aria-hidden="true">❤️</span>
              <span className="nav-donate-text"> Donate</span>
            </a>
          </nav>
        </div>
      </header>

      <main className="site-main">
        <div className="home">
          <section className="hero">
            <div className="hero-text">
              <p className="eyebrow">Animated map videos for travel films</p>
              <h1>Turn your trip into an animated map video</h1>
              <p className="lede">
                Draw your route or drop in a GPX file, add signs and a camera move, and download it as an MP4 video, up to 4K, ready for your editor.
              </p>

              <form className="start" onSubmit={handleSubmit}>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="Name your project, e.g. Alps by motorcycle"
                  aria-label="Project name"
                />
                <button type="submit">Create project</button>
              </form>

              <div className="start-alt">
                Have a project file?{' '}
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Open it
                </button>{' '}
                or drop it on this page.
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".mapanim,.mapanimator,application/json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onImportProjectFile(f);
                  }}
                />
              </div>

              <ul className="perks">
                <li>Free</li>
                <li>No account</li>
                <li>MP4 video up to 4K</li>
              </ul>

              <p className="made-count" aria-label="31,555 map projects made so far">
                <span className="made-dot" aria-hidden="true"></span>
                <b aria-hidden="true" translate="no">31,555</b>
                <span aria-hidden="true">map projects made so far</span>
              </p>
            </div>

            <div className="demo">
              <div className="demo-stage shown">
                <video
                  className="demo-video"
                  src="https://mapanimator.baldinger.se/assets/demo-ComxO6Fi.mp4"
                  poster="https://mapanimator.baldinger.se/assets/demo-poster-D6u-3mkb.jpg"
                  loop
                  playsInline
                  autoPlay
                  muted
                  aria-label="A demo video made with Map Animator"
                />
              </div>
              <div className="demo-bar">
                <span className="demo-badge">
                  <span className="rec"></span> Demo
                </span>
              </div>
            </div>
          </section>

          {/* Saved Projects Section */}
          {projects.length > 0 && (
            <section className="projects">
              <div className="section-head">
                <h2>Your projects</h2>
                <span className="projects-count">
                  {projects.length} {projects.length === 1 ? 'project' : 'projects'} saved in this browser
                </span>
              </div>
              <div className="projects-grid">
                {projects.map((p) => (
                  <div key={p.id} className="project-card" onClick={() => onOpenProject(p)}>
                    <div className="project-card-thumb">
                      <div className="thumb-placeholder">
                        <span>3D Map</span>
                      </div>
                    </div>
                    <div className="project-card-info">
                      <div className="project-card-head">
                        <h3 className="project-card-title">{p.name}</h3>
                        <div className="flex items-center space-x-1">
                          <button
                            type="button"
                            className="p-1 text-[var(--muted)] hover:text-[var(--accent)] transition-colors"
                            title="Download project file (.mapanim)"
                            onClick={async (e) => {
                              e.stopPropagation();
                              const blob = await projectStorage.exportProjectFile(p.id);
                              const url = URL.createObjectURL(blob);
                              const safeName = p.name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-') || 'project';
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `${safeName}.mapanim`;
                              document.body.appendChild(a);
                              a.click();
                              document.body.removeChild(a);
                              URL.revokeObjectURL(url);
                            }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                              <polyline points="7 10 12 15 17 10" />
                              <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            className="project-delete-btn"
                            title="Delete project"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Delete "${p.name}"?`)) onDeleteProject(p.id);
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                      <p className="project-card-date">
                        Edited {new Date(p.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="features" aria-label="What you can do">
            <div className="feature">
              <h3>Draw or use GPX</h3>
              <p>Click points on the map, or drop a GPX file from your watch, bike computer or phone.</p>
            </div>
            <div className="feature">
              <h3>Maps that fit the trip</h3>
              <p>Offroad with tracks and trails, Classic, Dark, Satellite, Treasure and more, with 3D mountains.</p>
            </div>
            <div className="feature">
              <h3>Signs and legs</h3>
              <p>Put signs along the way, and switch from motorcycle to ferry to plane with their own lines.</p>
            </div>
            <div className="feature">
              <h3>Export up to 4K</h3>
              <p>An MP4 made right in your browser, from 480p to 4K, ready for your video editor.</p>
            </div>
          </section>

          <section className="maker-strip">
            <p>
              <b>Made by Robert Baldinger,</b> who makes long-form adventure motorcycle films from rugged corners of the world. Watch them on YouTube, and get the newsletter for what's next.
            </p>
            <div className="maker-links">
              <a
                className="btn"
                href="https://www.youtube.com/@rbaldinger?sub_confirmation=1"
                target="_blank"
                rel="noopener noreferrer"
              >
                Watch the films
              </a>
              <a
                className="btn"
                href="https://baldinger.se/#newsletter"
                target="_blank"
                rel="noopener noreferrer"
              >
                Newsletter
              </a>
            </div>
          </section>

          <section className="donate-strip">
            <p>
              <b>Map Animator is free, with no ads and no account.</b> If it saved you some time, a small donation helps keep it that way.
            </p>
            <a
              className="btn donate-btn"
              href="https://www.paypal.com/donate/?hosted_button_id=4Z34EYQP2T548"
              target="_blank"
              rel="noopener noreferrer"
            >
              ❤️ Donate
            </a>
          </section>
        </div>
      </main>

      <footer className="site-footer">
        <div className="site-bar wide">
          <div className="footer-brand">
            <span className="brand-name">Map Animator</span>
          </div>
          <nav aria-label="Information">
            <a href="#faq" onClick={(e) => { e.preventDefault(); setFaqOpen(true); }}>
              FAQ
            </a>
            <a href="#help" onClick={(e) => { e.preventDefault(); setHelpOpen(true); }}>
              Help
            </a>
            <a href="#changelog" onClick={(e) => { e.preventDefault(); setChangelogOpen(true); }}>
              Changelog
            </a>
            <a href="#about">About</a>
            <a href="#privacy">Privacy policy</a>
            <a href="#cookies">Cookie policy</a>
            <a href="#terms">Terms of use</a>
          </nav>
          <p className="footer-credit">
            © 2026 Baldinger Works AB. All rights reserved. · Maps © OpenStreetMap contributors · OpenMapTiles · OpenFreeMap
          </p>
        </div>
      </footer>

      {/* FAQ Dialog Modal */}
      {faqOpen &&
        createPortal(
          <div
            className="scrim"
            onClick={(e) => e.target === e.currentTarget && setFaqOpen(false)}
          >
            <div className="dialog p-6 max-w-2xl max-h-[85vh] overflow-y-auto space-y-4" role="dialog" aria-label="Frequently Asked Questions">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                <h2 className="text-lg font-bold text-[var(--text)]">Frequently Asked Questions</h2>
                <button
                  onClick={() => setFaqOpen(false)}
                  className="text-[var(--muted)] hover:text-[var(--text)] text-lg p-1"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4 text-xs text-[var(--text)] leading-relaxed">
                <div>
                  <h3 className="font-bold text-sm mb-1 text-[var(--text)]">Where are my projects saved?</h3>
                  <p className="text-[var(--muted)]">
                    In your browser, on this computer, together with the photos and map pictures you add. Nothing is uploaded to us. That also means they don't follow you to another computer or browser on their own, and clearing your browser's site data deletes them. To move or back up a project, click the download icon on its card under Your projects on the home page, and open the file anywhere with Open it next to “Have a project file?”. The file includes the photos and map pictures.
                  </p>
                </div>

                <div>
                  <h3 className="font-bold text-sm mb-1 text-[var(--text)]">Which browsers work?</h3>
                  <p className="text-[var(--muted)]">
                    Chrome and Edge on a computer work best and render fastest. Safari works too; on some older Macs it can’t make 4K, so pick a smaller size there. Firefox works on a Mac, but on Windows its video encoder often fails, so use Chrome or Edge there. Phones and tablets can watch the demo and read these pages, but making videos needs a computer with a mouse or trackpad.
                  </p>
                </div>

                <div>
                  <h3 className="font-bold text-sm mb-1 text-[var(--text)]">What kind of video do I get?</h3>
                  <p className="text-[var(--muted)]">
                    An MP4 file (H.264, standard HD colour), at 480p, 720p, 1080p, 2K or 4K, at 24, 25, 30, 50 or 60 frames per second, in the shape you choose: landscape, vertical, square and more. One video per scene, or all scenes in one video if you switch that on in Preview & export. It drops straight into any video editor.
                  </p>
                </div>

                <div>
                  <h3 className="font-bold text-sm mb-1 text-[var(--text)]">Can I use the videos in my own films, including commercial ones?</h3>
                  <p className="text-[var(--muted)]">
                    Yes, they're yours to use, including in paid work, ads and monetised videos. The map data's licences (OpenStreetMap, OpenMapTiles, OpenFreeMap, the terrain data and, for satellite views, EOX) only ask that you credit them, so keep the small map credit the app puts in the corner. If you crop it out or it gets covered, put the same credit in your end credits or the video description instead.
                  </p>
                </div>

                <div>
                  <h3 className="font-bold text-sm mb-1 text-[var(--text)]">Can I use a GPX file from my watch or app?</h3>
                  <p className="text-[var(--muted)]">
                    Yes. Export your activity as a GPX file and drop it in the Route step. KML and KMZ files from Google My Maps and Google Earth work too, and so do IGC flight logs from paragliding and gliding instruments. If the file holds several tracks, you can pick one or join them all. Places in the file, like waypoints in a GPX or pins in Google My Maps, become map pin signs with their names.
                  </p>
                </div>

                <div>
                  <h3 className="font-bold text-sm mb-1 text-[var(--text)]">Can the route follow the roads by itself?</h3>
                  <p className="text-[var(--muted)]">
                    Map Animator supports auto-routing (car, bike, walk) along real roads with our built-in OSRM engine, or smooth freehand curve drawing. You can also export your trip as a GPX file from Komoot, Strava, Garmin Connect, and drop it in.
                  </p>
                </div>

                <div>
                  <h3 className="font-bold text-sm mb-1 text-[var(--text)]">Which ways of travelling can I show?</h3>
                  <p className="text-[var(--muted)]">
                    A plain line, car, car with caravan, motor home, bus, truck, tuk-tuk, motorcycle, 4WD, ATV, snowmobile, bicycle, walking, running, alpine and cross-country skiing, horse, steam train, speed train, boat, sailboat, catamaran, trimaran, car ferry, kayak, swimming, cruise ship, old sail ship, plane, helicopter, drone, hot-air balloon, paraglider, hang glider, paramotor, white-water raft, surfer, and military transports (patrol, tank, army truck, battleship, aircraft carrier, submarine, fighter jet, WWII bomber).
                  </p>
                </div>

                <div>
                  <h3 className="font-bold text-sm mb-1 text-[var(--text)]">Can the line stop for a moment along the way?</h3>
                  <p className="text-[var(--muted)]">
                    Yes. In the Route step, click a point and choose Pause here, then how long, from ½ to 20 seconds. A sign can pause the line too: select a pause duration on the sign.
                  </p>
                </div>

                <div>
                  <h3 className="font-bold text-sm mb-1 text-[var(--text)]">Can I add my own photos?</h3>
                  <p className="text-[var(--muted)]">
                    Yes, as photo signs: drop a photo or pick the Photo style in the Signs step. Photos with GPS are positioned automatically. When the line passes, photos pop up as prints on leader strings without covering each other.
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-[var(--border)] text-right">
                <button
                  onClick={() => setFaqOpen(false)}
                  className="btn primary"
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Help Dialog Modal */}
      {helpOpen &&
        createPortal(
          <div
            className="scrim"
            onClick={(e) => e.target === e.currentTarget && setHelpOpen(false)}
          >
            <div className="dialog p-6 max-w-2xl max-h-[85vh] overflow-y-auto space-y-4" role="dialog" aria-label="Help Guide">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                <h2 className="text-lg font-bold text-[var(--text)]">Help Guide & Shortcuts</h2>
                <button
                  onClick={() => setHelpOpen(false)}
                  className="text-[var(--muted)] hover:text-[var(--text)] text-lg p-1"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4 text-xs text-[var(--text)] leading-relaxed">
                <div>
                  <h3 className="font-bold text-sm mb-1 text-[var(--accent)]">1. Route</h3>
                  <p className="text-[var(--muted)]">
                    Click anywhere on the map to draw your path, or drop a GPX, KML, KMZ, or IGC file. Use the ⋯ menu to smooth, reverse, or duplicate routes. Switch transport methods mid-trip with + New leg.
                  </p>
                </div>

                <div>
                  <h3 className="font-bold text-sm mb-1 text-[var(--accent)]">2. Map</h3>
                  <p className="text-[var(--muted)]">
                    Choose from Classic, Light, Dark, Satellite, Offroad, Treasure, Arctic, 1930s Military map, and more. Toggle 3D relief mountains and place names in 40+ languages.
                  </p>
                </div>

                <div>
                  <h3 className="font-bold text-sm mb-1 text-[var(--accent)]">3. Signs & Photos</h3>
                  <p className="text-[var(--muted)]">
                    Add Map pins, Campsite tents, Start/Finish flags, and Hotels. Drop phone photos with GPS to automatically position them. Concurrent photos pop up side-by-side on leader strings.
                  </p>
                </div>

                <div>
                  <h3 className="font-bold text-sm mb-1 text-[var(--accent)]">4. Overlays</h3>
                  <p className="text-[var(--muted)]">
                    Turn on live distance, speed, altitude (supporting sub-sea level locations), cumulative Climb & Descent counters, dynamic elevation profile, and title cards.
                  </p>
                </div>

                <div>
                  <h3 className="font-bold text-sm mb-1 text-[var(--accent)]">5. Camera</h3>
                  <p className="text-[var(--muted)]">
                    Switch between Follow, Still, Tripod, and Orbit cameras. Tilt up to 80° for dramatic low flyovers and rotate the map view up to 180°.
                  </p>
                </div>

                <div>
                  <h3 className="font-bold text-sm mb-1 text-[var(--accent)]">6. Preview & Export</h3>
                  <p className="text-[var(--muted)]">
                    Render high quality MP4 videos from 480p up to 4K Ultra HD at 24, 25, 30, 50, or 60 fps. Multi-scene projects can export all scenes in one video.
                  </p>
                </div>

                <div className="pt-2 border-t border-[var(--border)]">
                  <h4 className="font-bold text-xs mb-1.5 text-[var(--text)]">Keyboard Shortcuts</h4>
                  <p className="text-[var(--muted)]">
                    <b>1 – 6</b>: Switch steps · <b>Space</b>: Play/Pause preview · <b>⌘/Ctrl + Z</b>: Undo point · <b>/</b>: Search places · <b>Esc</b>: Close dialogs
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-[var(--border)] text-right">
                <button
                  onClick={() => setHelpOpen(false)}
                  className="btn primary"
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Changelog Dialog Modal */}
      {changelogOpen &&
        createPortal(
          <div
            className="scrim"
            onClick={(e) => e.target === e.currentTarget && setChangelogOpen(false)}
          >
            <div className="dialog p-6 max-w-2xl max-h-[85vh] overflow-y-auto space-y-4" role="dialog" aria-label="Changelog">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                <div>
                  <h2 className="text-lg font-bold text-[var(--text)]">Changelog</h2>
                  <p className="text-xs text-[var(--muted)]">Version 0.3.0 — Latest updates</p>
                </div>
                <button
                  onClick={() => setChangelogOpen(false)}
                  className="text-[var(--muted)] hover:text-[var(--text)] text-lg p-1"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4 text-xs text-[var(--text)] leading-relaxed">
                <div className="border-l-2 border-[var(--accent)] pl-3">
                  <h3 className="font-bold text-sm text-[var(--text)]">12 November 2026 (v1.2.0)</h3>
                  <p className="text-[var(--muted)]">
                    <b>Quick Route Preview:</b> Play, pause, scrub, and preview your journey directly in the Route step at constant physical speeds with live remaining distance.<br />
                    <b>Interactive draggable stop pins:</b> Move your destination and stops directly on the map with real-time route recalculation.<br />
                    <b>Movable title:</b> Drag the trip title and subtitle directly on the map to place it anywhere on screen.<br />
                    <b>Smooth 60fps camera:</b> Perfectly smooth Fly Along camera tracking and auto-framed Whole Tour overview.<br />
                    <b>Enhanced autocomplete & road snapping:</b> Airport IATA code search, clean place name formatting, and refined 3.5px route lines.
                  </p>
                </div>
                <div className="border-l-2 border-[var(--accent)] pl-3">
                  <h3 className="font-bold text-sm text-[var(--text)]">2 November 2026 (v0.3.0)</h3>
                  <p className="text-[var(--muted)]">
                    <b>Auto-routing point spacing (0.1–20 km / Auto):</b> Resample dense road geometries to custom point intervals or adaptive auto-spacing.<br />
                    <b>Direct route manipulation on map:</b> Drag route waypoints to adjust curves, click any line segment to insert a new point, and double-click to toggle sharp corners.<br />
                    <b>Multi-leg transport switching:</b> Split journeys across car, ferry, flight, or foot with real-time symbol updates.<br />
                    <b>Reliable photo storage:</b> Persistent base64 data URLs for photos across browser sessions and project file exports.<br />
                    <b>HTML5 drag & drop signs:</b> Reorder signs visually in the side panel with auto-synchronization.<br />
                    <b>Composite video recorder:</b> High performance canvas recorder capturing WebGL maps, routes, and custom SVG overlays.
                  </p>
                </div>
                <div className="border-l-2 border-[var(--accent)] pl-3">
                  <h3 className="font-bold text-sm text-[var(--text)]">30 October 2026</h3>
                  <p className="text-[var(--muted)]">
                    <b>Map credit on your page instead:</b> You can leave the map credit out of the video in Preview & export, as long as you put it where you publish the video. The credit attribution is ready to copy with one click.
                  </p>
                </div>

                <div className="border-l-2 border-[var(--accent)] pl-3">
                  <h3 className="font-bold text-sm text-[var(--text)]">29 October 2026</h3>
                  <p className="text-[var(--muted)]">
                    <b>Photos side by side:</b> Photos that open at the same time no longer cover each other: they stand side by side, each on a string to its own spot, and always fit in the video.<br />
                    <b>Reorder your signs:</b> Drag a sign by its grip in the Signs list to change the order.<br />
                    <b>A sign at each day’s end:</b> When joining several tracks from one file, a sign can go at the end of each track, named after it.<br />
                    <b>More detail on long trips:</b> Long files retain up to 15,000 points so a multi-week route follows real roads instead of cutting corners.
                  </p>
                </div>

                <div className="border-l-2 border-[var(--accent)] pl-3">
                  <h3 className="font-bold text-sm text-[var(--text)]">27 October 2026</h3>
                  <p className="text-[var(--muted)]">
                    <b>White-water raft:</b> A new way to travel on water: a raft in the route’s colour with six paddlers and a guide, paddling together through rapids.
                  </p>
                </div>

                <div className="border-l-2 border-[var(--accent)] pl-3">
                  <h3 className="font-bold text-sm text-[var(--text)]">22 October 2026</h3>
                  <p className="text-[var(--muted)]">
                    <b>Surfer:</b> A new way to travel on water: a surfer on a board in the route’s colour, carving from side to side with spray off the tail.
                  </p>
                </div>

                <div className="border-l-2 border-[var(--accent)] pl-3">
                  <h3 className="font-bold text-sm text-[var(--text)]">21 October 2026</h3>
                  <p className="text-[var(--muted)]">
                    <b>Military transports:</b> A new group with Patrol of three soldiers, Tank, Army truck, Battleship, Aircraft carrier, Submarine, Fighter jet, and WWII bomber.<br />
                    <b>Winter hiker:</b> A hiker on snowshoes with trekking poles and bobble hat.<br />
                    <b>Military map:</b> 1930s army map theme with aged paper, outlined woods, blue rivers, and inked roads.<br />
                    <b>Climb and descent:</b> Cumulative telemetry counting height climbed and descended.
                  </p>
                </div>

                <div className="border-l-2 border-[var(--accent)] pl-3">
                  <h3 className="font-bold text-sm text-[var(--text)]">20 October 2026</h3>
                  <p className="text-[var(--muted)]">
                    <b>Camera on the timeline:</b> Four kinds of camera: Follow, Still, Tripod, and Orbit.
                  </p>
                </div>

                <div className="border-l-2 border-[var(--accent)] pl-3">
                  <h3 className="font-bold text-sm text-[var(--text)]">15 & 10 October 2026</h3>
                  <p className="text-[var(--muted)]">
                    <b>80° Tilt & Rotation:</b> Low-tilt flyovers up to 80° and North-up continuous rotation.<br />
                    <b>All scenes in one video:</b> Multi-scene continuous MP4 video export with 50 fps option.
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-[var(--border)] text-right">
                <button
                  onClick={() => setChangelogOpen(false)}
                  className="btn primary"
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
