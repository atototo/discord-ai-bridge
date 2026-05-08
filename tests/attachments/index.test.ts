import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  buildAttachmentPrompt,
  extractDiscordAttachments,
  sanitizeAttachmentName,
} from '../../src/attachments/index.js';
import type { DiscordAttachment } from '../../src/types/index.js';

describe('attachments', () => {
  it('sanitizes attachment names for local storage', () => {
    expect(sanitizeAttachmentName('../../secret.png')).toBe('secret.png');
    expect(sanitizeAttachmentName('my file (1).png')).toBe('my_file__1_.png');
    expect(sanitizeAttachmentName('')).toBe('attachment');
  });

  it('builds a Codex prompt section with downloaded local paths', () => {
    const attachments: DiscordAttachment[] = [
      {
        id: 'att-1',
        name: 'screen.png',
        url: 'https://cdn.example/screen.png',
        contentType: 'image/png',
        size: 123,
        localPath: '/repo/.agent-discord/attachments/msg/screen.png',
      },
    ];

    const prompt = buildAttachmentPrompt(attachments);

    expect(prompt).toContain('첨부 파일');
    expect(prompt).toContain('screen.png');
    expect(prompt).toContain('/repo/.agent-discord/attachments/msg/screen.png');
    expect(prompt).toContain('[[discord-attach:/absolute/path]]');
  });

  it('extracts Discord attachment markers and restricts files to the project path', () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'ai-bridge-attachments-'));
    const resultPath = join(projectDir, 'result.txt');
    writeFileSync(resultPath, 'hello');

    const parsed = extractDiscordAttachments(
      `완료했습니다.\n[[discord-attach:${resultPath}]]\n[[discord-attach:/etc/passwd]]`,
      projectDir
    );

    expect(parsed.content).toBe('완료했습니다.');
    expect(parsed.files).toEqual([resultPath]);
    expect(parsed.rejected).toHaveLength(1);
  });

  it('auto-detects project image paths in assistant text for Discord upload', () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'ai-bridge-attachments-'));
    const resultPath = join(projectDir, 'Resources', 'Assets.xcassets', 'AppIcon.appiconset', 'AppIcon-1024.png');
    mkdirSync(join(projectDir, 'Resources', 'Assets.xcassets', 'AppIcon.appiconset'), { recursive: true });
    writeFileSync(resultPath, 'png');

    const parsed = extractDiscordAttachments(
      `파일 위치:\n\`Resources/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png\`\n\n이 이미지입니다.`,
      projectDir
    );

    expect(parsed.content).toContain('파일 위치');
    expect(parsed.files).toEqual([resultPath]);
    expect(parsed.rejected).toEqual([]);
  });

  it('auto-detects Codex generated image paths outside the project for Discord upload', () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'ai-bridge-attachments-'));
    const generatedRoot = mkdtempSync(join(tmpdir(), 'ai-bridge-generated-images-'));
    const generatedDir = join(generatedRoot, 'test-ai-bridge');
    const resultPath = join(generatedDir, 'preview.png');
    mkdirSync(generatedDir, { recursive: true });
    writeFileSync(resultPath, 'png');

    const previousGeneratedRoot = process.env.CODEX_GENERATED_IMAGES_DIR;
    let parsed: ReturnType<typeof extractDiscordAttachments>;
    try {
      process.env.CODEX_GENERATED_IMAGES_DIR = generatedRoot;
      parsed = extractDiscordAttachments(
        `<image name="디자인 시안">${resultPath}</image>`,
        projectDir
      );
    } finally {
      if (previousGeneratedRoot === undefined) {
        delete process.env.CODEX_GENERATED_IMAGES_DIR;
      } else {
        process.env.CODEX_GENERATED_IMAGES_DIR = previousGeneratedRoot;
      }
    }

    expect(parsed.files).toEqual([resultPath]);
    expect(parsed.rejected).toEqual([]);
  });
});
