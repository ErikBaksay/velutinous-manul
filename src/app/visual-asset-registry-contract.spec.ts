import { getRegisteredVisualAssetFamily } from './visual-asset-registry';

describe('visual asset registry contract', () => {
  it('registers the authored mine as a building asset family', () => {
    expect(getRegisteredVisualAssetFamily('mine_shaft_house')).toBe('building');
  });
});
