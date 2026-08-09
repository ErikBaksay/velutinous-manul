import * as THREE from 'three';
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  AuthoritativeMapData,
  DepositSource,
} from './map/map-types';
import { sampleHeight } from './terrain-chunk-renderer';
import { ACTIVE_CHUNK_RADIUS, TERRAIN_CHUNK_SIZE } from './terrain-chunk-renderer';

const CHUNKS_PER_SIDE = MAP_WIDTH / TERRAIN_CHUNK_SIZE;
const ROCKS_PER_DEPOSIT = 3;
const MARKER_RING_SCALE = 0.76;
const MARKER_CLEARANCE = 0.16;
const OUTCROP_COLORS: Readonly<Record<DepositSource['kind'], number>> = Object.freeze({
  'iron-ore': 0x9a5840,
  'copper-ore': 0x65b29c,
  stone: 0xb9b0a4,
});

export class DepositChunkRenderer {
  private readonly group = new THREE.Group();
  private readonly rockGeometry = new THREE.DodecahedronGeometry(1, 0);
  private readonly rockMaterials = new Map<DepositSource['kind'], THREE.MeshStandardMaterial>();
  private readonly ringGeometry = new THREE.RingGeometry(0.72, 0.84, 20);
  private readonly ringMaterials = new Map<DepositSource['kind'], THREE.MeshBasicMaterial>();
  private readonly rockMeshes: THREE.InstancedMesh[] = [];
  private readonly markerRings: THREE.Mesh[] = [];

  constructor(scene: THREE.Scene, data: AuthoritativeMapData) {
    this.group.name = 'deposit-outcrops';
    this.buildActiveDeposits(data);
    scene.add(this.group);
  }

  destroy(): void {
    this.group.removeFromParent();
    this.rockGeometry.dispose();
    this.ringGeometry.dispose();
    for (const material of this.rockMaterials.values()) {
      material.dispose();
    }
    for (const material of this.ringMaterials.values()) {
      material.dispose();
    }
    this.rockMeshes.length = 0;
    this.markerRings.length = 0;
    this.rockMaterials.clear();
    this.ringMaterials.clear();
  }

  private buildActiveDeposits(data: AuthoritativeMapData): void {
    const activeDeposits = data.deposits.filter((deposit) => isActiveDeposit(deposit));
    for (const kind of Object.keys(OUTCROP_COLORS) as DepositSource['kind'][]) {
      const deposits = activeDeposits.filter((deposit) => deposit.kind === kind);
      if (deposits.length === 0) {
        continue;
      }

      const rockMaterial = this.getRockMaterial(kind);
      const rocks = new THREE.InstancedMesh(
        this.rockGeometry,
        rockMaterial,
        deposits.length * ROCKS_PER_DEPOSIT,
      );
      rocks.name = `deposit-outcrops-${kind}`;
      placeOutcropInstances(data, deposits, rocks);
      this.group.add(rocks);
      this.rockMeshes.push(rocks);

      const ringMaterial = this.getRingMaterial(kind);
      for (const deposit of deposits) {
        const ring = createMarkerRing(data, deposit, this.ringGeometry, ringMaterial);
        this.group.add(ring);
        this.markerRings.push(ring);
      }
    }
  }

  private getRockMaterial(kind: DepositSource['kind']): THREE.MeshStandardMaterial {
    let material = this.rockMaterials.get(kind);
    if (!material) {
      material = new THREE.MeshStandardMaterial({
        color: OUTCROP_COLORS[kind],
        roughness: 0.92,
        metalness: 0.02,
      });
      this.rockMaterials.set(kind, material);
    }
    return material;
  }

  private getRingMaterial(kind: DepositSource['kind']): THREE.MeshBasicMaterial {
    let material = this.ringMaterials.get(kind);
    if (!material) {
      material = new THREE.MeshBasicMaterial({
        color: OUTCROP_COLORS[kind],
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      this.ringMaterials.set(kind, material);
    }
    return material;
  }
}

export function countActiveDeposits(data: AuthoritativeMapData): number {
  return data.deposits.filter((deposit) => isActiveDeposit(deposit)).length;
}

function placeOutcropInstances(
  data: AuthoritativeMapData,
  deposits: readonly DepositSource[],
  rocks: THREE.InstancedMesh,
): void {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  let instanceIndex = 0;

  for (const deposit of deposits) {
    const centerX = deposit.centerCell % MAP_WIDTH;
    const centerY = Math.floor(deposit.centerCell / MAP_WIDTH);
    for (let rockIndex = 0; rockIndex < ROCKS_PER_DEPOSIT; rockIndex += 1) {
      const variation = hashDeposit(deposit.id, rockIndex);
      const spread = deposit.radius * 0.42;
      const offsetX = ((variation & 0xff) / 255 - 0.5) * spread;
      const offsetY = (((variation >>> 8) & 0xff) / 255 - 0.5) * spread;
      const sampleX = Math.round(centerX + offsetX);
      const sampleY = Math.round(centerY + offsetY);
      const rockScale = 0.86 + ((variation >>> 16) & 0xff) / 255 * 0.62;
      position.set(
        centerX - MAP_WIDTH / 2 + 0.5 + offsetX,
        sampleHeight(data, sampleX, sampleY) + rockScale * 0.72,
        centerY - MAP_HEIGHT / 2 + 0.5 + offsetY,
      );
      rotation.setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        ((variation >>> 24) / 255) * Math.PI * 2,
      );
      scale.set(rockScale, rockScale * (0.72 + rockIndex * 0.08), rockScale);
      matrix.compose(position, rotation, scale);
      rocks.setMatrixAt(instanceIndex, matrix);
      instanceIndex += 1;
    }
  }
  rocks.instanceMatrix.needsUpdate = true;
}

function createMarkerRing(
  data: AuthoritativeMapData,
  deposit: DepositSource,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
): THREE.Mesh {
  const centerX = deposit.centerCell % MAP_WIDTH;
  const centerY = Math.floor(deposit.centerCell / MAP_WIDTH);
  const ring = new THREE.Mesh(geometry, material);
  ring.name = `deposit-marker-${deposit.id}`;
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(
    centerX - MAP_WIDTH / 2 + 0.5,
    getMarkerElevation(data, centerX, centerY, deposit.radius) + MARKER_CLEARANCE,
    centerY - MAP_HEIGHT / 2 + 0.5,
  );
  ring.scale.setScalar(deposit.radius * MARKER_RING_SCALE);
  ring.renderOrder = 3;
  return ring;
}

function getMarkerElevation(
  data: AuthoritativeMapData,
  centerX: number,
  centerY: number,
  radius: number,
): number {
  let maximumElevation = sampleHeight(data, centerX, centerY);
  const minimumX = Math.max(0, centerX - radius);
  const maximumX = Math.min(MAP_WIDTH, centerX + radius);
  const minimumY = Math.max(0, centerY - radius);
  const maximumY = Math.min(MAP_HEIGHT, centerY + radius);

  for (let sampleY = minimumY; sampleY <= maximumY; sampleY += 1) {
    for (let sampleX = minimumX; sampleX <= maximumX; sampleX += 1) {
      const deltaX = sampleX - centerX;
      const deltaY = sampleY - centerY;
      if (deltaX * deltaX + deltaY * deltaY > radius * radius) {
        continue;
      }
      maximumElevation = Math.max(maximumElevation, sampleHeight(data, sampleX, sampleY));
    }
  }
  return maximumElevation;
}

function isActiveDeposit(deposit: DepositSource): boolean {
  const centerX = deposit.centerCell % MAP_WIDTH;
  const centerY = Math.floor(deposit.centerCell / MAP_WIDTH);
  const chunkX = Math.floor(centerX / TERRAIN_CHUNK_SIZE);
  const chunkY = Math.floor(centerY / TERRAIN_CHUNK_SIZE);
  const centerChunk = Math.floor(CHUNKS_PER_SIDE / 2);
  return (
    Math.abs(chunkX - centerChunk) <= ACTIVE_CHUNK_RADIUS &&
    Math.abs(chunkY - centerChunk) <= ACTIVE_CHUNK_RADIUS
  );
}

function hashDeposit(depositId: number, variationIndex: number): number {
  let value = depositId ^ Math.imul(variationIndex + 1, 0x9e37_79b9);
  value = Math.imul(value ^ (value >>> 16), 0x85eb_ca6b);
  value = Math.imul(value ^ (value >>> 13), 0xc2b2_ae35);
  return (value ^ (value >>> 16)) >>> 0;
}
