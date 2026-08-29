import { createVelutinousManulConstructionDefinitionRegistry } from '../construction';
import type { PlacedBuildingState, TownState } from '../save/save-contract';
import {
  addResidenceToTown,
  createTownState,
  evaluateResidentialPlacement,
  evaluateResidentialTownAssignment,
  evaluateTownFoundation,
  getChebyshevFootprintDistance,
  getNextTownId,
  getTownCapacity,
  isWithinTownInfluence,
  removeBuildingFromTowns,
  validateTownName,
} from './town-foundation';

const definitions = createVelutinousManulConstructionDefinitionRegistry();
const CHURCH = 'velutinous-manul-church';
const RESIDENCE = 'velutinous-manul-residential-01';

describe('town foundation domain', () => {
  it('uses an edge-to-edge Chebyshev radius with the boundary included', () => {
    const church = building('church-1', CHURCH, 0, 0);
    const residenceAtBoundary = building('residence-1', RESIDENCE, 14, 3);
    const residenceOutside = building('residence-2', RESIDENCE, 15, 3);

    expect(getChebyshevFootprintDistance(church, residenceAtBoundary, definitions)).toBe(8);
    expect(isWithinTownInfluence(residenceAtBoundary, church, definitions)).toBe(true);
    expect(isWithinTownInfluence(residenceOutside, church, definitions)).toBe(false);
  });

  it('recognizes chained residential influence after a town is founded', () => {
    const church = building('church-1', CHURCH, 0, 0);
    const firstResidence = building('residence-1', RESIDENCE, 14, 3);
    const secondResidence = building('residence-2', RESIDENCE, 31, 3);
    const town = createTownState('town-1', 'Harbor', church.id, [firstResidence.id]);

    expect(evaluateResidentialTownAssignment(
      secondResidence,
      [church, firstResidence, secondResidence],
      [town],
      definitions,
    )).toEqual({ townIds: ['town-1'], unfoundedChurchIds: [] });
  });

  it('requires one church and one unassigned residence to found a town', () => {
    const church = building('church-1', CHURCH, 0, 0);
    const residence = building('residence-1', RESIDENCE, 14, 3);
    const buildings = [church, residence];

    expect(evaluateTownFoundation(church, buildings, [], definitions)).toEqual({
      valid: true,
      churchBuildingId: 'church-1',
      eligibleResidentialBuildingIds: ['residence-1'],
    });
    expect(evaluateTownFoundation(church, [church], [], definitions).failureCode)
      .toBe('missing-residence');
  });

  it('supports multiple towns and rejects ambiguous residence influence', () => {
    const church = building('church-1', CHURCH, 0, 0);
    const secondChurch = building('church-2', CHURCH, 31, 0);
    const middleResidence = building('residence-middle', RESIDENCE, 14, 3);
    const firstTown = createTownState('town-1', 'Harbor', church.id, ['residence-1']);
    const secondTown = createTownState('town-2', 'Hill', secondChurch.id, ['residence-2']);

    expect(evaluateResidentialTownAssignment(
      middleResidence,
      [church, secondChurch, middleResidence],
      [],
      definitions,
    ).unfoundedChurchIds).toEqual(['church-1', 'church-2']);
    expect(evaluateResidentialTownAssignment(
      middleResidence,
      [church, secondChurch, middleResidence, building('residence-1', RESIDENCE, 0, 15), building('residence-2', RESIDENCE, 31, 15)],
      [firstTown, secondTown],
      definitions,
    ).townIds).toEqual(['town-1', 'town-2']);
    expect(evaluateResidentialPlacement(
      middleResidence,
      [church, secondChurch, middleResidence],
      [],
      definitions,
    ).failureCode).toBe('ambiguous-town-influence');
  });

  it('derives capacity, naming, IDs, and demolition behavior deterministically', () => {
    const residenceIds = ['residence-2', 'residence-1'];
    const town = createTownState('town-1', '  Harbor  ', 'church-1', residenceIds);
    const towns: readonly TownState[] = [town];

    expect(town.name).toBe('Harbor');
    expect(getTownCapacity(town)).toEqual({ population: 20, workers: 20 });
    expect(validateTownName(' harbor ', towns)).toBe('A town with that name already exists.');
    expect(validateTownName('   ', towns)).toBe('Enter a town name.');
    expect(validateTownName('New Harbor', towns)).toBeNull();
    expect(getNextTownId([{ ...town, id: 'town-1' }, { ...town, id: 'town-3' }])).toBe('town-2');
    expect(addResidenceToTown(towns, 'town-1', 'residence-3')[0]?.residentialBuildingIds)
      .toEqual(['residence-1', 'residence-2', 'residence-3']);
    expect(removeBuildingFromTowns(towns, 'residence-1')[0]?.residentialBuildingIds)
      .toEqual(['residence-2']);
    expect(removeBuildingFromTowns([{ ...town, residentialBuildingIds: [] }], 'church-1'))
      .toEqual([]);
  });
});

function building(
  id: string,
  definitionId: string,
  x: number,
  y: number,
): PlacedBuildingState {
  return {
    id,
    definitionId,
    origin: { x, y },
    rotationQuarterTurns: 0,
  };
}
