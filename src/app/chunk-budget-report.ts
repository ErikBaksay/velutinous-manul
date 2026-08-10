import * as THREE from 'three';
import {
  BASE_CAMERA_VIEW_HEIGHT,
  MAX_CAMERA_VIEW_HEIGHT,
  MIN_CAMERA_VIEW_HEIGHT,
} from './camera-controller';
import {
  ChunkViewSelection,
  selectChunksForView,
} from './chunk-visibility';

export interface ChunkBudgetMeasurement {
  readonly label: string;
  readonly aspect: number;
  readonly viewHeight: number;
  readonly elevationDegrees: number;
  readonly targetX: number;
  readonly targetZ: number;
  readonly headingDegrees: number;
  readonly visibleCount: number;
  readonly desiredCount: number;
  readonly candidateCount: number;
  readonly budgetState: ChunkViewSelection['budgetState'];
}

export interface ChunkBudgetReport {
  readonly measurements: readonly ChunkBudgetMeasurement[];
  readonly peakVisibleCount: number;
  readonly peakDesiredCount: number;
  readonly peakCandidateCount: number;
}

const VIEWPORTS = [
  { label: '16:9', aspect: 16 / 9 },
  { label: '4:3', aspect: 4 / 3 },
  { label: '1:1', aspect: 1 },
  { label: '2:1', aspect: 2 },
  { label: '2.4:1', aspect: 2.4 },
] as const;
const VIEW_HEIGHTS = [MIN_CAMERA_VIEW_HEIGHT, BASE_CAMERA_VIEW_HEIGHT, MAX_CAMERA_VIEW_HEIGHT] as const;
const ELEVATIONS = [40, 55, 70, 80, 88] as const;
const HEADINGS = [0, 45, 90, 135] as const;
const TARGETS = [
  { label: 'center', x: 0, z: 0 },
  { label: 'north-edge', x: 0, z: -384 },
  { label: 'south-edge', x: 0, z: 384 },
  { label: 'west-edge', x: -384, z: 0 },
  { label: 'east-edge', x: 384, z: 0 },
  { label: 'north-west-corner', x: -384, z: -384 },
  { label: 'north-east-corner', x: 384, z: -384 },
  { label: 'south-west-corner', x: -384, z: 384 },
  { label: 'south-east-corner', x: 384, z: 384 },
] as const;

export function measureRepresentativeChunkBudgets(): ChunkBudgetReport {
  const measurements: ChunkBudgetMeasurement[] = [];

  for (const viewport of VIEWPORTS) {
    for (const viewHeight of VIEW_HEIGHTS) {
      for (const elevationDegrees of ELEVATIONS) {
        for (const target of TARGETS) {
          for (const headingDegrees of HEADINGS) {
            const camera = createMeasurementCamera(
              viewport.aspect,
              viewHeight,
              elevationDegrees,
              target.x,
              target.z,
              headingDegrees,
            );
            const selection = selectChunksForView(camera);
            measurements.push({
              label: `${viewport.label}/${target.label}`,
              aspect: viewport.aspect,
              viewHeight,
              elevationDegrees,
              targetX: target.x,
              targetZ: target.z,
              headingDegrees,
              visibleCount: selection.visible.length,
              desiredCount: selection.desired.length,
              candidateCount: selection.candidateCount,
              budgetState: selection.budgetState,
            });
          }
        }
      }
    }
  }

  return {
    measurements,
    peakVisibleCount: Math.max(...measurements.map((measurement) => measurement.visibleCount)),
    peakDesiredCount: Math.max(...measurements.map((measurement) => measurement.desiredCount)),
    peakCandidateCount: Math.max(...measurements.map((measurement) => measurement.candidateCount)),
  };
}

function createMeasurementCamera(
  aspect: number,
  viewHeight: number,
  elevationDegrees: number,
  targetX: number,
  targetZ: number,
  headingDegrees: number,
): THREE.OrthographicCamera {
  const camera = new THREE.OrthographicCamera(
    (-BASE_CAMERA_VIEW_HEIGHT * aspect) / 2,
    (BASE_CAMERA_VIEW_HEIGHT * aspect) / 2,
    BASE_CAMERA_VIEW_HEIGHT / 2,
    -BASE_CAMERA_VIEW_HEIGHT / 2,
    0.1,
    1_800,
  );
  const horizontalRadius = Math.sqrt(90 ** 2 + 90 ** 2);
  const heading = THREE.MathUtils.degToRad(headingDegrees);
  const elevation = THREE.MathUtils.degToRad(elevationDegrees);
  const heightOffset = horizontalRadius * Math.tan(elevation);
  camera.position.set(
    targetX + Math.sin(heading) * horizontalRadius,
    18 + heightOffset,
    targetZ + Math.cos(heading) * horizontalRadius,
  );
  camera.lookAt(targetX, 18, targetZ);
  camera.zoom = BASE_CAMERA_VIEW_HEIGHT / viewHeight;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}
