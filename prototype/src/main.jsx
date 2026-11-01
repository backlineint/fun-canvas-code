import { render } from 'preact';
import './index.css';
import Join from './components/Join.jsx';

// Dev page. Canvas will mount the component itself; this only supplies sample props.
render(<Join />, document.getElementById('app'));
