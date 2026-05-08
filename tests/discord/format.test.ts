import { formatDiscordFinalAnswer } from '../../src/discord/format.js';

describe('Discord formatting', () => {
  it('does not wrap assistant answers in code blocks so Discord markdown renders', () => {
    const answer = [
      '한국 극장 기준 인기 외국영화입니다.',
      '',
      '- **악마는 프라다를 입는다 2**: 전체 1위',
      '- **슈퍼 마리오 갤럭시**: 가족 관객 쪽에서 강세',
      '',
      '출처: [KOBIZ](https://www.kobiz.or.kr/)',
    ].join('\n');

    const message = formatDiscordFinalAnswer(answer);

    expect(message).toContain('💬 **완료**');
    expect(message).toContain('- **악마는 프라다를 입는다 2**');
    expect(message).toContain('[KOBIZ](https://www.kobiz.or.kr/)');
    expect(message).not.toContain('```');
  });

  it('keeps code fences when the assistant intentionally includes code', () => {
    const message = formatDiscordFinalAnswer('```ts\nconst ok = true;\n```');

    expect(message).toContain('```ts');
    expect(message).toContain('const ok = true;');
  });
});
