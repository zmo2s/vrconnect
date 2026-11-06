/**
 * Slowly drifting colour light behind the glass panels (visionOS-style ambience).
 * Shown only when Settings → Animated background is on (html.ambient-live).
 * Only soft radial gradients moved with transform: cheap for the GPU, no per-frame blur.
 */
export default function AmbientBackground() {
  return (
    <div className="ambient" aria-hidden="true">
      <span className="ambient-blob ambient-a" />
      <span className="ambient-blob ambient-b" />
      <span className="ambient-blob ambient-c" />
      <span className="ambient-blob ambient-d" />
    </div>
  );
}
