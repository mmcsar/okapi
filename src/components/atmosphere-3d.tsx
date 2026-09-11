/** Soft 3D atmosphere — decorative orbs behind the UI. */
export function Atmosphere3d() {
  return (
    <div className="okapi-3d" aria-hidden="true">
      <span className="okapi-3d-orb okapi-3d-orb--a" />
      <span className="okapi-3d-orb okapi-3d-orb--b" />
      <span className="okapi-3d-orb okapi-3d-orb--c" />
      <span className="okapi-3d-plane" />
    </div>
  );
}
