import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Billboard, Html, Line, OrbitControls, Stars } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { Friend } from "@/data/mockData";
import type { RadarLayout, RadarShow, Point } from "./SocialRadar";
import { RINGS } from "./SocialRadar";
import { cn } from "@/lib/utils";

/** 2D radar units → 3D world units. */
const S = 1 / 40;
const STATUS_COLOR: Record<string, string> = {
  joinme: "hsl(197, 100%, 63%)", active: "hsl(138, 74%, 61%)", askme: "hsl(25, 79%, 56%)", busy: "hsl(0, 79%, 57%)", web: "hsl(197, 100%, 63%)",
};
const seed = (text: string) => ([...text].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 7) % 1000) / 1000;
const to3 = (p: Point, y = 0) => new THREE.Vector3(p.x * S, y, p.y * S);
const API = "http://localhost:5000";

/** Banded "gas giant" surface, unique per world, for planets without a picture. */
function gasGiantTexture(hue: number, key: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 256; canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  let state = Math.floor(seed(key) * 1e6) + 1;
  const rand = () => { state = (state * 16807) % 2147483647; return state / 2147483647; };
  for (let y = 0; y < canvas.height; y += 2) {
    const band = Math.sin(y * 0.09 + rand() * 0.6) * 0.5 + Math.sin(y * 0.031) * 0.5;
    ctx.fillStyle = `hsl(${hue + band * 14}, ${62 + band * 12}%, ${40 + band * 13 + rand() * 4}%)`;
    ctx.fillRect(0, y, canvas.width, 2);
  }
  for (let i = 0; i < 3; i++) { // a few storms
    ctx.fillStyle = `hsla(${hue + 25}, 80%, ${65 + rand() * 15}%, .35)`;
    ctx.beginPath();
    ctx.ellipse(rand() * 256, 20 + rand() * 88, 8 + rand() * 14, 3 + rand() * 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

interface Props {
  layout: RadarLayout;
  positions: Map<string, Point>;
  favorites: string[];
  selectedKey: string | null;
  /** Friend picked from the search box: the camera glides to them. */
  focusId: string | null;
  onSelect: (key: string | null) => void;
  hoverId: string | null;
  onHover: (id: string | null) => void;
  highlight: Set<string>;
  onFriend: (id: string) => void;
  me: { name: string; status: string; picture?: string };
  show: RadarShow;
  resetSignal: number;
  reducedMotion: boolean;
}

/* ---------- scene pieces ---------- */

function Orbit({ radius, strong }: { radius: number; strong?: boolean }) {
  return (
    <mesh rotation-x={-Math.PI / 2}>
      <ringGeometry args={[radius * S - (strong ? 0.018 : 0.01), radius * S + (strong ? 0.018 : 0.01), 160]} />
      <meshBasicMaterial color={strong ? "#7c6cf0" : "#3b3f80"} transparent opacity={strong ? 0.75 : 0.45} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

function Sweep({ animate }: { animate: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => { if (animate && ref.current) ref.current.rotation.z -= dt * 0.7; });
  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2} position-y={-0.01}>
      <circleGeometry args={[(RINGS[2] + 50) * S, 48, 0, 0.7]} />
      <meshBasicMaterial color="#5fd8ff" transparent opacity={0.08} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>
  );
}

function Me({ me, animate }: Pick<Props, "me"> & { animate: boolean }) {
  const glow = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => { if (animate && glow.current) glow.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 1.8) * 0.08); });
  return (
    <group>
      <pointLight intensity={22} distance={30} decay={1.6} color="#d6d0ff" />
      <mesh>
        <sphereGeometry args={[0.55, 48, 48]} />
        <meshStandardMaterial color="#5b4ad6" emissive="#6d5cff" emissiveIntensity={1.4} />
      </mesh>
      <mesh ref={glow}>
        <sphereGeometry args={[1.1, 32, 32]} />
        <meshBasicMaterial color="#7b6dff" transparent opacity={0.12} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <Html center position={[0, 0, 0]} zIndexRange={[20, 0]} className="radar3d-html">
        <div className="radar3d-me" style={{ borderColor: STATUS_COLOR[me.status] ?? STATUS_COLOR.active }}>
          {me.picture ? <img src={me.picture} alt="" /> : <span>You</span>}
        </div>
        <div className="radar3d-name is-me">{me.name}</div>
      </Html>
    </group>
  );
}

function Planet({ planet, selected, dimmed, onSelect, animate }: {
  planet: RadarLayout["planets"][number]; selected: boolean; dimmed: boolean; onSelect: () => void; animate: boolean;
}) {
  const body = useRef<THREE.Group>(null);
  const spin = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const [photo, setPhoto] = useState<THREE.Texture | null>(null);
  const radius = planet.r * S * 1.4;
  const color = useMemo(() => new THREE.Color(`hsl(${planet.hue}, 70%, 48%)`), [planet.hue]);
  const surface = useMemo(() => gasGiantTexture(planet.hue, planet.location.key), [planet.hue, planet.location.key]);
  useEffect(() => () => surface.dispose(), [surface]);
  const phase = seed(planet.location.key) * Math.PI * 2;

  // The world picture, shown in a round window facing the camera (wrapped around a small sphere it was unreadable).
  // Served by the local API: VRChat's image servers don't allow WebGL to use their pictures directly.
  useEffect(() => {
    setPhoto(null);
    if (!planet.picture) return;
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    const sources = [`${API}/vrchat/image-proxy?url=${encodeURIComponent(planet.picture)}`, planet.picture];
    const attempt = (index: number) => {
      if (index >= sources.length) {
        console.warn(`[radar] World picture unavailable in 3D for "${planet.location.title}". Is the API up to date (route /vrchat/image-proxy)?`);
        return;
      }
      loader.load(sources[index], loaded => {
        if (cancelled) { loaded.dispose(); return; }
        loaded.colorSpace = THREE.SRGBColorSpace;
        // "cover" crop: fill the circle with the centre of the picture
        const { width = 1, height = 1 } = loaded.image as HTMLImageElement;
        const aspect = width / height;
        if (aspect > 1) { loaded.repeat.set(1 / aspect, 1); loaded.offset.set((1 - 1 / aspect) / 2, 0); }
        else { loaded.repeat.set(1, aspect); loaded.offset.set(0, (1 - aspect) / 2); }
        setPhoto(loaded);
      }, undefined, () => attempt(index + 1));
    };
    attempt(0);
    return () => { cancelled = true; };
  }, [planet.picture, planet.location.title]);
  useEffect(() => () => { photo?.dispose(); }, [photo]);

  useFrame(({ clock }, dt) => {
    if (!body.current) return;
    if (animate) {
      body.current.position.y = 0.35 + Math.sin(clock.elapsedTime * 0.8 + phase) * 0.12;
      if (spin.current) spin.current.rotation.y += dt * 0.25;
      if (ring.current) ring.current.rotation.z += dt * 0.15;
    }
    const target = selected || hovered ? 1.15 : 1;
    body.current.scale.lerp(new THREE.Vector3(target, target, target), 0.15);
  });

  const opacity = dimmed ? 0.25 : 1;
  return (
    <group position={to3(planet.pos)}>
      <group ref={body} position-y={0.35}
        onClick={event => { event.stopPropagation(); onSelect(); }}
        onPointerOver={event => { event.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = ""; }}>
        <group ref={spin}>
          <mesh>
            <sphereGeometry args={[radius, 48, 48]} />
            <meshStandardMaterial map={surface} emissive={color} emissiveIntensity={0.08} roughness={0.9} metalness={0} transparent opacity={opacity} />
          </mesh>
        </group>
        {photo && (
          <Billboard>
            <mesh position-z={radius * 1.02}>
              <circleGeometry args={[radius * 0.9, 64]} />
              <meshBasicMaterial map={photo} transparent opacity={opacity} toneMapped={false} />
            </mesh>
            <mesh position-z={radius * 1.03}>
              <ringGeometry args={[radius * 0.9, radius * 0.99, 64]} />
              <meshBasicMaterial color={`hsl(${planet.hue}, 90%, 72%)`} transparent opacity={0.9 * opacity} toneMapped={false} />
            </mesh>
          </Billboard>
        )}
        <mesh scale={1.35}>
          <sphereGeometry args={[radius, 32, 32]} />
          <meshBasicMaterial color={color} transparent opacity={(selected ? 0.28 : 0.14) * opacity} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.BackSide} />
        </mesh>
        <mesh ref={ring} rotation-x={Math.PI / 2 - 0.35}>
          <ringGeometry args={[radius * 1.35, radius * 1.55, 96]} />
          <meshBasicMaterial color={`hsl(${planet.hue}, 90%, 78%)`} transparent opacity={0.55 * opacity} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
        {selected && <mesh rotation-x={-Math.PI / 2}>
          <ringGeometry args={[radius * 1.9, radius * 1.98, 96]} />
          <meshBasicMaterial color={`hsl(${planet.hue}, 95%, 72%)`} transparent opacity={0.9} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>}
        <Html center position={[0, radius + 0.55, 0]} zIndexRange={[10, 0]} className="radar3d-html" style={{ pointerEvents: "none" }}>
          <div className={cn("radar3d-planet-label", dimmed && "is-dim")}>
            {planet.location.title.length > 24 ? `${planet.location.title.slice(0, 23)}…` : planet.location.title}
            <b>{planet.people}</b>
          </div>
        </Html>
      </group>
    </group>
  );
}

function FriendNode({ friend, point, ring, status, favorite, lit, dimmed, showName, onHover, onFriend, animate }: {
  friend: Friend; point: Point; ring: number; status: string; favorite: boolean; lit: boolean; dimmed: boolean; showName: boolean;
  onHover: (id: string | null) => void; onFriend: (id: string) => void; animate: boolean;
}) {
  const ref = useRef<THREE.Group>(null);
  const phase = seed(friend.id) * Math.PI * 2;
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.position.set(point.x * S, 0.15 + (animate ? Math.sin(clock.elapsedTime * 1.2 + phase) * 0.08 : 0) + (2 - ring) * 0.05, point.y * S);
  });
  const color = STATUS_COLOR[status] ?? STATUS_COLOR.active;
  return (
    <group ref={ref} position={to3(point, 0.15)}>
      <mesh>
        <sphereGeometry args={[0.13, 20, 20]} />
        <meshBasicMaterial color={color} transparent opacity={dimmed ? 0.2 : 0.9} />
      </mesh>
      <Html center zIndexRange={[30, 0]} className="radar3d-html">
        <button className={cn("radar3d-friend", lit && "is-lit", dimmed && "is-dim")} style={{ borderColor: color, borderStyle: status === "web" ? "dashed" : "solid" }}
          aria-label={friend.name} onPointerEnter={() => onHover(friend.id)} onPointerLeave={() => onHover(null)}
          onFocus={() => onHover(friend.id)} onBlur={() => onHover(null)} onClick={() => onFriend(friend.id)}>
          {friend.avatar ? <img src={friend.avatar} alt="" draggable={false} /> : <span>{friend.name.slice(0, 2).toUpperCase()}</span>}
          {favorite && <i className="radar3d-fav" />}
        </button>
        {(showName || lit) && <div className={cn("radar3d-name", dimmed && "is-dim")}>{friend.name.length > 14 ? `${friend.name.slice(0, 13)}…` : friend.name}</div>}
      </Html>
    </group>
  );
}

function Link({ from, to, color, lit, dimmed, animate }: { from: Point; to: THREE.Vector3; color: string; lit: boolean; dimmed: boolean; animate: boolean }) {
  // drei's Line wraps Line2; its material exposes dashOffset.
  const ref = useRef<{ material: { dashOffset: number } } | null>(null);
  useFrame((_, dt) => { if (animate && ref.current) ref.current.material.dashOffset -= dt * 0.6; });
  return <Line ref={ref as never} points={[to3(from, 0.15), to]} color={color} lineWidth={lit ? 2.2 : 1.3} dashed dashSize={0.12} gapSize={0.1}
    transparent opacity={dimmed ? 0.12 : lit ? 1 : 0.55} depthWrite={false} />;
}

/** Glides the camera's focus to the selected world, and back to you. */
function CameraRig({ focus, resetSignal, controls }: { focus: THREE.Vector3 | null; resetSignal: number; controls: React.MutableRefObject<OrbitControlsImpl | null> }) {
  const { camera } = useThree();
  const resetting = useRef(false);
  useEffect(() => { if (resetSignal) resetting.current = true; }, [resetSignal]);
  useFrame(() => {
    const c = controls.current;
    if (!c) return;
    c.target.lerp(focus ?? new THREE.Vector3(0, 0, 0), 0.06);
    if (resetting.current) {
      camera.position.lerp(new THREE.Vector3(0, 9.5, 12.5), 0.08);
      if (camera.position.distanceTo(new THREE.Vector3(0, 9.5, 12.5)) < 0.05) resetting.current = false;
    }
    c.update();
  });
  return null;
}

/* ---------- canvas ---------- */

export default function Radar3D({ layout, positions, favorites, selectedKey, focusId, onSelect, hoverId, onHover, highlight, onFriend, me, show, resetSignal, reducedMotion }: Props) {
  const controls = useRef<OrbitControlsImpl | null>(null);
  const [pointerInside, setPointerInside] = useState(false);
  const animate = !reducedMotion;
  const selected = layout.planets.find(planet => planet.location.key === selectedKey);
  const focusPoint = focusId ? layout.positions.get(focusId) : undefined;
  const focus = selected ? to3(selected.pos, 0.35) : focusPoint ? to3(focusPoint, 0.15) : null;
  const showAllNames = layout.connected.length <= 24;

  return (
    <Canvas className="radar3d-canvas" camera={{ position: [0, 9.5, 12.5], fov: 50, near: 0.1, far: 200 }} dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      onPointerEnter={() => setPointerInside(true)} onPointerLeave={() => setPointerInside(false)} onPointerMissed={() => onSelect(null)}>
      <ambientLight intensity={0.35} />
      <directionalLight position={[6, 10, 4]} intensity={0.6} color="#c8d0ff" />
      <Stars radius={60} depth={40} count={2500} factor={3} saturation={0.4} fade speed={animate ? 0.6 : 0} />
      <fog attach="fog" args={["#070818", 22, 48]} />

      <Orbit radius={RINGS[0]} strong />
      <Orbit radius={RINGS[1]} />
      <Orbit radius={RINGS[2]} />
      <Orbit radius={RINGS[2] + 50} />
      <Sweep animate={animate} />
      <Me me={me} animate={animate} />

      {show === "all" && layout.connected.map(friend => {
        const planet = layout.planetOf.get(friend.id);
        const p = positions.get(friend.id);
        if (!planet || !p) return null;
        const lit = highlight.has(friend.id);
        return <Link key={`l-${friend.id}`} from={p} to={to3(planet.pos, 0.35)} color={`hsl(${planet.hue}, 90%, 68%)`} lit={lit} dimmed={highlight.size > 0 && !lit} animate={animate} />;
      })}

      {show !== "friends" && layout.planets.map(planet => (
        <Planet key={planet.location.key} planet={planet} selected={planet.location.key === selectedKey} animate={animate}
          dimmed={highlight.size > 0 && !planet.friends.some(friend => highlight.has(friend.id))}
          onSelect={() => onSelect(planet.location.key === selectedKey ? null : planet.location.key)} />
      ))}

      {show !== "worlds" && layout.connected.map(friend => {
        const p = positions.get(friend.id);
        if (!p) return null;
        const lit = highlight.has(friend.id) || hoverId === friend.id;
        const ring = layout.ringOf.get(friend.id) ?? 2;
        return <FriendNode key={friend.id} friend={friend} point={p} ring={ring} status={friend.online ? friend.status ?? "active" : "web"}
          favorite={favorites.includes(friend.id)} lit={lit} dimmed={highlight.size > 0 && !lit} showName={showAllNames || ring === 0}
          onHover={onHover} onFriend={onFriend} animate={animate} />;
      })}

      <OrbitControls ref={controls as never} makeDefault enablePan={false} enableDamping dampingFactor={0.08}
        minDistance={5} maxDistance={30} minPolarAngle={0.15} maxPolarAngle={Math.PI / 2.7}
        autoRotate={animate && !selectedKey && !focusId && !hoverId && !pointerInside} autoRotateSpeed={0.35} />
      <CameraRig focus={focus} resetSignal={resetSignal} controls={controls} />
    </Canvas>
  );
}
