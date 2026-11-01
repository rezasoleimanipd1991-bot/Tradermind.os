import { createRoot } from 'react-dom/client';

import App from './App';

import './index.css';

import { db as debugDb } from './db/database';

createRoot(document.getElementById('root')!).render(<App />);

if (import.meta.env.DEV) {
  (window as Window & { db?: typeof debugDb }).db = debugDb;
}
