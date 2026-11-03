import { createRoot } from 'react-dom/client';
import { Mark } from '../../src/components';
import { MicTest } from '../../src/MicTest';
import '../../src/styles.css';

createRoot(document.getElementById('root')!).render(
  <main className="mic-test-page">
    <Mark />
    <MicTest />
  </main>,
);
