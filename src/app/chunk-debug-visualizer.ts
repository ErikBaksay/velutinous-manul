import * as THREE from 'three';
import {
  ChunkBudgetReport,
  measureRepresentativeChunkBudgets,
} from './chunk-budget-report';
import {
  CHUNK_PREFETCH_RADIUS,
  ChunkViewSelection,
  chunkKey,
  createChunkSelectionSignature,
  getChunkWorldBounds,
  INITIAL_DESIRED_CHUNK_BUDGET,
  LogicalChunkCoordinate,
  MAX_CHUNK_CONTENT_HEIGHT,
} from './chunk-visibility';
import { ChunkStreamingDiagnostics } from './chunk-streaming-manager';
import { TERRAIN_CHUNK_SIZE } from './terrain-chunk-renderer';

export class ChunkDebugVisualizer {
  private readonly group = new THREE.Group();
  private readonly visibleGroup = new THREE.Group();
  private readonly prefetchGroup = new THREE.Group();
  private readonly rejectedGroup = new THREE.Group();
  private readonly boxGeometry: THREE.BufferGeometry;
  private readonly visibleMaterial = createLineMaterial(0x86d39c);
  private readonly prefetchMaterial = createLineMaterial(0xe3ae73);
  private readonly rejectedMaterial = createLineMaterial(0xe17868);
  private readonly metricsElement: HTMLPreElement;
  private readonly budgetReport: ChunkBudgetReport;
  private lastSignature = '';

  constructor(scene: THREE.Scene, host: HTMLElement) {
    this.group.name = 'chunk-stream-debug';
    this.visibleGroup.name = 'visible-chunks';
    this.prefetchGroup.name = 'prefetch-chunks';
    this.rejectedGroup.name = 'rejected-chunks';
    this.group.add(this.visibleGroup, this.prefetchGroup, this.rejectedGroup);
    const boxGeometry = new THREE.BoxGeometry(
      TERRAIN_CHUNK_SIZE,
      MAX_CHUNK_CONTENT_HEIGHT,
      TERRAIN_CHUNK_SIZE,
    );
    this.boxGeometry = new THREE.EdgesGeometry(boxGeometry);
    boxGeometry.dispose();
    scene.add(this.group);
    this.budgetReport = measureRepresentativeChunkBudgets();

    this.metricsElement = document.createElement('pre');
    this.metricsElement.className = 'chunk-stream-debug-metrics';
    this.metricsElement.style.cssText = [
      'position:absolute',
      'top:24px',
      'right:24px',
      'z-index:4',
      'margin:0',
      'padding:12px 14px',
      'color:#d9f3df',
      'background:rgba(13,18,22,.86)',
      'border:1px solid rgba(134,211,156,.45)',
      'border-radius:8px',
      'font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace',
      'white-space:pre',
      'pointer-events:none',
    ].join(';');
    host.append(this.metricsElement);
  }

  update(selection: ChunkViewSelection, diagnostics: ChunkStreamingDiagnostics): void {
    const signature = createChunkSelectionSignature(selection);
    if (signature !== this.lastSignature) {
      this.replaceChunkLines(this.visibleGroup, selection.visible, this.visibleMaterial);
      const rejectedKeys = new Set(selection.rejected.map(chunkKey));
      this.replaceChunkLines(
        this.prefetchGroup,
        selection.prefetch.filter((chunk) => !rejectedKeys.has(chunkKey(chunk))),
        this.prefetchMaterial,
      );
      this.replaceChunkLines(this.rejectedGroup, selection.rejected, this.rejectedMaterial);
      this.lastSignature = signature;
    }

    const budgetMessage = selection.budgetState === 'within-budget'
      ? `tuning (${INITIAL_DESIRED_CHUNK_BUDGET} desired)`
      : selection.budgetState === 'prefetch-over-budget'
        ? 'prefetch over initial budget'
        : 'visible set exceeds initial budget';
    this.metricsElement.textContent = [
      'CHUNK STREAMING DEBUG',
      `visible:    ${selection.visible.length}`,
      `prefetch:   ${selection.prefetch.length}`,
      `desired:    ${selection.desired.length}`,
      `attached:   ${diagnostics.attachedCount}`,
      `retained:   ${diagnostics.retainedCount}`,
      `queued:     ${diagnostics.queuedCount}`,
      `building:   ${diagnostics.inFlightCount}`,
      `rejected:   ${selection.rejected.length}`,
      `candidates: ${selection.candidateCount}`,
      `peak view:  ${diagnostics.peakVisibleCount}`,
      `last build: ${formatMilliseconds(diagnostics.lastBundleBuildMs)}`,
      `rolling:    ${formatMilliseconds(diagnostics.rollingBundleBuildMs)}`,
      `budget:     ${budgetMessage} / ${diagnostics.buildBudgetMs} ms target`,
      `survey:     ${this.budgetReport.measurements.length} camera cases`,
      `survey peak: visible ${this.budgetReport.peakVisibleCount}, desired ${this.budgetReport.peakDesiredCount}`,
      `prefetch:   ${CHUNK_PREFETCH_RADIUS}-chunk ring`,
      `map epoch:  ${diagnostics.mapEpoch}`,
      `initial:    ${diagnostics.initialReady ? 'ready' : 'streaming'}`,
    ].join('\n');
  }

  dispose(): void {
    this.group.removeFromParent();
    this.boxGeometry.dispose();
    this.visibleMaterial.dispose();
    this.prefetchMaterial.dispose();
    this.rejectedMaterial.dispose();
    this.metricsElement.remove();
  }

  private replaceChunkLines(
    group: THREE.Group,
    chunks: readonly LogicalChunkCoordinate[],
    material: THREE.LineBasicMaterial,
  ): void {
    group.clear();
    for (const chunk of chunks) {
      const bounds = getChunkWorldBounds(chunk.x, chunk.y);
      const line = new THREE.LineSegments(this.boxGeometry, material);
      line.position.set(
        (bounds.min.x + bounds.max.x) / 2,
        (bounds.min.y + bounds.max.y) / 2,
        (bounds.min.z + bounds.max.z) / 2,
      );
      group.add(line);
    }
  }
}

function formatMilliseconds(milliseconds: number | null): string {
  return milliseconds === null ? '—' : `${milliseconds.toFixed(2)} ms`;
}

function createLineMaterial(color: number): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.72,
    depthTest: false,
    depthWrite: false,
  });
}
