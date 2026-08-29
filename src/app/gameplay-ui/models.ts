import type { MineralResourceKind } from '../map/map-types';

export type GameplayTool =
  | 'select'
  | 'mine'
  | 'warehouse'
  | 'church'
  | 'residential'
  | 'road';

export type SystemsDrawerTab = 'towns' | 'logistics' | 'storage' | 'world';

export type GameplaySimulationSpeed = 1 | 2 | 4;

export interface MineralDepositOption {
  readonly id: number;
  readonly kind: MineralResourceKind;
}

export interface WarehouseOption {
  readonly id: string;
  readonly label: string;
}

export interface WorldOverviewSummary {
  readonly townCount: number;
  readonly populationCapacity: number;
  readonly workerCapacity: number;
  readonly activeVans: number;
  readonly pendingDeliveries: number;
  readonly blockedDeliveries: number;
  readonly completedDeliveries: number;
  readonly warehouseCount: number;
  readonly storedIronOre: number;
  readonly storedCopperOre: number;
  readonly storedStone: number;
  readonly presetLabel: string;
}

export interface TownSummary {
  readonly id: string;
  readonly name: string;
  readonly residenceCount: number;
  readonly populationCapacity: number;
  readonly workerCapacity: number;
}
