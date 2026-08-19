import {
  VELUTINOUS_MANUL_WAREHOUSE_DEFINITION,
  VELUTINOUS_MANUL_WAREHOUSE_DEFINITION_ID,
} from './warehouse';
import { getRotatedFootprintSize } from './footprint';

describe('Velutinous Manul warehouse definition', () => {
  it('defines the broad 15×6 strict-land logistics destination', () => {
    expect(VELUTINOUS_MANUL_WAREHOUSE_DEFINITION).toEqual({
      id: VELUTINOUS_MANUL_WAREHOUSE_DEFINITION_ID,
      footprint: { width: 15, height: 6 },
      placement: {
        requiresBuildable: true,
        allowWater: false,
        allowImpassable: false,
        maxSlope: 0.2,
      },
    });
  });

  it('occupies 6×15 cells after a quarter turn', () => {
    expect(getRotatedFootprintSize(VELUTINOUS_MANUL_WAREHOUSE_DEFINITION.footprint, 1)).toEqual({
      width: 6,
      height: 15,
    });
  });
});
