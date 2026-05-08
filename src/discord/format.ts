export function formatDiscordFinalAnswer(content: string): string {
  const trimmed = content.trim();
  return trimmed ? `💬 **완료**\n${trimmed}` : '✅ 완료';
}
