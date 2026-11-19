import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import { App } from './ui/App';
import './ui/styles.css';

createRoot(document.getElementById('root')!).render(<App />);
