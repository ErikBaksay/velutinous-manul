import * as THREE from 'three';
import { CameraDebugState } from './camera-controller';
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
import { RenderDiagnostics } from './render-diagnostics';
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
  private readonly metricsOnly: boolean;
  private lastSignature = '';

  constructor(scene: THREE.Scene, host: HTMLElement) {
    this.metricsOnly = typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('metrics') === 'only';
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
    this.metricsElement.dataset['testid'] = 'chunk-stream-debug-metrics';
    this.metricsElement.setAttribute('aria-label', 'Chunk streaming diagnostics');
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

  update(
    selection: ChunkViewSelection,
    diagnostics: ChunkStreamingDiagnostics,
    camera: CameraDebugState,
    render: RenderDiagnostics,
  ): void {
    const signature = createChunkSelectionSignature(selection);
    if (!this.metricsOnly && signature !== this.lastSignature) {
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

    const activeDesiredCount = selection.desired.length - selection.rejected.length;
    const attachedKeys = new Set(diagnostics.attachedKeys);
    const rejectedKeys = new Set(selection.rejected.map(chunkKey));
    const activeDesiredKeys = [
      ...selection.visible,
      ...selection.prefetch.filter((chunk) => !rejectedKeys.has(chunkKey(chunk))),
    ].map(chunkKey);
    const missingDesiredCount = activeDesiredKeys.filter((key) => !attachedKeys.has(key)).length;
    const missingVisibleCount = selection.visible.filter((chunk) => !attachedKeys.has(chunkKey(chunk))).length;
    const frustumCulledCount = Math.max(selection.candidateCount - selection.visible.length, 0);
    const budgetMessage = selection.budgetState === 'within-budget'
      ? `tuning (${INITIAL_DESIRED_CHUNK_BUDGET} desired)`
      : selection.budgetState === 'prefetch-over-budget'
        ? 'prefetch over initial budget'
        : 'visible set exceeds initial budget';
    this.metricsElement.textContent = [
      'CHUNK STREAMING DEBUG',
      `visible:    ${selection.visible.length} (frustum)`,
      `prefetch:   ${selection.prefetch.length}`,
      `desired:    ${selection.desired.length}`,
      `active:     ${activeDesiredCount}`,
      `attached:   ${diagnostics.attachedCount}`,
      `missing:    ${missingDesiredCount}`,
      `missing visible: ${missingVisibleCount}`,
      `retained:   ${diagnostics.retainedCount}`,
      `queued:     ${diagnostics.queuedCount}`,
      `building:   ${diagnostics.inFlightCount}`,
      `rejected:   ${selection.rejected.length} (budget)`,
      `candidates: ${selection.candidateCount}`,
      `culled:     ${frustumCulledCount} (candidate bounds)`,
      `peak view:  ${diagnostics.peakVisibleCount}`,
      `environment: ${diagnostics.environmentInstanceCount} instances`,
      `last build: ${formatMilliseconds(diagnostics.lastBundleBuildMs)}`,
      `rolling:    ${formatMilliseconds(diagnostics.rollingBundleBuildMs)}`,
      `budget:     ${budgetMessage} / ${diagnostics.buildBudgetMs} ms target`,
      `survey:     ${this.budgetReport.measurements.length} camera cases`,
      `survey peak: visible ${this.budgetReport.peakVisibleCount}, desired ${this.budgetReport.peakDesiredCount}`,
      `prefetch:   ${CHUNK_PREFETCH_RADIUS}-chunk ring`,
      `map epoch:  ${diagnostics.mapEpoch}`,
      `selection:  ${diagnostics.selectionRevision}`,
      `initial:    ${diagnostics.initialReady ? 'ready' : 'streaming'}`,
      `quality:    ${render.quality}`,
      `fps:        ${render.fps.toFixed(1)} (${render.frameTimeMs.toFixed(2)} ms)`,
      `render CPU: ${render.renderCpuMs.toFixed(2)} ms`,
      `scene CPU:  ${render.sceneRenderCpuMs.toFixed(2)} ms`,
      `shadow CPU: ${render.shadowPassCpuMs.toFixed(2)} ms`,
      `GTAO CPU:   ${render.gtaoPassCpuMs.toFixed(2)} ms`,
      `draw calls: ${render.drawCalls}`,
      `triangles:  ${render.triangles}`,
      `camera:     ${formatVector(camera.position)}`,
      `target:     ${formatVector(camera.target)}`,
      `pivot y:    ${camera.navigationPlaneY.toFixed(2)}`,
      `zoom:       ${camera.zoom.toFixed(4)}`,
      `view height:${camera.visibleViewHeight.toFixed(2)}`,
      `polar:      ${camera.polarAngleDegrees.toFixed(2)}°`,
      `elevation:  ${camera.elevationDegrees.toFixed(2)}°`,
      `heading:    ${camera.headingDegrees.toFixed(2)}°`,
      `limits:     elev ${camera.minimumElevationDegrees.toFixed(1)}–${camera.maximumElevationDegrees.toFixed(1)}° / zoom ${camera.minimumZoom.toFixed(4)}–${camera.maximumZoom.toFixed(4)}`,
      `target:     ${camera.targetClamped ? 'clamped this frame' : 'free within bounds'}`,
      `input:      navigation ${camera.navigationEnabled ? 'enabled' : 'locked'}, focus ${camera.sceneHasFocus ? 'yes' : 'no'}`,
    ].join('\n');

    this.metricsElement.dataset['visible'] = String(selection.visible.length);
    this.metricsElement.dataset['prefetch'] = String(selection.prefetch.length);
    this.metricsElement.dataset['desired'] = String(selection.desired.length);
    this.metricsElement.dataset['activeDesired'] = String(activeDesiredCount);
    this.metricsElement.dataset['attached'] = String(diagnostics.attachedCount);
    this.metricsElement.dataset['missingDesired'] = String(missingDesiredCount);
    this.metricsElement.dataset['missingVisible'] = String(missingVisibleCount);
    this.metricsElement.dataset['attachedChunks'] = diagnostics.attachedKeys.join(',');
    this.metricsElement.dataset['queued'] = String(diagnostics.queuedCount);
    this.metricsElement.dataset['building'] = String(diagnostics.inFlightCount);
    this.metricsElement.dataset['rejected'] = String(selection.rejected.length);
    this.metricsElement.dataset['candidates'] = String(selection.candidateCount);
    this.metricsElement.dataset['frustumCulled'] = String(frustumCulledCount);
    this.metricsElement.dataset['initial'] = diagnostics.initialReady ? 'ready' : 'streaming';
    this.metricsElement.dataset['environmentInstances'] = String(diagnostics.environmentInstanceCount);
    this.metricsElement.dataset['quality'] = render.quality;
    this.metricsElement.dataset['fps'] = String(render.fps);
    this.metricsElement.dataset['frameTime'] = String(render.frameTimeMs);
    this.metricsElement.dataset['renderCpu'] = String(render.renderCpuMs);
    this.metricsElement.dataset['sceneRenderCpu'] = String(render.sceneRenderCpuMs);
    this.metricsElement.dataset['shadowCpu'] = String(render.shadowPassCpuMs);
    this.metricsElement.dataset['gtaoCpu'] = String(render.gtaoPassCpuMs);
    this.metricsElement.dataset['drawCalls'] = String(render.drawCalls);
    this.metricsElement.dataset['triangles'] = String(render.triangles);
    this.metricsElement.dataset['selectionRevision'] = String(diagnostics.selectionRevision);
    this.metricsElement.dataset['visibleChunks'] = selection.visible.map(chunkKey).join(',');
    this.metricsElement.dataset['prefetchChunks'] = selection.prefetch.map(chunkKey).join(',');
    this.metricsElement.dataset['rejectedChunks'] = selection.rejected.map(chunkKey).join(',');
    this.metricsElement.dataset['cameraPosition'] = formatVector(camera.position);
    this.metricsElement.dataset['cameraTarget'] = formatVector(camera.target);
    this.metricsElement.dataset['navigationPlaneY'] = String(camera.navigationPlaneY);
    this.metricsElement.dataset['zoomValue'] = String(camera.zoom);
    this.metricsElement.dataset['visibleViewHeight'] = String(camera.visibleViewHeight);
    this.metricsElement.dataset['targetClamped'] = String(camera.targetClamped);
    this.metricsElement.dataset['minimumZoom'] = String(camera.minimumZoom);
    this.metricsElement.dataset['maximumZoom'] = String(camera.maximumZoom);
    this.metricsElement.dataset['minimumElevation'] = String(camera.minimumElevationDegrees);
    this.metricsElement.dataset['maximumElevation'] = String(camera.maximumElevationDegrees);
    this.metricsElement.dataset['polarAngle'] = String(camera.polarAngleDegrees);
    this.metricsElement.dataset['elevation'] = String(camera.elevationDegrees);
    this.metricsElement.dataset['heading'] = String(camera.headingDegrees);
    this.metricsElement.dataset['navigationEnabled'] = String(camera.navigationEnabled);
    this.metricsElement.dataset['sceneHasFocus'] = String(camera.sceneHasFocus);
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

function formatVector(vector: readonly [number, number, number]): string {
  return vector.map((component) => component.toFixed(2)).join(',');
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
