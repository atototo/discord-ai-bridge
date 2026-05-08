import { mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { basename, isAbsolute, join, resolve } from 'path';
import type { DiscordAttachment } from '../types/index.js';

const ATTACH_MARKER = /\[\[discord-attach:([^\]]+)\]\]/g;
const IMAGE_PATH_PATTERN = /[`'"]?((?:\/|\.{1,2}\/|[A-Za-z0-9._-]+\/)[^`'"\s<>]*?\.(?:png|jpe?g|gif|webp|bmp|tiff?|heic|avif))[`'"]?/gi;

export function sanitizeAttachmentName(name: string): string {
  const base = basename(name || 'attachment');
  const sanitized = base.replace(/[^A-Za-z0-9._-]/g, '_');
  return sanitized || 'attachment';
}

export async function downloadAttachments(
  projectPath: string,
  messageId: string,
  attachments: DiscordAttachment[]
): Promise<DiscordAttachment[]> {
  if (attachments.length === 0) return [];

  const dir = join(projectPath, '.agent-discord', 'attachments', messageId);
  await mkdir(dir, { recursive: true });

  const downloaded: DiscordAttachment[] = [];
  for (const attachment of attachments) {
    const localPath = join(dir, sanitizeAttachmentName(attachment.name));
    const response = await fetch(attachment.url);
    if (!response.ok) {
      throw new Error(`Failed to download attachment ${attachment.name}: HTTP ${response.status}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    await writeFile(localPath, bytes);
    downloaded.push({ ...attachment, localPath });
  }

  return downloaded;
}

export function buildAttachmentPrompt(attachments: DiscordAttachment[]): string {
  const withPaths = attachments.filter((attachment) => attachment.localPath);
  if (withPaths.length === 0) return '';

  const lines = [
    '',
    '첨부 파일:',
    ...withPaths.map((attachment) => {
      const type = attachment.contentType || 'unknown';
      const size = typeof attachment.size === 'number' ? `${attachment.size} bytes` : 'unknown size';
      return `- ${attachment.name} (${type}, ${size}): ${attachment.localPath}`;
    }),
    '',
    '위 로컬 파일 경로를 열어서 사용자 요청을 처리하세요.',
    '결과 파일을 Discord로 보내야 하면 응답에 [[discord-attach:/absolute/path]] 를 별도 줄로 포함하세요.',
  ];

  return lines.join('\n');
}

export function extractDiscordAttachments(
  content: string,
  projectPath: string
): { content: string; files: string[]; rejected: string[] } {
  const files: string[] = [];
  const seenFiles = new Set<string>();
  const rejected: string[] = [];
  const projectRoot = resolve(projectPath);
  const allowedRoots = [projectRoot, getCodexGeneratedImagesRoot()];

  const cleaned = content.replace(ATTACH_MARKER, (_match, rawPath: string) => {
    const requested = rawPath.trim();
    const resolved = isAbsolute(requested) ? resolve(requested) : resolve(projectRoot, requested);

    if (!isPathInsideAny(resolved, allowedRoots) || !existsSync(resolved)) {
      rejected.push(requested);
      return '';
    }

    addFile(files, seenFiles, resolved);
    return '';
  });

  for (const match of cleaned.matchAll(IMAGE_PATH_PATTERN)) {
    const requested = stripTrailingPunctuation(match[1]);
    const resolved = isAbsolute(requested) ? resolve(requested) : resolve(projectRoot, requested);
    if (isPathInsideAny(resolved, allowedRoots) && existsSync(resolved)) {
      addFile(files, seenFiles, resolved);
    }
  }

  return {
    content: cleaned.replace(/\n{3,}/g, '\n\n').trim(),
    files,
    rejected,
  };
}

function isPathInside(path: string, root: string): boolean {
  return path === root || path.startsWith(root + '/');
}

function isPathInsideAny(path: string, roots: string[]): boolean {
  return roots.some((root) => isPathInside(path, root));
}

function addFile(files: string[], seenFiles: Set<string>, file: string): void {
  if (seenFiles.has(file)) return;
  seenFiles.add(file);
  files.push(file);
}

function stripTrailingPunctuation(path: string): string {
  return path.replace(/[),.;:!?]+$/g, '');
}

function getCodexGeneratedImagesRoot(): string {
  return resolve(process.env.CODEX_GENERATED_IMAGES_DIR || join(homedir(), '.codex', 'generated_images'));
}
