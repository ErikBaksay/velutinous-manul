import {
  createBuildingDefinitionRegistry,
  validateBuildingDefinition,
} from './building-definitions';

describe('building definitions', () => {
  it('validates data-driven placement policies', () => {
    const definition = {
      id: 'ordinary-yard',
      footprint: { width: 2, height: 1 },
      placement: {
        requiresBuildable: true,
        allowWater: false,
        allowImpassable: false,
        maxSlope: 0.2,
      },
    };

    expect(validateBuildingDefinition(definition)).toEqual([]);
    expect(createBuildingDefinitionRegistry([definition]).get('ordinary-yard')).toBe(definition);
  });

  it('rejects duplicate and malformed definitions before they enter a registry', () => {
    const definition = {
      id: 'invalid',
      footprint: { width: 0, height: 1 },
      placement: {
        requiresBuildable: true,
        allowWater: false,
        allowImpassable: false,
        maxSlope: 2,
      },
    };
    expect(validateBuildingDefinition(definition)).toEqual([
      'invalid-footprint',
      'invalid-max-slope',
    ]);
    expect(() => createBuildingDefinitionRegistry([definition])).toThrow(
      'Building definition "invalid" is invalid.',
    );
  });
});
