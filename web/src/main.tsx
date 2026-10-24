import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './design/app.css';
import { setDb } from './lib/db';
import { createFirebaseDb } from './lib/firebaseDb';
import { captureRef, getSession } from './services/session';

setDb(createFirebaseDb());
captureRef(location.search, !!getSession());

createRoot(document.getElementById('root')!).render(<App />);
