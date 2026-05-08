/**
 * Agent-specific output formatters.
 */

export function formatAgentOutput(agentType: string, text: string): string {
  if (agentType === 'codex') {
    return formatCodexOutput(text);
  }
  return text.trim();
}

function formatCodexOutput(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const kept: string[] = [];
  let skippingBox = false;
  let skippingExplored = false;
  let skippingChromeParagraph = false;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      skippingChromeParagraph = false;
      if (kept.length > 0 && kept[kept.length - 1] !== '') kept.push('');
      continue;
    }

    if (skippingChromeParagraph) continue;

    if (isBoxBoundary(trimmed)) {
      skippingBox = !skippingBox;
      continue;
    }
    if (skippingBox || trimmed.startsWith('│')) continue;

    if (trimmed.startsWith('• Explored')) {
      skippingExplored = true;
      continue;
    }
    if (skippingExplored) {
      if (trimmed.startsWith('└') || trimmed.startsWith('├') || trimmed.startsWith('Read ') || trimmed.startsWith('┌')) {
        continue;
      }
      skippingExplored = false;
    }

    if (startsCodexChromeParagraph(trimmed)) {
      skippingChromeParagraph = true;
      continue;
    }

    if (isCodexChrome(trimmed)) continue;

    kept.push(stripCodexBullet(trimmed));
  }

  return kept
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isBoxBoundary(line: string): boolean {
  return /^[╭╰┌└].*[╮╯┐┘]$/.test(line);
}

function startsCodexChromeParagraph(line: string): boolean {
  if (line.startsWith('Tip:')) return true;
  if (line.startsWith('Learn more:')) return true;
  if (/^superpowers:[\w:-]+ .*스킬 지침/.test(line)) return true;
  return false;
}

function isCodexChrome(line: string): boolean {
  if (/^[─━_\-=]{8,}$/.test(line)) return true;
  if (line.startsWith('cd ')) return true;
  if (line.startsWith('›')) return true;
  if (line.startsWith('Run npm install')) return true;
  if (line.startsWith('See full release notes:')) return true;
  if (line.startsWith('changed ') && line.includes(' package')) return true;
  if (/^https?:\/\/\S+$/.test(line)) return true;
  if (/^gpt-[\w.-]+ .*· .+/.test(line)) return true;
  if (/^model:\s+/.test(line)) return true;
  if (/^directory:\s+/.test(line)) return true;
  if (/OpenAI Codex/.test(line)) return true;
  if (/Update available/.test(line)) return true;
  return false;
}

function stripCodexBullet(line: string): string {
  return line.replace(/^•\s*/, '');
}
