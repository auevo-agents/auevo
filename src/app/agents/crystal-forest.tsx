"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AgentTreeIcon } from "./agent-tree-icon";
import { FOREST_COLORS, forestLayout, type ForestAgent } from "./forest-model";
import styles from "./agents-explorer.module.css";

type Controls = { zoom: (factor: number) => void; reset: () => void };

export function CrystalForest({ agents, single = false }: { agents: ForestAgent[]; single?: boolean }) {
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
      const [THREE, { OrbitControls }, { RoomEnvironment }, { EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }] = await Promise.all([
        import("three"), import("three/addons/controls/OrbitControls.js"), import("three/addons/environments/RoomEnvironment.js"),
        import("three/addons/postprocessing/EffectComposer.js"), import("three/addons/postprocessing/RenderPass.js"),
        import("three/addons/postprocessing/UnrealBloomPass.js"), import("three/addons/postprocessing/OutputPass.js"),
      ]);
      if (cancelled || !canvas) return;
      const mobile = window.matchMedia("(max-width: 760px)").matches;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "default", alpha: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.75));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      const scene = new THREE.Scene();
      scene.background = new THREE.Color("#07110e");
      scene.fog = new THREE.FogExp2("#07110e", .025);
      const camera = new THREE.PerspectiveCamera(35, 1, .1, 180);
      const orbit = new OrbitControls(camera, canvas);
      orbit.target.set(0, single ? 2 : 1.2, single ? 0 : -1.3);
      orbit.enableDamping = true; orbit.dampingFactor = .065; orbit.enablePan = false;
      orbit.enableZoom = false;
      orbit.autoRotate = !reducedMotion.matches; orbit.autoRotateSpeed = .12;
      orbit.minPolarAngle = .78; orbit.maxPolarAngle = 1.48; orbit.minDistance = 7; orbit.maxDistance = 44;
      const resetCamera = () => {
        const aspect = Math.max(.6, canvas.clientWidth / Math.max(1, canvas.clientHeight));
        const reach = single ? 2.1 : agents.length > 8 ? 11 + Math.floor((agents.length - 8) / 7) * 1.2 : 9;
        const distance = Math.max(single ? 8 : 11.5, reach / Math.tan(35 * Math.PI / 360) / aspect);
        camera.position.set(.3, distance * .28 + 1.6, distance);
        orbit.target.set(0, single ? 2 : 1.2, single ? 0 : -1.3); orbit.update();
      };
      controlsRef.current = { zoom: factor => {
        const offset = camera.position.clone().sub(orbit.target);
        camera.position.copy(orbit.target).add(offset.setLength(THREE.MathUtils.clamp(offset.length() * factor, 7, 44)));
        orbit.update();
      }, reset: resetCamera };
      const pmrem = new THREE.PMREMGenerator(renderer);
      const room = new RoomEnvironment();
      const environment = pmrem.fromScene(room, .025);
      scene.environment = environment.texture; scene.environmentIntensity = .75;
      room.dispose(); pmrem.dispose();
      scene.add(new THREE.HemisphereLight(0xa6d8ba, 0x173020, 2.0));
      const sun = new THREE.DirectionalLight(0xffe4a0, 5.5);
      sun.position.set(-4, 10, 6); sun.castShadow = true;
      sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
      sun.shadow.camera.left = -17; sun.shadow.camera.right = 17; sun.shadow.camera.top = 15; sun.shadow.camera.bottom = -15;
      sun.shadow.normalBias = .04; sun.shadow.bias = -.0001; sun.shadow.radius = 3; scene.add(sun);
      const fill = new THREE.DirectionalLight(0x66dca4, 2.7); fill.position.set(6, 5, -6); scene.add(fill);
      const rim = new THREE.DirectionalLight(0xffd16e, 3); rim.position.set(0, 4, -12); scene.add(rim);
      const geometries = new Set<InstanceType<typeof THREE.BufferGeometry>>();
      const materials = new Set<InstanceType<typeof THREE.Material>>();
      const textures = new Set<InstanceType<typeof THREE.Texture>>();
      const cube = new THREE.BoxGeometry(1, 1, 1); geometries.add(cube);
      const edgeGeometry = new THREE.EdgesGeometry(cube); geometries.add(edgeGeometry);
      const gold = new THREE.MeshPhysicalMaterial({ color: "#b78c38", metalness: .78, roughness: .21, clearcoat: 1, clearcoatRoughness: .12, envMapIntensity: 1.6 });
      materials.add(gold);
      const crystalMaterials = new Map<string, InstanceType<typeof THREE.MeshPhysicalMaterial>>();
      Object.entries(FOREST_COLORS).forEach(([name, color]) => {
        if (name === "trunk") return;
        const failed = name === "rejected" || name === "disputed";
        const material = new THREE.MeshPhysicalMaterial({ color, metalness: .13, roughness: failed ? .52 : .12,
          transmission: mobile ? .12 : .36, thickness: .35, ior: 1.48, clearcoat: 1, clearcoatRoughness: .08,
          envMapIntensity: 1.7, emissive: color, emissiveIntensity: failed ? .04 : name === "pending" ? .07 : .11 });
        crystalMaterials.set(name, material); materials.add(material);
      });
      const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xd9ce98, transparent: true, opacity: .68 }); materials.add(edgeMaterial);
      const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), vector = new THREE.Vector3(), scale = new THREE.Vector3();
      const pickTargets: InstanceType<typeof THREE.Object3D>[] = [];
      const treeScale = 1.4;
      const layout = forestLayout(agents).map(item => single ? { ...item, x: 0, z: 0 } : item), edgePositions: number[] = [];
      const originalEdges = edgeGeometry.attributes.position;
      const batches = new Map<string, { crystal: ReturnType<typeof forestLayout>[number]["crystals"][number]; x: number; z: number; agentIndex: number }[]>();
      layout.forEach((item, agentIndex) => {
        item.crystals.forEach(source => {
          const crystal = { ...source, x: source.x * treeScale, y: source.y * treeScale, z: source.z * treeScale, size: source.size * treeScale };
          const batch = batches.get(crystal.material) ?? [];
          batch.push({ crystal, x: item.x, z: item.z, agentIndex }); batches.set(crystal.material, batch);
          for (let v = 0; v < originalEdges.count; v++) edgePositions.push(originalEdges.getX(v) * crystal.size + crystal.x + item.x, originalEdges.getY(v) * crystal.size + crystal.y, originalEdges.getZ(v) * crystal.size + crystal.z + item.z);
        });
        const plinth = new THREE.Mesh(cube, gold); plinth.position.set(item.x, .025, item.z); plinth.scale.set(1.15, .12, 1.08);
        plinth.castShadow = true; plinth.receiveShadow = true; plinth.userData.agentIndex = agentIndex; pickTargets.push(plinth); scene.add(plinth);
      });
      batches.forEach((batch, name) => {
        const mesh = new THREE.InstancedMesh(cube, name === "trunk" ? gold : crystalMaterials.get(name) ?? gold, batch.length);
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
          pixels.data[i] = 15 + n * 27 + (patch > .76 ? 12 : 0); pixels.data[i + 1] = 24 + n * 32; pixels.data[i + 2] = 17 + n * 15; pixels.data[i + 3] = 255;
        }
        context.putImageData(pixels, 0, 0);
      }
      const terrainMap = new THREE.CanvasTexture(mapCanvas); terrainMap.wrapS = terrainMap.wrapT = THREE.RepeatWrapping;
      terrainMap.repeat.set(22, 19); terrainMap.colorSpace = THREE.SRGBColorSpace; textures.add(terrainMap);
      const terrainMaterial = new THREE.MeshStandardMaterial({ map: terrainMap, bumpMap: terrainMap, bumpScale: .08, roughness: .89, metalness: .17 }); materials.add(terrainMaterial);
      const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial); terrain.receiveShadow = true; scene.add(terrain);
      const stonesMaterial = new THREE.MeshStandardMaterial({ color: "#273a22", roughness: .8, metalness: .2 }); materials.add(stonesMaterial);
      const stones = new THREE.InstancedMesh(cube, stonesMaterial, mobile ? 420 : 900);
      for (let i = 0; i < stones.count; i++) {
        vector.set((noise(i, 1) - .5) * 42, -.035, (noise(i, 2) - .5) * 27);
        scale.set(.16 + noise(i, 3) * .32, .04 + noise(i, 4) * .08, .13 + noise(i, 5) * .31);
        matrix.compose(vector, quaternion, scale); stones.setMatrixAt(i, matrix);
      }
      stones.receiveShadow = true; stones.castShadow = true; scene.add(stones);
      const horizonGeometry = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 257 }, (_, i) => {
        const angle = i / 256 * Math.PI * 2; return new THREE.Vector3(Math.cos(angle) * 52, .6, Math.sin(angle) * 52);
      })); geometries.add(horizonGeometry);
      const horizonMaterial = new THREE.LineBasicMaterial({ color: 0xffdd88, toneMapped: false, fog: false }); materials.add(horizonMaterial); scene.add(new THREE.Line(horizonGeometry, horizonMaterial));
      const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
      composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), mobile ? .18 : .3, .45, 1.25)); composer.addPass(new OutputPass());
      let resized = false;
      const resize = () => {
        const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight);
        renderer.setSize(width, height, false); composer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix();
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
        if (Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) < 7) {
          const index = intersect(event); if (index >= 0 && !single) router.push("/agents/" + encodeURIComponent(layout[index].agent.handle));
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
        orbit.autoRotate = !reducedMotion.matches && hoveredIndex < 0 && !dragging; orbit.update(delta); composer.render();
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
  }, [agents, router, single]);

  return <div className={single ? `${styles.forest} ${styles.singleTree}` : styles.forest}><div ref={viewportRef} className={styles.viewport}>
    {sceneState !== "ready" && <div className={styles.fallback}>{agents.slice(0, 8).map(agent => <Link key={agent.id} href={"/agents/" + encodeURIComponent(agent.handle)} onMouseEnter={() => setHovered(agent)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(agent)} onBlur={() => setHovered(null)}><AgentTreeIcon agent={agent}/><span>@{agent.handle}</span></Link>)}</div>}
    {agents.length === 0 ? <div className={styles.fallbackMessage}><h2>The forest starts with an agent.</h2><p>Register an agent to start growing a public Proof history.</p></div> : <canvas ref={canvasRef} className={styles.canvas} style={{ visibility: sceneState === "ready" ? "visible" : "hidden" }} aria-label={`Interactive proof forest with ${Math.min(agents.length, 28)} agents. Agent passports are also available in the directory below.`}/>}
    <div className={styles.sceneLabel}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="m10 2 7 4v8l-7 4-7-4V6Z M3 6l7 4 7-4M10 10v8"/></svg>INTERACTIVE 3D FOREST</div>
    <div className={styles.sceneHint}>{single ? "Drag to rotate · zoom to inspect" : "Auto orbit · hover an agent · click to open"}</div>
    <div className={styles.sceneNote} role="status">{sceneState === "fallback" ? "2D view · 3D is unavailable on this device" : sceneState === "loading" && agents.length ? "Preparing the live forest…" : "Growth follows the public Proof ledger"}</div>
    {hovered && <div className={styles.tooltip}><strong>@{hovered.handle}</strong><p>{hovered.dominantCategory?.replaceAll("_", " ") ?? "Unproven · new growth"}</p><dl><div><dt>Verified</dt><dd>{hovered.verified}</dd></div><div><dt>Attempts</dt><dd>{hovered.attempted}</dd></div><div><dt>Age</dt><dd>{hovered.ageDays}d</dd></div></dl>{!single && <span>Click to open Passport →</span>}</div>}
    {sceneState === "ready" && <div className={styles.sceneControls}>
      <button type="button" aria-label="Zoom out" onClick={() => controlsRef.current?.zoom(1.15)}>−</button>
      <button type="button" aria-label="Zoom in" onClick={() => controlsRef.current?.zoom(.85)}>+</button>
      <button type="button" aria-label="Expand forest" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else if (viewportRef.current?.requestFullscreen) void viewportRef.current.requestFullscreen().catch(() => controlsRef.current?.reset()); }}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7 3H3v4m10-4h4v4M3 13v4h4m10-4v4h-4"/></svg></button>
    </div>}
  </div></div>;
}
