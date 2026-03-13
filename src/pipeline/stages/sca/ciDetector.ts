/**
 * CI platform detection.
 *
 * Detects the CI platform from project structure by checking
 * for well-known CI configuration files.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { CiPlatform } from './types';

interface CiDetectionRule {
  platform: CiPlatform;
  /** Paths relative to project root to check for existence. */
  paths: string[];
}

const CI_DETECTION_RULES: CiDetectionRule[] = [
  {
    platform: 'github-actions',
    paths: ['.github/workflows'],
  },
  {
    platform: 'gitlab-ci',
    paths: ['.gitlab-ci.yml', '.gitlab-ci.yaml'],
  },
  {
    platform: 'jenkins',
    paths: ['Jenkinsfile', 'jenkins/Jenkinsfile'],
  },
  {
    platform: 'azure-devops',
    paths: ['azure-pipelines.yml', 'azure-pipelines.yaml', '.azure-pipelines'],
  },
  {
    platform: 'circleci',
    paths: ['.circleci/config.yml', '.circleci/config.yaml'],
  },
  {
    platform: 'travis-ci',
    paths: ['.travis.yml', '.travis.yaml'],
  },
];

/**
 * Detect the CI platform from project structure.
 *
 * Returns the first matching platform, or 'none' if no CI configuration is found.
 * Checks directories with `fs.existsSync` which handles both files and directories.
 */
export function detectCiPlatform(projectRoot: string): CiPlatform {
  for (const rule of CI_DETECTION_RULES) {
    for (const relPath of rule.paths) {
      const fullPath = path.join(projectRoot, relPath);
      if (fs.existsSync(fullPath)) {
        return rule.platform;
      }
    }
  }
  return 'none';
}
