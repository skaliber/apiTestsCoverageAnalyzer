/**
 * Unit tests for action/src/prComment.ts
 *
 * We mock @actions/github and @actions/core to avoid real HTTP calls and
 * ensure the PR comment logic is correct under various environment conditions.
 */

// ─── Mock @actions/core ───────────────────────────────────────────────────────

jest.mock('@actions/core', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warning: jest.fn(),
  setFailed: jest.fn(),
}));

// ─── Mock @actions/github ─────────────────────────────────────────────────────

const mockListComments = jest.fn();
const mockUpdateComment = jest.fn();
const mockCreateComment = jest.fn();

jest.mock('@actions/github', () => ({
  getOctokit: jest.fn(() => ({
    rest: {
      issues: {
        listComments: mockListComments,
        updateComment: mockUpdateComment,
        createComment: mockCreateComment,
      },
    },
  })),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { isPrContext, readPrNumber, postPrComment } from '../action/src/prComment';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const COMMENT_MARKER = '<!-- api-coverage-analyzer-comment -->';

function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
}

function clearPrEnv() {
  setEnv({
    GITHUB_EVENT_NAME: undefined,
    GITHUB_EVENT_PATH: undefined,
    GITHUB_REPOSITORY: undefined,
  });
}

/** Writes payload to a temp file and returns the path. */
function writeTempEvent(payload: unknown): string {
  const tmpFile = path.join(os.tmpdir(), `gh-event-${Date.now()}.json`);
  fs.writeFileSync(tmpFile, JSON.stringify(payload), 'utf-8');
  return tmpFile;
}

// ─── isPrContext ──────────────────────────────────────────────────────────────

describe('isPrContext', () => {
  beforeEach(clearPrEnv);

  it('returns true for pull_request event with all required vars', () => {
    setEnv({
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_EVENT_PATH: '/tmp/event.json',
      GITHUB_REPOSITORY: 'owner/repo',
    });
    expect(isPrContext()).toBe(true);
  });

  it('returns true for pull_request_target event', () => {
    setEnv({
      GITHUB_EVENT_NAME: 'pull_request_target',
      GITHUB_EVENT_PATH: '/tmp/event.json',
      GITHUB_REPOSITORY: 'owner/repo',
    });
    expect(isPrContext()).toBe(true);
  });

  it('returns false for push event', () => {
    setEnv({
      GITHUB_EVENT_NAME: 'push',
      GITHUB_EVENT_PATH: '/tmp/event.json',
      GITHUB_REPOSITORY: 'owner/repo',
    });
    expect(isPrContext()).toBe(false);
  });

  it('returns false when GITHUB_EVENT_PATH is missing', () => {
    setEnv({
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_EVENT_PATH: undefined,
      GITHUB_REPOSITORY: 'owner/repo',
    });
    expect(isPrContext()).toBe(false);
  });

  it('returns false when GITHUB_REPOSITORY is missing', () => {
    setEnv({
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_EVENT_PATH: '/tmp/event.json',
      GITHUB_REPOSITORY: undefined,
    });
    expect(isPrContext()).toBe(false);
  });

  it('returns false when no env vars are set', () => {
    expect(isPrContext()).toBe(false);
  });
});

// ─── readPrNumber ─────────────────────────────────────────────────────────────

describe('readPrNumber', () => {
  beforeEach(clearPrEnv);

  it('returns the PR number from the event payload', () => {
    const tmpFile = writeTempEvent({ pull_request: { number: 42 } });
    setEnv({ GITHUB_EVENT_PATH: tmpFile });
    expect(readPrNumber()).toBe(42);
    fs.unlinkSync(tmpFile);
  });

  it('returns undefined when GITHUB_EVENT_PATH is not set', () => {
    expect(readPrNumber()).toBeUndefined();
  });

  it('returns undefined when pull_request is absent from payload', () => {
    const tmpFile = writeTempEvent({ action: 'opened' });
    setEnv({ GITHUB_EVENT_PATH: tmpFile });
    expect(readPrNumber()).toBeUndefined();
    fs.unlinkSync(tmpFile);
  });

  it('returns undefined when the file does not exist', () => {
    setEnv({ GITHUB_EVENT_PATH: '/nonexistent/path/event.json' });
    expect(readPrNumber()).toBeUndefined();
  });

  it('returns undefined when the file contains invalid JSON', () => {
    const tmpFile = path.join(os.tmpdir(), `gh-bad-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, 'not-json', 'utf-8');
    setEnv({ GITHUB_EVENT_PATH: tmpFile });
    expect(readPrNumber()).toBeUndefined();
    fs.unlinkSync(tmpFile);
  });
});

// ─── postPrComment ────────────────────────────────────────────────────────────

describe('postPrComment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearPrEnv();
  });

  it('does nothing when not in a PR context', async () => {
    setEnv({ GITHUB_EVENT_NAME: 'push' });
    await postPrComment('token', 'body');
    expect(mockListComments).not.toHaveBeenCalled();
    expect(mockCreateComment).not.toHaveBeenCalled();
  });

  it('warns and skips when PR number cannot be determined', async () => {
    const tmpFile = writeTempEvent({ action: 'opened' });
    setEnv({
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_EVENT_PATH: tmpFile,
      GITHUB_REPOSITORY: 'owner/repo',
    });

    const core = jest.requireMock('@actions/core') as { warning: jest.Mock };
    await postPrComment('token', 'body');
    fs.unlinkSync(tmpFile);
    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('PR number'));
    expect(mockCreateComment).not.toHaveBeenCalled();
  });

  it('warns when GITHUB_REPOSITORY is malformed', async () => {
    const tmpFile = writeTempEvent({ pull_request: { number: 1 } });
    setEnv({
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_EVENT_PATH: tmpFile,
      GITHUB_REPOSITORY: 'malformed',  // no slash → owner will be empty
    });

    const core = jest.requireMock('@actions/core') as { warning: jest.Mock };
    await postPrComment('token', 'body');
    fs.unlinkSync(tmpFile);
    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('GITHUB_REPOSITORY'));
    expect(mockCreateComment).not.toHaveBeenCalled();
  });

  it('creates a new comment when none with the marker exists', async () => {
    const tmpFile = writeTempEvent({ pull_request: { number: 7 } });
    setEnv({
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_EVENT_PATH: tmpFile,
      GITHUB_REPOSITORY: 'owner/repo',
    });
    mockListComments.mockResolvedValue({ data: [] });
    mockCreateComment.mockResolvedValue({ data: { id: 999 } });

    await postPrComment('token', 'my-body');
    fs.unlinkSync(tmpFile);

    expect(mockListComments).toHaveBeenCalledWith(expect.objectContaining({ issue_number: 7 }));
    expect(mockCreateComment).toHaveBeenCalledWith(
      expect.objectContaining({
        issue_number: 7,
        body: expect.stringContaining('my-body'),
      }),
    );
    expect(mockUpdateComment).not.toHaveBeenCalled();
  });

  it('appends the sentinel marker to the posted comment body', async () => {
    const tmpFile = writeTempEvent({ pull_request: { number: 3 } });
    setEnv({
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_EVENT_PATH: tmpFile,
      GITHUB_REPOSITORY: 'owner/repo',
    });
    mockListComments.mockResolvedValue({ data: [] });
    mockCreateComment.mockResolvedValue({ data: { id: 1 } });

    await postPrComment('token', 'summary text');
    fs.unlinkSync(tmpFile);

    const call = mockCreateComment.mock.calls[0][0] as { body: string };
    expect(call.body).toContain(COMMENT_MARKER);
  });

  it('updates an existing comment when one with the marker already exists', async () => {
    const tmpFile = writeTempEvent({ pull_request: { number: 5 } });
    setEnv({
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_EVENT_PATH: tmpFile,
      GITHUB_REPOSITORY: 'owner/repo',
    });
    const existingComment = { id: 123, body: `old body\n\n${COMMENT_MARKER}` };
    mockListComments.mockResolvedValue({ data: [existingComment] });
    mockUpdateComment.mockResolvedValue({ data: { id: 123 } });

    await postPrComment('token', 'new summary');
    fs.unlinkSync(tmpFile);

    expect(mockUpdateComment).toHaveBeenCalledWith(
      expect.objectContaining({
        comment_id: 123,
        body: expect.stringContaining('new summary'),
      }),
    );
    expect(mockCreateComment).not.toHaveBeenCalled();
  });

  it('warns (does not throw) when the GitHub API call fails', async () => {
    const tmpFile = writeTempEvent({ pull_request: { number: 9 } });
    setEnv({
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_EVENT_PATH: tmpFile,
      GITHUB_REPOSITORY: 'owner/repo',
    });
    mockListComments.mockRejectedValue(new Error('API rate limit'));

    const core = jest.requireMock('@actions/core') as { warning: jest.Mock };
    await expect(postPrComment('token', 'body')).resolves.not.toThrow();
    fs.unlinkSync(tmpFile);
    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('API rate limit'));
  });
});
