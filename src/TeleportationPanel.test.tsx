import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TeleportationPanel } from './TeleportationPanel';
import { teleportText } from './quantum/teleportation';

describe('paste diagnostics', () => {
  it('shows the recorded circuit, measurements and corrections in one closed disclosure', () => {
    const { output, ...result } = teleportText('秘密', () => 0.9);
    const html = renderToStaticMarkup(<TeleportationPanel activity={{ status: 'done', source: '本文', result: { ...result, matches: output === '秘密' } }} />);
    expect(html.match(/<details/g)).toHaveLength(1);
    expect(html).not.toMatch(/<details[^>]+open/);
    expect(html).toContain('貼り付けの詳細');
    expect(html).toContain('全ビット一致');
    expect(html).toContain('m0=1、m1=1');
    expect(html).toContain('X → Z');
    expect(html).toContain('全ビットの途中測定');
    expect(html).toContain('表示する転送記録');
    expect(html).toContain('番号を変えても再計算せず');
    expect(html).not.toContain('秘密');
  });
  it('does not claim the paste succeeded when simulation failed', () => {
    const html = renderToStaticMarkup(<TeleportationPanel activity={{ status: 'error', source: '本文' }} />);
    expect(html).toContain('貼り付けを中止しました');
    expect(html).toContain('貼り付け失敗');
    expect(html).not.toContain('貼り付け完了');
  });
  it('shows whole-note duplication results in a single closed disclosure', () => {
    const { output, ...result } = teleportText('["題名","本文"]', () => 0.9);
    const html = renderToStaticMarkup(<TeleportationPanel operation="duplicate" activity={{ status: 'done', source: 'タイトル・本文', result: { ...result, matches: output === '["題名","本文"]' } }} />);
    expect(html).toContain('複製の詳細');
    expect(html).toContain('複製完了');
    expect(html).toContain('新しいメモを追加');
    expect(html.match(/<details/g)).toHaveLength(1);
    expect(html).not.toMatch(/<details[^>]+open/);
  });
  it('can keep the same disclosure open before, during and after duplication with no invented measurements', () => {
    const { output, ...result } = teleportText('["題名","本文"]', () => 0.9);
    const activities = [null, { status: 'running' as const, source: 'タイトル・本文', completed: 0, total: result.bitCount }, { status: 'done' as const, source: 'タイトル・本文', result: { ...result, matches: true } }];
    for (const activity of activities) {
      const html = renderToStaticMarkup(<TeleportationPanel operation="duplicate" activity={activity} open />);
      expect(html).toMatch(/<details[^>]+open=""/);
      expect(html).toContain('量子テレポーテーション回路');
      if (activity?.status !== 'done') {
        expect(html).toContain('測定結果はまだありません');
        expect(html).not.toContain('全ビット一致');
        expect(html).not.toContain('表示する転送記録の番号');
      }
    }
  });
});
