import { createRoot } from 'react-dom/client';
import './index.css';
import Join from './components/Join.jsx';

// Dev page. Canvas will mount the component itself; this only supplies sample props.
createRoot(document.getElementById('app')).render(<Join />);
