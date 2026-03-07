/**
 * PR comment helper for the API Test Coverage Analyzer action.
 *
 * Detects when the action is running in a pull-request context and either
 * creates or updates a single "coverage report" comment, keeping the PR
 * timeline clean.  The comment is identified by a hidden sentinel marker so
 * subsequent runs update the same comment instead of appending new ones.
 *
 * Public API:
 *   postPrComment(token, body)
 *   isPrContext()
 */

import * as fs from 'fs';
import * as path from 'path';
import * as core from '@actions/core';
import { getOctokit } from '@actions/github';

/** Sentinel appended to every coverage comment so we can find + update it. */
const COMMENT_MARKER = '<!-- api-coverage-analyzer-comment -->';

/**
 * Return true when the current workflow run is triggered by a pull-request
 * event and all required env vars are present.
 */
export function isPrContext(): boolean {
  const event = process.env['GITHUB_EVENT_NAME'] ?? '';
  // pull_request and pull_request_target both carry a PR number
  return (
    (event === 'pull_request' || event === 'pull_request_target') &&
    Boolean(process.env['GITHUB_EVENT_PATH']) &&
    Boolean(process.env['GITHUB_REPOSITORY'])
  );
}

/**
 * Read the PR number from the GitHub event payload JSON file.
 * Returns undefined when the file cannot be read or the number is absent.
 */
export function readPrNumber(): number | undefined {
  const eventPath = process.env['GITHUB_EVENT_PATH'];
  if (!eventPath) return undefined;
  try {
    const raw = fs.readFileSync(eventPath, 'utf-8');
    const payload = JSON.parse(raw) as { pull_request?: { number?: number } };
    return payload.pull_request?.number;
  } catch {
    return undefined;
  }
}

/**
 * Post or update a single PR comment containing `body`.
 *
 * If a previous coverage comment (identified by COMMENT_MARKER) already
 * exists it is updated in place; otherwise a new comment is created.
 * Requires a token with `pull-requests: write` permission.
 *
 * @param token  GitHub token (e.g. `${{ secrets.GITHUB_TOKEN }}`).
 * @param body   Markdown body to post.
 */
export async function postPrComment(token: string, body: string): Promise<void> {
  if (!isPrContext()) {
    core.debug('Not a pull-request event – skipping PR comment.');
    return;
  }

  const prNumber = readPrNumber();
  if (!prNumber) {
    core.warning('Could not determine PR number from event payload – skipping PR comment.');
    return;
  }

  const repo = process.env['GITHUB_REPOSITORY'] ?? '';
  const [owner, repoName] = repo.split('/');
  if (!owner || !repoName) {
    core.warning('GITHUB_REPOSITORY env var is not in "owner/repo" format – skipping PR comment.');
    return;
  }

  const markedBody = `${body}\n\n${COMMENT_MARKER}`;
  const octokit = getOctokit(token);

  try {
    // Search for an existing comment from this action
    const { data: comments } = await octokit.rest.issues.listComments({
      owner,
      repo: repoName,
      issue_number: prNumber,
    });

    const existing = comments.find((c) => c.body?.includes(COMMENT_MARKER));

    if (existing) {
      await octokit.rest.issues.updateComment({
        owner,
        repo: repoName,
        comment_id: existing.id,
        body: markedBody,
      });
      core.info(`Updated PR comment #${existing.id} on PR #${prNumber}`);
    } else {
      const { data: created } = await octokit.rest.issues.createComment({
        owner,
        repo: repoName,
        issue_number: prNumber,
        body: markedBody,
      });
      core.info(`Created PR comment #${created.id} on PR #${prNumber}`);
    }
  } catch (err) {
    // Non-fatal: a missing permission or API error should not fail the build
    core.warning(
      `Failed to post PR comment: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
