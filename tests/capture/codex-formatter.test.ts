import { formatAgentOutput } from '../../src/capture/formatters/index.js';

describe('Codex output formatter', () => {
  it('keeps only the final assistant answer from a noisy Codex capture delta', () => {
    const delta = `
cd "/Users/winter.e/Documents/ai-bridge" && codex
› cd "/Users/winter.e/Documents/ai-bridge" && codex

╭────────────────────────────────────────────╮
│ >_ OpenAI Codex (v0.128.0)                 │
│                                            │
│ model:     gpt-5.5 medium  /model to change │
│ directory: ~/Documents/ai-bridge           │
╰────────────────────────────────────────────╯

Tip: GPT-5.5 is now available in Codex. It's our strongest agentic coding model yet.

Learn more: https://openai.com/index/introducing-gpt-5-5/

› 안녕?

• Explored
  └ Read SKILL.md (superpowers:using-superpowers skill)

────────────────────────────────────────────────────────────────

• 안녕하세요. 무엇을 도와드릴까요?

────────────────────────────────────────────────────────────────

› Find and fix a bug in @filename

gpt-5.5 medium · ~/Documents/ai-bridge
`;

    expect(formatAgentOutput('codex', delta)).toBe('안녕하세요. 무엇을 도와드릴까요?');
  });

  it('returns empty string when Codex delta only has chrome and prompt text', () => {
    const delta = `
╭────────────────────────────────────────────╮
│ >_ OpenAI Codex (v0.128.0)                 │
╰────────────────────────────────────────────╯

Tip: Update Required - This version will no longer be supported.
› Find and fix a bug in @filename
gpt-5.5 medium · ~/Documents/ai-bridge
`;

    expect(formatAgentOutput('codex', delta)).toBe('');
  });

  it('removes wrapped Codex tip paragraphs and internal skill preamble', () => {
    const delta = `
Tip: GPT-5.5 is now available in Codex. It's our strongest agentic coding
model yet, built to reason through large codebases, check assumptions with
tools, and keep going until the work is done.

superpowers:using-superpowers 스킬 지침을 먼저 확인하고, 이번 요청에는 프로젝트 파일을 건드리지 않는 인사로 응답하겠습니다.

안녕하세요. 무엇을 도와드릴까요?
`;

    expect(formatAgentOutput('codex', delta)).toBe('안녕하세요. 무엇을 도와드릴까요?');
  });

  it('leaves non-Codex output unchanged', () => {
    expect(formatAgentOutput('claude', 'hello\nworld')).toBe('hello\nworld');
  });
});
