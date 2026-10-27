import type { Collection, Space } from '../domain/types';

// Synthetic spaces with their Visual Signature identities (electric blue, violet, emerald, coral). Names follow the D-018 example (Entwicklung, Design, Kunden); "Ideen" is intentionally empty (D-026 state).
export const fixtureSpaces: readonly Space[] = [
  { id: 'sp-dev', name: 'Entwicklung', color: 'sky', icon: 'lucide:code', description: 'Snippets, Prompts und Notizen aus dem laufenden Build.' },
  { id: 'sp-design', name: 'Design', color: 'lavender', icon: 'lucide:palette', description: 'Moodboards, Screens und Entscheidungen zur Oberfläche.' },
  { id: 'sp-clients', name: 'Kunden', color: 'sage', icon: 'lucide:briefcase', description: 'Briefings, Abstimmungen und Unterlagen für Projekte.' },
  { id: 'sp-ideas', name: 'Ideen', color: 'coral', icon: 'lucide:lightbulb', description: 'Ein leerer Space für den ersten Inhalt.' },
];

export const fixtureCollections: readonly Collection[] = [
  { id: 'all', name: 'Alle Inhalte', available: true },
  { id: 'favorites', name: 'Favoriten', available: true },
  { id: 'recent', name: 'Zuletzt', available: true },
  { id: 'sessions', name: 'Sessions', available: false },
];
