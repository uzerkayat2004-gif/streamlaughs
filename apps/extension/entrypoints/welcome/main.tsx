import { createRoot } from 'react-dom/client';
import { Welcome } from '../../src/Welcome';
import '../../src/styles.css';

createRoot(document.getElementById('root')!).render(<Welcome />);
