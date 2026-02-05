/**
 * DreamRenderer - Sora-inspired dream visualization mode.
 * Manages aurora background, flowing trail particles between nodes,
 * ambient dust motes, and floating memory text bubbles.
 */
import * as THREE from 'three';
import dreamShaderCode from './shaders/dream-bg.frag.glsl?raw';

const DREAM_PALETTE = [
  new THREE.Color(0x6B2FB5), new THREE.Color(0x00d4ff),
  new THREE.Color(0xff00ff), new THREE.Color(0xffd700),
  new THREE.Color(0x4a1d8f), new THREE.Color(0x10B981),
];

const FLOW_COUNT = 1500;
const DUST_COUNT = 500;
const MAX_BUBBLES = 8;
const BUBBLE_MIN = 3.0;
const BUBBLE_MAX = 5.0;

interface ParticleState {
  sourceIdx: number; targetIdx: number;
  progress: number; speed: number; arcHeight: number;
}
interface DustState { vx: number; vy: number; vz: number; phase: number; }
interface TextBubble {
  sprite: THREE.Sprite; velocity: THREE.Vector3;
  age: number; maxAge: number; canvasTexture: THREE.CanvasTexture;
}

const bgVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export class DreamRenderer {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private backgroundMesh: THREE.Mesh | null = null;
  private backgroundMaterial: THREE.ShaderMaterial | null = null;
  private backgroundGeometry: THREE.PlaneGeometry | null = null;
  private particleSystem: THREE.Points | null = null;
  private particleGeometry: THREE.BufferGeometry | null = null;
  private particleMaterial: THREE.PointsMaterial | null = null;
  private ambientParticles: THREE.Points | null = null;
  private ambientGeometry: THREE.BufferGeometry | null = null;
  private ambientMaterial: THREE.PointsMaterial | null = null;
  private memoryBubbles: TextBubble[] = [];
  private dreamGroup: THREE.Group;
  private time = 0;
  private nodePositions: { x: number; y: number; z: number }[] = [];
  private memoryTexts: string[] = [];
  private isActive = false;
  private flowStates: ParticleState[] = [];
  private flowPositions!: Float32Array;
  private flowColors!: Float32Array;
  private dustStates: DustState[] = [];
  private dustPositions!: Float32Array;
  private bubbleTimer = 0;
  private nextBubbleInterval = 4.0;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.scene = scene;
    this.camera = camera;
    this.dreamGroup = new THREE.Group();
    this.dreamGroup.visible = false;
    this.scene.add(this.dreamGroup);
    this.initFlowArrays();
    this.initDustArrays();
    this.backgroundMesh = this.createBackground();
    this.particleSystem = this.createParticleSystem();
    this.ambientParticles = this.createAmbientParticles();
  }

  setVisible(visible: boolean): void {
    this.dreamGroup.visible = visible;
    this.isActive = visible;
    if (this.particleSystem) this.particleSystem.visible = visible;
    if (this.ambientParticles) this.ambientParticles.visible = visible;
  }

  setNodeData(positions: { x: number; y: number; z: number }[], texts: string[]): void {
    this.nodePositions = positions;
    this.memoryTexts = texts;
    if (positions.length > 0) this.seedFlowParticles();
  }

  update(deltaTime: number): void {
    if (!this.isActive) return;
    this.time += deltaTime;
    this.updateBackground();
    this.updateFlowParticles(deltaTime);
    this.updateAmbientDust(deltaTime);
    this.updateTextBubbles(deltaTime);
  }

  dispose(): void {
    for (const b of this.memoryBubbles) {
      this.dreamGroup.remove(b.sprite);
      b.sprite.material.dispose();
      b.canvasTexture.dispose();
    }
    this.memoryBubbles = [];
    if (this.backgroundGeometry) this.backgroundGeometry.dispose();
    if (this.backgroundMaterial) this.backgroundMaterial.dispose();
    if (this.particleGeometry) this.particleGeometry.dispose();
    if (this.particleMaterial) this.particleMaterial.dispose();
    if (this.ambientGeometry) this.ambientGeometry.dispose();
    if (this.ambientMaterial) this.ambientMaterial.dispose();
    this.scene.remove(this.dreamGroup);
  }

  // -- Init helpers --

  private initFlowArrays(): void {
    this.flowPositions = new Float32Array(FLOW_COUNT * 3);
    this.flowColors = new Float32Array(FLOW_COUNT * 3);
    this.flowStates = [];
    for (let i = 0; i < FLOW_COUNT; i++) {
      this.flowStates.push({
        sourceIdx: 0, targetIdx: 0, progress: Math.random(),
        speed: 0.2 + Math.random() * 0.6, arcHeight: 20 + Math.random() * 80,
      });
      const c = this.randomPaletteColor();
      this.flowColors[i * 3] = c.r;
      this.flowColors[i * 3 + 1] = c.g;
      this.flowColors[i * 3 + 2] = c.b;
    }
  }

  private initDustArrays(): void {
    this.dustPositions = new Float32Array(DUST_COUNT * 3);
    this.dustStates = [];
    for (let i = 0; i < DUST_COUNT; i++) {
      this.dustPositions[i * 3] = (Math.random() - 0.5) * 4000;
      this.dustPositions[i * 3 + 1] = (Math.random() - 0.5) * 4000;
      this.dustPositions[i * 3 + 2] = (Math.random() - 0.5) * 4000;
      this.dustStates.push({
        vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4,
        vz: (Math.random() - 0.5) * 4, phase: Math.random() * Math.PI * 2,
      });
    }
  }

  private seedFlowParticles(): void {
    const n = this.nodePositions.length;
    if (n === 0) return;
    for (let i = 0; i < FLOW_COUNT; i++) {
      const s = this.flowStates[i];
      s.sourceIdx = Math.floor(Math.random() * n);
      s.targetIdx = Math.floor(Math.random() * n);
      if (s.targetIdx === s.sourceIdx) s.targetIdx = (s.targetIdx + 1) % n;
      s.progress = Math.random();
      const pos = this.evalBezier(s);
      this.flowPositions[i * 3] = pos.x;
      this.flowPositions[i * 3 + 1] = pos.y;
      this.flowPositions[i * 3 + 2] = pos.z;
    }
    if (this.particleGeometry) {
      (this.particleGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  // -- Object creation --

  private createBackground(): THREE.Mesh {
    const geometry = new THREE.PlaneGeometry(10000, 10000);
    const material = new THREE.ShaderMaterial({
      vertexShader: bgVertexShader,
      fragmentShader: dreamShaderCode,
      uniforms: {
        uTime: { value: 0 }, uIntensity: { value: 0.7 },
        uResolution: { value: new THREE.Vector2(1920, 1080) },
      },
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(0, 0, -2000);
    mesh.renderOrder = -1;
    this.backgroundGeometry = geometry;
    this.backgroundMaterial = material;
    this.dreamGroup.add(mesh);
    return mesh;
  }

  private createParticleSystem(): THREE.Points {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.flowPositions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.flowColors, 3));
    const material = new THREE.PointsMaterial({
      size: 6, vertexColors: true, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    this.particleGeometry = geometry;
    this.particleMaterial = material;
    this.dreamGroup.add(points);
    return points;
  }

  private createAmbientParticles(): THREE.Points {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.dustPositions, 3));
    const colors = new Float32Array(DUST_COUNT * 3);
    for (let i = 0; i < DUST_COUNT; i++) {
      const w = 0.7 + Math.random() * 0.3;
      colors[i * 3] = w * 0.9; colors[i * 3 + 1] = w * 0.85; colors[i * 3 + 2] = w;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: 3, vertexColors: true, transparent: true, opacity: 0.4,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    this.ambientGeometry = geometry;
    this.ambientMaterial = material;
    this.dreamGroup.add(points);
    return points;
  }

  private createTextBubble(text: string, position: THREE.Vector3): TextBubble {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    canvas.width = 512; canvas.height = 64;
    const display = text.length > 40 ? text.slice(0, 37) + '...' : text;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(26, 5, 51, 0.65)';
    this.roundRect(ctx, 4, 4, canvas.width - 8, canvas.height - 8, 12);
    ctx.shadowColor = '#00d4ff'; ctx.shadowBlur = 10;
    ctx.font = '24px monospace'; ctx.fillStyle = '#e0f8ff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(display, canvas.width / 2, canvas.height / 2);
    ctx.shadowBlur = 0;
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const spriteMat = new THREE.SpriteMaterial({
      map: texture, transparent: true, opacity: 1.0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.copy(position);
    sprite.scale.set(200, 25, 1);
    this.dreamGroup.add(sprite);
    return {
      sprite, velocity: new THREE.Vector3(0, 30, 0),
      age: 0, maxAge: 8, canvasTexture: texture,
    };
  }

  // -- Per-frame updates --

  private updateBackground(): void {
    if (!this.backgroundMaterial) return;
    this.backgroundMaterial.uniforms.uTime.value = this.time;
    if (this.backgroundMesh) this.backgroundMesh.lookAt(this.camera.position);
  }

  private updateFlowParticles(dt: number): void {
    const n = this.nodePositions.length;
    if (n < 2) return;
    const posAttr = this.particleGeometry?.getAttribute('position') as THREE.BufferAttribute | undefined;
    const colAttr = this.particleGeometry?.getAttribute('color') as THREE.BufferAttribute | undefined;
    if (!posAttr || !colAttr) return;

    for (let i = 0; i < FLOW_COUNT; i++) {
      const s = this.flowStates[i];
      s.progress += s.speed * dt;
      if (s.progress >= 1.0) {
        s.sourceIdx = s.targetIdx;
        s.targetIdx = Math.floor(Math.random() * n);
        if (s.targetIdx === s.sourceIdx) s.targetIdx = (s.targetIdx + 1) % n;
        s.progress = 0;
        s.speed = 0.2 + Math.random() * 0.6;
        s.arcHeight = 20 + Math.random() * 80;
      }
      const pos = this.evalBezier(s);
      this.flowPositions[i * 3] = pos.x;
      this.flowPositions[i * 3 + 1] = pos.y;
      this.flowPositions[i * 3 + 2] = pos.z;
      // Fade near endpoints via color brightness
      const fade = Math.sin(s.progress * Math.PI) * 0.9 + 0.1;
      const base = this.paletteColorAtTime(this.time + i * 0.1);
      this.flowColors[i * 3] = base.r * fade;
      this.flowColors[i * 3 + 1] = base.g * fade;
      this.flowColors[i * 3 + 2] = base.b * fade;
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }

  private updateAmbientDust(dt: number): void {
    const posAttr = this.ambientGeometry?.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!posAttr) return;
    for (let i = 0; i < DUST_COUNT; i++) {
      const d = this.dustStates[i];
      d.vx += (Math.random() - 0.5) * 2 * dt;
      d.vy += (Math.random() - 0.5) * 2 * dt;
      d.vz += (Math.random() - 0.5) * 2 * dt;
      d.vx *= 0.98; d.vy *= 0.98; d.vz *= 0.98;
      this.dustPositions[i * 3] += d.vx * dt * 10;
      this.dustPositions[i * 3 + 1] += d.vy * dt * 10;
      this.dustPositions[i * 3 + 2] += d.vz * dt * 10;
      for (let a = 0; a < 3; a++) {
        const idx = i * 3 + a;
        if (this.dustPositions[idx] > 2000) this.dustPositions[idx] = -2000;
        if (this.dustPositions[idx] < -2000) this.dustPositions[idx] = 2000;
      }
    }
    posAttr.needsUpdate = true;
    // Twinkle via uniform opacity oscillation
    if (this.ambientMaterial) {
      this.ambientMaterial.opacity = 0.35 + 0.15 * Math.sin(this.time * 0.7);
    }
  }

  private updateTextBubbles(dt: number): void {
    this.bubbleTimer += dt;
    if (this.bubbleTimer >= this.nextBubbleInterval
        && this.memoryTexts.length > 0 && this.nodePositions.length > 0) {
      this.bubbleTimer = 0;
      this.nextBubbleInterval = BUBBLE_MIN + Math.random() * (BUBBLE_MAX - BUBBLE_MIN);
      const np = this.nodePositions[Math.floor(Math.random() * this.nodePositions.length)];
      const bubble = this.createTextBubble(
        this.memoryTexts[Math.floor(Math.random() * this.memoryTexts.length)],
        new THREE.Vector3(np.x, np.y, np.z),
      );
      this.memoryBubbles.push(bubble);
      while (this.memoryBubbles.length > MAX_BUBBLES) {
        const old = this.memoryBubbles.shift()!;
        this.dreamGroup.remove(old.sprite);
        old.sprite.material.dispose();
        old.canvasTexture.dispose();
      }
    }
    for (let i = this.memoryBubbles.length - 1; i >= 0; i--) {
      const b = this.memoryBubbles[i];
      b.age += dt;
      b.sprite.position.y += b.velocity.y * dt;
      b.sprite.position.x += Math.sin(b.age * 0.8) * 12 * dt;
      const lifeRatio = b.age / b.maxAge;
      const fadeIn = Math.min(b.age / 0.5, 1.0);
      const fadeOut = 1.0 - Math.max((lifeRatio - 0.6) / 0.4, 0.0);
      (b.sprite.material as THREE.SpriteMaterial).opacity = fadeIn * fadeOut;
      if (b.age >= b.maxAge) {
        this.dreamGroup.remove(b.sprite);
        b.sprite.material.dispose();
        b.canvasTexture.dispose();
        this.memoryBubbles.splice(i, 1);
      }
    }
  }

  // -- Math / utility --

  private evalBezier(s: ParticleState): { x: number; y: number; z: number } {
    const n = this.nodePositions.length;
    const src = this.nodePositions[s.sourceIdx % n];
    const tgt = this.nodePositions[s.targetIdx % n];
    const mx = (src.x + tgt.x) * 0.5;
    const my = (src.y + tgt.y) * 0.5 + s.arcHeight;
    const mz = (src.z + tgt.z) * 0.5;
    const omt = 1 - s.progress, omt2 = omt * omt;
    const t2 = s.progress * s.progress, tt = 2 * omt * s.progress;
    return {
      x: omt2 * src.x + tt * mx + t2 * tgt.x,
      y: omt2 * src.y + tt * my + t2 * tgt.y,
      z: omt2 * src.z + tt * mz + t2 * tgt.z,
    };
  }

  private randomPaletteColor(): THREE.Color {
    return DREAM_PALETTE[Math.floor(Math.random() * DREAM_PALETTE.length)].clone();
  }

  private paletteColorAtTime(t: number): THREE.Color {
    const len = DREAM_PALETTE.length;
    const sc = ((t * 0.3) % len + len) % len;
    const idx = Math.floor(sc);
    return DREAM_PALETTE[idx].clone().lerp(DREAM_PALETTE[(idx + 1) % len], sc - idx);
  }

  private roundRect(
    ctx: CanvasRenderingContext2D, x: number, y: number,
    w: number, h: number, r: number,
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
  }
}

export default DreamRenderer;
