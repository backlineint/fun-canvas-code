import { createRoot } from 'react-dom/client';
import './index.css';
import Join from './components/Join';

// Dev page. Canvas will mount the component itself; this only supplies sample props.
const app = document.getElementById('app');
if (!app) throw new Error('Missing prototype mount element');
createRoot(app).render(<Join />);
