import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TeleportationPanel } from './TeleportationPanel';
import { teleportText } from './quantum/teleportation';

describe('copy diagnostics', () => {
  it('shows the recorded circuit, measurements and corrections in one closed disclosure', () => {
    const { output, ...result } = teleportText('秘密', () => 0.9);
    const html = renderToStaticMarkup(<TeleportationPanel activity={{ status: 'done', source: '本文', result: { ...result, matches: output === '秘密' } }} />);
    expect(html.match(/<details/g)).toHaveLength(1);
    expect(html).not.toMatch(/<details[^>]+open/);
    expect(html).toContain('コピーの詳細');
    expect(html).toContain('全ビット一致');
    expect(html).toContain('m0=1、m1=1');
    expect(html).toContain('X → Z');
    expect(html).toContain('全ビットの途中測定');
    expect(html).not.toContain('秘密');
  });
  it('does not claim the copy succeeded when simulation failed', () => {
    const html = renderToStaticMarkup(<TeleportationPanel activity={{ status: 'error', source: '本文', reason: 'simulation' }} />);
    expect(html).toContain('コピーを中止しました');
    expect(html).toContain('コピー失敗');
    expect(html).not.toContain('コピー完了');
  });
});
