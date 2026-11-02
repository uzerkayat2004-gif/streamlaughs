import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
it('ships no downloads API access in the migration or history views and no added permission', () => {
 for(const file of ['src/UpdateView.tsx','src/HistoryTransfer.tsx','src/history-transfer.ts']) expect(readFileSync(file,'utf8')).not.toMatch(/chrome\.downloads/);
 expect(readFileSync('wxt.config.ts','utf8')).not.toContain("'downloads'");
 expect(readFileSync('wxt.config.ts','utf8')).not.toContain("'management'");
});
