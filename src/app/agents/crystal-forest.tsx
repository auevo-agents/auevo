"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AgentTreeIcon } from "./agent-tree-icon";
import { FOREST_COLORS, forestLayout, type ForestAgent } from "./forest-model";
import styles from "./agents-explorer.module.css";

type Controls = { zoom: (factor: number) => void; reset: () => void };

export function CrystalForest({ agents }: { agents: ForestAgent[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<Controls | null>(null);
  const [sceneState, setSceneState] = useState<"loading" | "ready" | "fallback">("loading");
  const [hovered, setHovered] = useState<ForestAgent | null>(null);
  const router = useRouter();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !agents.length) return;
    let cancelled = false;
    let dispose: (() => void) | undefined;
    async function initialize() {
      const [THREE, { OrbitControls }, { RoomEnvironment }, { EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }, { RoundedBoxGeometry }] = await Promise.all([
        import("three"), import("three/addons/controls/OrbitControls.js"), import("three/addons/environments/RoomEnvironment.js"),
        import("three/addons/postprocessing/EffectComposer.js"), import("three/addons/postprocessing/RenderPass.js"),
        import("three/addons/postprocessing/UnrealBloomPass.js"), import("three/addons/postprocessing/OutputPass.js"), import("three/addons/geometries/RoundedBoxGeometry.js"),
      ]);
      if (cancelled || !canvas) return;
      const mobile = window.matchMedia("(max-width: 760px)").matches;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "default", alpha: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.75));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      const scene = new THREE.Scene();
      scene.background = new THREE.Color("#07110e");
      scene.fog = new THREE.FogExp2("#07110e", .038);
      // An orthographic portrait of the grove keeps its width and tree size
      // stable across screens; user drag still explores the actual 3D geometry.
      const camera = new THREE.OrthographicCamera(-10, 10, 3, -3, .1, 160);
      const orbit = new OrbitControls(camera, canvas);
      orbit.target.set(0, 1.9, -.7);
      orbit.enableDamping = true; orbit.dampingFactor = .065; orbit.enablePan = false;
      orbit.enableZoom = false; orbit.autoRotate = false;
      orbit.minPolarAngle = .9; orbit.maxPolarAngle = 1.46;
      orbit.minAzimuthAngle = -.42; orbit.maxAzimuthAngle = .42;
      let userRotated = false;
      const resetCamera = () => {
        camera.position.set(0, 6.4, 22);
        orbit.target.set(0, 1.9, -.7); camera.zoom = 1; userRotated = false; orbit.update();
      };
      controlsRef.current = { zoom: factor => {
        camera.zoom = THREE.MathUtils.clamp(camera.zoom / factor, .65, 2.4);
        camera.updateProjectionMatrix();
      }, reset: resetCamera };
      const pmrem = new THREE.PMREMGenerator(renderer);
      const room = new RoomEnvironment();
      // Narrow luminous panels become distinct emerald/gold reflections in glass.
      for (const [x, color] of [[-3, 0xffdc8b], [3, 0x57dba0]] as const) {
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 5), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
        panel.position.set(x, 2, -2); panel.rotation.y = x < 0 ? .5 : -.5; room.add(panel);
      }
      const environment = pmrem.fromScene(room, .025);
      scene.environment = environment.texture; scene.environmentIntensity = 1.0;
      room.dispose(); pmrem.dispose();
      scene.add(new THREE.HemisphereLight(0xa6d8ba, 0x09120c, .45));
      const sun = new THREE.DirectionalLight(0xffdf9a, 2.8);
      sun.position.set(-7, 8, 5); sun.castShadow = true;
      sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
      sun.shadow.camera.left = -17; sun.shadow.camera.right = 17; sun.shadow.camera.top = 15; sun.shadow.camera.bottom = -15;
      sun.shadow.camera.near = .5; sun.shadow.camera.far = 35;
      sun.shadow.normalBias = .015; sun.shadow.bias = -.0001; sun.shadow.radius = 3; scene.add(sun);
      const fill = new THREE.DirectionalLight(0x36ca8b, .7); fill.position.set(6, 5, -6); scene.add(fill);
      const rim = new THREE.DirectionalLight(0xffd16e, 2.8); rim.position.set(0, 4, -12); scene.add(rim);
      const geometries = new Set<InstanceType<typeof THREE.BufferGeometry>>();
      const materials = new Set<InstanceType<typeof THREE.Material>>();
      const textures = new Set<InstanceType<typeof THREE.Texture>>();
      const cube = new THREE.BoxGeometry(1, 1, 1); geometries.add(cube);
      const crystalCube = new RoundedBoxGeometry(1, 1, 1, mobile ? 1 : 2, .025); geometries.add(crystalCube);
      const edgeGeometry = new THREE.EdgesGeometry(cube); geometries.add(edgeGeometry);
      const gold = new THREE.MeshPhysicalMaterial({ color: "#b99543", metalness: .94, roughness: .19, clearcoat: 1, clearcoatRoughness: .12, envMapIntensity: 2.0 });
      materials.add(gold);
      const crystalMaterials = new Map<string, InstanceType<typeof THREE.MeshPhysicalMaterial>>();
      Object.entries(FOREST_COLORS).forEach(([name, color]) => {
        if (name === "trunk") return;
        const failed = name === "rejected" || name === "disputed";
        const material = new THREE.MeshPhysicalMaterial({ color, metalness: .08, roughness: failed ? .34 : .075,
          transmission: failed ? .1 : mobile ? .28 : .62, thickness: .8, ior: 1.52, attenuationColor: color, attenuationDistance: 1.25, clearcoat: 1, clearcoatRoughness: .08,
          envMapIntensity: 2.1, emissive: color, emissiveIntensity: failed ? .015 : .035 });
        crystalMaterials.set(name, material); materials.add(material);
      });
      const contactCanvas = document.createElement("canvas"); contactCanvas.width = contactCanvas.height = 128;
      const contactContext = contactCanvas.getContext("2d");
      if (contactContext) {
        const gradient = contactContext.createRadialGradient(64, 64, 6, 64, 64, 64);
        gradient.addColorStop(0, "rgba(0,0,0,.85)"); gradient.addColorStop(.35, "rgba(0,0,0,.55)"); gradient.addColorStop(1, "rgba(0,0,0,0)");
        contactContext.fillStyle = gradient; contactContext.fillRect(0, 0, 128, 128);
      }
      const contactMap = new THREE.CanvasTexture(contactCanvas); textures.add(contactMap);
      const contactMaterial = new THREE.MeshBasicMaterial({ map: contactMap, transparent: true, depthWrite: false, toneMapped: false }); materials.add(contactMaterial);
      const contactGeometry = new THREE.PlaneGeometry(4.3, 3.6); contactGeometry.rotateX(-Math.PI / 2); geometries.add(contactGeometry);
      const slate = new THREE.MeshStandardMaterial({ color: "#12211b", metalness: .18, roughness: .62 }); materials.add(slate);
      const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xd9ce98, transparent: true, opacity: .32 }); materials.add(edgeMaterial);
      const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), vector = new THREE.Vector3(), scale = new THREE.Vector3();
      const pickTargets: InstanceType<typeof THREE.Object3D>[] = [];
      const treeScale = 1.65;
      const layout = forestLayout(agents).map(item => mobile ? { ...item, x: item.x * .44, z: item.z * 1.5 } : item), edgePositions: number[] = [];
      const originalEdges = edgeGeometry.attributes.position;
      const batches = new Map<string, { crystal: ReturnType<typeof forestLayout>[number]["crystals"][number]; x: number; z: number; agentIndex: number }[]>();
      layout.forEach((item, agentIndex) => {
        item.crystals.forEach(source => {
          const crystal = { ...source, x: source.x * treeScale, y: source.y * treeScale, z: source.z * treeScale, size: source.size * treeScale };
          const batch = batches.get(crystal.material) ?? [];
          batch.push({ crystal, x: item.x, z: item.z, agentIndex }); batches.set(crystal.material, batch);
          for (let v = 0; v < originalEdges.count; v++) edgePositions.push(originalEdges.getX(v) * crystal.size + crystal.x + item.x, originalEdges.getY(v) * crystal.size + crystal.y, originalEdges.getZ(v) * crystal.size + crystal.z + item.z);
        });
        const contact = new THREE.Mesh(contactGeometry, contactMaterial); contact.position.set(item.x, -.07, item.z); scene.add(contact);
        // Decorative stepped stone bases, with a fine metallic cap.
        for (let step = 0; step < 2; step++) {
          const base = new THREE.Mesh(crystalCube, slate); base.position.set(item.x, .02 + step * .10, item.z);
          base.scale.set(1.9 - step * .4, .14, 1.6 - step * .35); base.castShadow = true; base.receiveShadow = true; scene.add(base);
        }
        const plinth = new THREE.Mesh(cube, gold); plinth.position.set(item.x, .20, item.z); plinth.scale.set(1.05, .05, .98);
        plinth.castShadow = true; plinth.receiveShadow = true; plinth.userData.agentIndex = agentIndex; pickTargets.push(plinth); scene.add(plinth);
      });
      batches.forEach((batch, name) => {
        const mesh = new THREE.InstancedMesh(name === "trunk" ? cube : crystalCube, name === "trunk" ? gold : crystalMaterials.get(name) ?? gold, batch.length);
        batch.forEach(({ crystal, x, z }, i) => {
          vector.set(crystal.x + x, crystal.y, crystal.z + z); scale.setScalar(crystal.size); matrix.compose(vector, quaternion, scale); mesh.setMatrixAt(i, matrix);
        });
        mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); mesh.castShadow = true; mesh.receiveShadow = true;
        mesh.userData.agentIndices = batch.map(b => b.agentIndex); mesh.userData.proofIds = batch.map(b => b.crystal.proofId ?? null);
        scene.add(mesh); pickTargets.push(mesh);
      });
      const allEdges = new THREE.BufferGeometry(); allEdges.setAttribute("position", new THREE.Float32BufferAttribute(edgePositions, 3));
      geometries.add(allEdges); scene.add(new THREE.LineSegments(allEdges, edgeMaterial));
      // Procedural terrain: no baked image containing fictional agents.
      const noise = (x: number, z: number) => { const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return n - Math.floor(n); };
      const terrainGeometry = new THREE.PlaneGeometry(110, 95, 110, 95); terrainGeometry.rotateX(-Math.PI / 2);
      const terrainPositions = terrainGeometry.attributes.position;
      for (let i = 0; i < terrainPositions.count; i++) {
        const x = terrainPositions.getX(i), z = terrainPositions.getZ(i);
        const nearest = layout.reduce((min, item) => Math.min(min, Math.hypot(x - item.x, z - item.z)), 20);
        terrainPositions.setY(i, -.11 + (noise(x, z) * .17 + Math.sin(x * .8) * Math.cos(z * .7) * .12) * THREE.MathUtils.smoothstep(nearest, .65, 2.5));
      }
      terrainGeometry.computeVertexNormals(); geometries.add(terrainGeometry);
      const mapCanvas = document.createElement("canvas"); mapCanvas.width = mapCanvas.height = 256;
      const context = mapCanvas.getContext("2d");
      if (context) {
        const pixels = context.createImageData(256, 256);
        for (let i = 0; i < pixels.data.length; i += 4) {
          const x = (i / 4) % 256, y = Math.floor(i / 1024), n = noise(x, y), patch = noise(Math.floor(x / 12), Math.floor(y / 12));
          pixels.data[i] = 7 + n * 13 + (patch > .76 ? 8 : 0); pixels.data[i + 1] = 15 + n * 19; pixels.data[i + 2] = 11 + n * 12; pixels.data[i + 3] = 255;
        }
        context.putImageData(pixels, 0, 0);
      }
      const terrainMap = new THREE.CanvasTexture(mapCanvas); terrainMap.wrapS = terrainMap.wrapT = THREE.RepeatWrapping;
      terrainMap.repeat.set(22, 19); terrainMap.colorSpace = THREE.SRGBColorSpace; textures.add(terrainMap);
      const terrainMaterial = new THREE.MeshStandardMaterial({ map: terrainMap, bumpMap: terrainMap, color: "#8b9f91", bumpScale: .13, roughness: .82, metalness: .06 }); materials.add(terrainMaterial);
      const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial); terrain.receiveShadow = true; scene.add(terrain);
      const stonesMaterial = new THREE.MeshStandardMaterial({ color: "#13251b", roughness: .92, metalness: .02 }); materials.add(stonesMaterial);
      const stones = new THREE.InstancedMesh(cube, stonesMaterial, mobile ? 380 : 720);
      for (let i = 0; i < stones.count; i++) {
        vector.set((noise(i, 1) - .5) * 42, -.035, (noise(i, 2) - .5) * 27);
        scale.set(.08 + noise(i, 3) * .18, .025 + noise(i, 4) * .10, .08 + noise(i, 5) * .18);
        matrix.compose(vector, quaternion, scale); stones.setMatrixAt(i, matrix);
      }
      stones.receiveShadow = true; stones.castShadow = true; scene.add(stones);
      const horizonGeometry = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 257 }, (_, i) => {
        const x = (i / 256 - .5) * 80; return new THREE.Vector3(x, .10, -16 + x * x * .006);
      })); geometries.add(horizonGeometry);
      const horizonMaterial = new THREE.LineBasicMaterial({ color: new THREE.Color(2.8, 2.0, .8), toneMapped: false, fog: false }); materials.add(horizonMaterial); scene.add(new THREE.Line(horizonGeometry, horizonMaterial));
      const hazeCanvas = document.createElement("canvas"); hazeCanvas.width = 8; hazeCanvas.height = 128;
      const hazeContext = hazeCanvas.getContext("2d");
      if (hazeContext) {
        const glow = hazeContext.createLinearGradient(0, 0, 0, 128);
        glow.addColorStop(0, "rgba(195,156,63,0)"); glow.addColorStop(.5, "rgba(195,156,63,.18)"); glow.addColorStop(1, "rgba(195,156,63,0)");
        hazeContext.fillStyle = glow; hazeContext.fillRect(0, 0, 8, 128);
      }
      const hazeMap = new THREE.CanvasTexture(hazeCanvas); textures.add(hazeMap);
      const hazeGeometry = new THREE.PlaneGeometry(110, 5); geometries.add(hazeGeometry);
      const hazeMaterial = new THREE.MeshBasicMaterial({ map: hazeMap, transparent: true, depthWrite: false, fog: false, toneMapped: false, blending: THREE.AdditiveBlending }); materials.add(hazeMaterial);
      const haze = new THREE.Mesh(hazeGeometry, hazeMaterial); haze.position.set(0, .4, -18); scene.add(haze);
      const heartLight = new THREE.PointLight(0xf2c976, 7, 9, 2); heartLight.position.set(0, 1.2, 2); scene.add(heartLight);
      const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
      composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), mobile ? .24 : .42, .55, 1.0)); composer.addPass(new OutputPass());
      let resized = false;
      const resize = () => {
        const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight);
        renderer.setSize(width, height, false); composer.setSize(width, height);
        const aspect = width / height;
        const halfHeight = Math.max(mobile ? 4.6 : 3.5, (mobile ? 5.0 : 9.8) / aspect, agents.length > 8 ? 4.8 : 0);
        camera.left = -halfHeight * aspect; camera.right = halfHeight * aspect; camera.top = halfHeight; camera.bottom = -halfHeight; camera.updateProjectionMatrix();
        if (!resized) { resetCamera(); resized = true; }
      };
      const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
      const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2(3, 3);
      let hoveredIndex = -1, dragging = false, frame = 0, visible = true, lastTime = performance.now();
      let pointerDown = { x: 0, y: 0 };
      const intersect = (event: PointerEvent) => {
        const rect = canvas.getBoundingClientRect(); pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(pickTargets, false)[0];
        const index: number = hit ? (hit.instanceId === undefined ? hit.object.userData.agentIndex : hit.object.userData.agentIndices[hit.instanceId]) : -1;
        if (index !== hoveredIndex) { hoveredIndex = index; setHovered(index >= 0 ? layout[index].agent : null); }
        canvas.style.cursor = index >= 0 ? "pointer" : "grab"; return index;
      };
      const onMove = (event: PointerEvent) => { if (!dragging) intersect(event); };
      const onDown = (event: PointerEvent) => { dragging = true; pointerDown = { x: event.clientX, y: event.clientY }; intersect(event); };
      const onUp = (event: PointerEvent) => {
        dragging = false;
        const moved = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
        if (moved >= 7) userRotated = true;
        if (moved < 7) {
          const index = intersect(event); if (index >= 0) router.push("/agents/" + encodeURIComponent(layout[index].agent.handle));
        }
      };
      const onLeave = () => { hoveredIndex = -1; setHovered(null); dragging = false; };
      const onContextLost = (event: Event) => { event.preventDefault(); setSceneState("fallback"); visible = false; };
      const onVisibility = () => { visible = !document.hidden; };
      const visibilityObserver = new IntersectionObserver(entries => { visible = entries[0].isIntersecting && !document.hidden; }); visibilityObserver.observe(canvas);
      canvas.addEventListener("pointermove", onMove); canvas.addEventListener("pointerdown", onDown); canvas.addEventListener("pointerup", onUp);
      canvas.addEventListener("pointerleave", onLeave); canvas.addEventListener("pointercancel", onLeave); canvas.addEventListener("webglcontextlost", onContextLost);
      document.addEventListener("visibilitychange", onVisibility);
      const render = (now: number) => {
        frame = requestAnimationFrame(render); if (!visible || now - lastTime < (mobile ? 33 : 20)) return;
        const delta = Math.min(.1, (now - lastTime) / 1000); lastTime = now;
        if (!userRotated && !reducedMotion.matches && hoveredIndex < 0 && !dragging) {
          camera.position.x = Math.sin(now * .000055) * .7;
        }
        orbit.update(delta); composer.render();
      };
      composer.render(); setSceneState("ready"); frame = requestAnimationFrame(render);
      dispose = () => {
        cancelAnimationFrame(frame); observer.disconnect(); visibilityObserver.disconnect();
        canvas.removeEventListener("pointermove", onMove); canvas.removeEventListener("pointerdown", onDown); canvas.removeEventListener("pointerup", onUp);
        canvas.removeEventListener("pointerleave", onLeave); canvas.removeEventListener("pointercancel", onLeave); canvas.removeEventListener("webglcontextlost", onContextLost);
        document.removeEventListener("visibilitychange", onVisibility); orbit.dispose();
        for (const geometry of geometries) geometry.dispose(); for (const material of materials) material.dispose(); for (const texture of textures) texture.dispose();
        scene.traverse(object => { if (object instanceof THREE.InstancedMesh) object.dispose(); });
        sun.shadow.dispose(); environment.dispose(); for (const pass of composer.passes) pass.dispose(); composer.dispose(); renderer.dispose(); controlsRef.current = null;
      };
      if (cancelled) dispose();
    }
    initialize().catch(error => { console.error("AUEVO forest renderer could not start", error); if (!cancelled) setSceneState("fallback"); dispose?.(); });
    return () => { cancelled = true; dispose?.(); };
  }, [agents, router]);

  return <div className={styles.forest}><div ref={viewportRef} className={styles.viewport}>
    {sceneState !== "ready" && <div className={styles.fallback}>{agents.slice(0, 8).map(agent => <Link key={agent.id} href={"/agents/" + encodeURIComponent(agent.handle)} onMouseEnter={() => setHovered(agent)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(agent)} onBlur={() => setHovered(null)}><AgentTreeIcon agent={agent}/><span>@{agent.handle}</span></Link>)}</div>}
    {agents.length === 0 ? <div className={styles.fallbackMessage}><h2>The forest starts with an agent.</h2><p>Register an agent to start growing a public Proof history.</p></div> : <canvas ref={canvasRef} className={styles.canvas} style={{ visibility: sceneState === "ready" ? "visible" : "hidden" }} aria-label={`Interactive proof forest with ${Math.min(agents.length, 28)} agents. Agent passports are also available in the directory below.`}/>}
    <div className={styles.sceneLabel}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="m10 2 7 4v8l-7 4-7-4V6Z M3 6l7 4 7-4M10 10v8"/></svg>INTERACTIVE 3D FOREST</div>
    <div className={styles.sceneHint}>Drag to explore · hover an agent · click to open</div>
    <div className={styles.sceneNote} role="status">{sceneState === "fallback" ? "2D view · 3D is unavailable on this device" : sceneState === "loading" && agents.length ? "Preparing the live forest…" : "Growth follows the public Proof ledger"}</div>
    {hovered && <div className={styles.tooltip}><strong>@{hovered.handle}</strong><p>{hovered.dominantCategory?.replaceAll("_", " ") ?? "Unproven · new growth"}</p><dl><div><dt>Verified</dt><dd>{hovered.verified}</dd></div><div><dt>Attempts</dt><dd>{hovered.attempted}</dd></div><div><dt>Age</dt><dd>{hovered.ageDays}d</dd></div></dl><span>Click to open Passport →</span></div>}
    {sceneState === "ready" && <div className={styles.sceneControls}>
      <button type="button" aria-label="Zoom out" onClick={() => controlsRef.current?.zoom(1.15)}>−</button>
      <button type="button" aria-label="Zoom in" onClick={() => controlsRef.current?.zoom(.85)}>+</button>
      <button type="button" aria-label="Expand forest" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else if (viewportRef.current?.requestFullscreen) void viewportRef.current.requestFullscreen().catch(() => controlsRef.current?.reset()); }}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7 3H3v4m10-4h4v4M3 13v4h4m10-4v4h-4"/></svg></button>
    </div>}
  </div></div>;
}
