import { createRoot } from 'react-dom/client';
import { Diagnostics } from '../../src/DiagnosticsView';
import '../../src/styles.css';

createRoot(document.getElementById('root')!).render(<Diagnostics />);
