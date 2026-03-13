import { classifyFlaskSecurity } from '../../../src/languages/python/index';
import type { DecoratorInfo } from '../../../src/ast/astTypes';

describe('classifyFlaskSecurity', () => {
  it('classifies @jwt_required as required auth', () => {
    const decorators: DecoratorInfo[] = [
      { name: 'jwt_required', fullText: '@jwt_required', args: { optional: 'false' } },
    ];
    const security = classifyFlaskSecurity(decorators);
    expect(security).toEqual({
      type: 'jwt',
      required: true,
      optional: false,
      sourcePattern: '@jwt_required',
    });
  });

  it('classifies @jwt_optional as optional auth', () => {
    const decorators: DecoratorInfo[] = [
      { name: 'jwt_optional', fullText: '@jwt_optional', args: { optional: 'true' } },
    ];
    const security = classifyFlaskSecurity(decorators);
    expect(security).toEqual({
      type: 'jwt',
      required: false,
      optional: true,
      sourcePattern: '@jwt_optional',
    });
  });

  it('classifies @login_required as session auth', () => {
    const decorators: DecoratorInfo[] = [
      { name: 'login_required', fullText: '@login_required', args: {} },
    ];
    const security = classifyFlaskSecurity(decorators);
    expect(security).toEqual({
      type: 'session',
      required: true,
      optional: false,
      sourcePattern: '@login_required',
    });
  });

  it('returns undefined when no auth decorator present', () => {
    const decorators: DecoratorInfo[] = [
      { name: 'route', fullText: "@bp.route('/articles')" },
      { name: 'use_kwargs', fullText: '@use_kwargs({...})' },
    ];
    expect(classifyFlaskSecurity(decorators)).toBeUndefined();
  });

  it('returns undefined for empty decorator list', () => {
    expect(classifyFlaskSecurity([])).toBeUndefined();
  });

  it('prioritizes first auth decorator found', () => {
    const decorators: DecoratorInfo[] = [
      { name: 'jwt_required', fullText: '@jwt_required', args: { optional: 'false' } },
      { name: 'jwt_optional', fullText: '@jwt_optional', args: { optional: 'true' } },
    ];
    const security = classifyFlaskSecurity(decorators);
    expect(security?.required).toBe(true);
    expect(security?.optional).toBe(false);
  });
});
