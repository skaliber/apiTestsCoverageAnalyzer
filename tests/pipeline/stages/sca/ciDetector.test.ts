jest.mock('fs');

import * as fs from 'fs';
import * as path from 'path';
import { detectCiPlatform } from '../../../../src/pipeline/stages/sca/ciDetector';

const mockExistsSync = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;

describe('detectCiPlatform', () => {
  const root = '/fake/project';

  beforeEach(() => {
    mockExistsSync.mockReset();
    mockExistsSync.mockReturnValue(false);
  });

  it('should detect github-actions when .github/workflows exists', () => {
    mockExistsSync.mockImplementation((p: fs.PathLike) => {
      return p === path.join(root, '.github/workflows');
    });

    expect(detectCiPlatform(root)).toBe('github-actions');
  });

  it('should detect gitlab-ci when .gitlab-ci.yml exists', () => {
    mockExistsSync.mockImplementation((p: fs.PathLike) => {
      return p === path.join(root, '.gitlab-ci.yml');
    });

    expect(detectCiPlatform(root)).toBe('gitlab-ci');
  });

  it('should detect jenkins when Jenkinsfile exists', () => {
    mockExistsSync.mockImplementation((p: fs.PathLike) => {
      return p === path.join(root, 'Jenkinsfile');
    });

    expect(detectCiPlatform(root)).toBe('jenkins');
  });

  it('should detect azure-devops when azure-pipelines.yml exists', () => {
    mockExistsSync.mockImplementation((p: fs.PathLike) => {
      return p === path.join(root, 'azure-pipelines.yml');
    });

    expect(detectCiPlatform(root)).toBe('azure-devops');
  });

  it('should detect circleci when .circleci/config.yml exists', () => {
    mockExistsSync.mockImplementation((p: fs.PathLike) => {
      return p === path.join(root, '.circleci/config.yml');
    });

    expect(detectCiPlatform(root)).toBe('circleci');
  });

  it('should detect travis-ci when .travis.yml exists', () => {
    mockExistsSync.mockImplementation((p: fs.PathLike) => {
      return p === path.join(root, '.travis.yml');
    });

    expect(detectCiPlatform(root)).toBe('travis-ci');
  });

  it('should return "none" when no CI config files are found', () => {
    mockExistsSync.mockReturnValue(false);

    expect(detectCiPlatform(root)).toBe('none');
  });

  it('should return first matching platform when multiple CI configs exist', () => {
    // github-actions comes first in the detection rules
    mockExistsSync.mockImplementation((p: fs.PathLike) => {
      const pStr = String(p);
      return (
        pStr === path.join(root, '.github/workflows') ||
        pStr === path.join(root, '.travis.yml')
      );
    });

    expect(detectCiPlatform(root)).toBe('github-actions');
  });
});
