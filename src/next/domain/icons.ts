import type { IconName } from '../components/Icon';
import type { SpaceColor, SpaceIcon } from './types';

// Curated, searchable icon catalogue for spaces and folders: in-house line icons (components/Icon.tsx) plus emojis.
// Keywords are German and English, matched case- and diacritic-insensitively (domain/search.ts normalize).

export interface IconEntry {
  readonly icon: SpaceIcon;
  readonly label: string;
  readonly keywords: readonly string[];
}

const lucide = (name: IconName, label: string, ...keywords: string[]): IconEntry => ({ icon: `lucide:${name}`, label, keywords });
const emoji = (char: string, label: string, ...keywords: string[]): IconEntry => ({ icon: `emoji:${char}`, label, keywords });

export const lucideIcons: readonly IconEntry[] = [
  lucide('folder', 'Ordner', 'folder', 'ablage'),
  lucide('layers', 'Ebenen', 'layers', 'stapel', 'alles'),
  lucide('code', 'Code', 'entwicklung', 'programmieren', 'dev'),
  lucide('terminal', 'Terminal', 'shell', 'konsole', 'cli'),
  lucide('cpu', 'Chip', 'hardware', 'technik', 'prozessor'),
  lucide('database', 'Datenbank', 'daten', 'sql', 'storage'),
  lucide('palette', 'Palette', 'design', 'farbe', 'kunst'),
  lucide('pencilRuler', 'Entwurf', 'design', 'skizze', 'zeichnen', 'layout'),
  lucide('layout', 'Layout', 'ui', 'oberfläche', 'raster'),
  lucide('image', 'Bild', 'foto', 'screenshot', 'galerie'),
  lucide('camera', 'Kamera', 'foto', 'aufnahme'),
  lucide('video', 'Video', 'film', 'clip'),
  lucide('music', 'Musik', 'audio', 'song', 'ton'),
  lucide('mic', 'Mikrofon', 'audio', 'podcast', 'sprache', 'aufnahme'),
  lucide('waveform', 'Wellenform', 'audio', 'session'),
  lucide('briefcase', 'Aktentasche', 'arbeit', 'business', 'kunden', 'job'),
  lucide('users', 'Team', 'personen', 'kunden', 'menschen', 'gruppe'),
  lucide('mail', 'Post', 'mail', 'nachricht', 'brief'),
  lucide('calendar', 'Kalender', 'termin', 'datum', 'planung'),
  lucide('clock', 'Uhr', 'zeit', 'zuletzt', 'verlauf'),
  lucide('target', 'Ziel', 'fokus', 'okr', 'plan'),
  lucide('flag', 'Flagge', 'meilenstein', 'ziel', 'markierung'),
  lucide('trophy', 'Pokal', 'erfolg', 'gewinn', 'award'),
  lucide('rocket', 'Rakete', 'start', 'launch', 'projekt', 'idee'),
  lucide('lightbulb', 'Glühbirne', 'idee', 'inspiration', 'einfall'),
  lucide('sparkles', 'Funkeln', 'magie', 'ki', 'neu', 'highlight'),
  lucide('bolt', 'Blitz', 'schnell', 'energie', 'power'),
  lucide('star', 'Stern', 'favorit', 'wichtig', 'lieblings'),
  lucide('heart', 'Herz', 'liebe', 'lieblings', 'persönlich'),
  lucide('bookmark', 'Lesezeichen', 'merken', 'später', 'lesen'),
  lucide('book', 'Buch', 'lesen', 'notizen', 'wissen', 'lernen'),
  lucide('graduation', 'Abschluss', 'studium', 'lernen', 'uni', 'schule'),
  lucide('flask', 'Kolben', 'labor', 'experiment', 'forschung', 'test'),
  lucide('puzzle', 'Puzzle', 'rätsel', 'spiel', 'teil', 'plugin'),
  lucide('gamepad', 'Controller', 'spiel', 'gaming', 'freizeit'),
  lucide('gift', 'Geschenk', 'feier', 'geburtstag', 'überraschung'),
  lucide('coffee', 'Kaffee', 'pause', 'café', 'morgen'),
  lucide('home', 'Zuhause', 'privat', 'haus', 'familie'),
  lucide('mountain', 'Berg', 'natur', 'wandern', 'outdoor', 'gipfel', 'park'),
  lucide('leaf', 'Blatt', 'natur', 'garten', 'grün', 'nachhaltig'),
  lucide('sunrise', 'Sonnenaufgang', 'morgen', 'tag', 'routine'),
  lucide('globe', 'Globus', 'welt', 'web', 'international', 'reise'),
  lucide('map', 'Karte', 'reise', 'ort', 'navigation'),
  lucide('compass', 'Kompass', 'richtung', 'reise', 'entdecken'),
  lucide('plane', 'Flugzeug', 'reise', 'urlaub', 'flug'),
  lucide('anchor', 'Anker', 'hafen', 'fest', 'basis'),
  lucide('package', 'Paket', 'lieferung', 'release', 'versand'),
  lucide('cart', 'Einkaufswagen', 'einkauf', 'shop', 'bestellung'),
  lucide('wallet', 'Brieftasche', 'finanzen', 'geld', 'budget', 'rechnung'),
  lucide('tag', 'Etikett', 'label', 'kategorie', 'preis'),
  lucide('key', 'Schlüssel', 'zugang', 'passwort', 'sicherheit'),
  lucide('lock', 'Schloss', 'privat', 'sicher', 'geheim'),
  lucide('shield', 'Schild', 'sicherheit', 'schutz', 'datenschutz'),
  lucide('bell', 'Glocke', 'erinnerung', 'benachrichtigung'),
  lucide('pin', 'Pin', 'anheften', 'fixiert', 'wichtig'),
  lucide('megaphone', 'Megafon', 'marketing', 'kampagne', 'ankündigung'),
  lucide('feather', 'Feder', 'schreiben', 'text', 'blog', 'autor'),
  lucide('pen', 'Stift', 'schreiben', 'notiz', 'bearbeiten'),
  lucide('scissors', 'Schere', 'schnipsel', 'ausschnitt', 'zwischenablage'),
  lucide('clipboard', 'Zwischenablage', 'clipboard', 'kopieren', 'einfügen'),
  lucide('link', 'Link', 'url', 'verweis', 'web'),
  lucide('file', 'Datei', 'dokument', 'pdf'),
  lucide('text', 'Text', 'notiz', 'absatz'),
  lucide('hash', 'Raute', 'markdown', 'tag', 'kanal'),
  lucide('inbox', 'Eingang', 'posteingang', 'sammeln', 'neu'),
  lucide('stack', 'Stapel', 'archiv', 'sammlung'),
  lucide('wrench', 'Schraubenschlüssel', 'werkzeug', 'einstellungen', 'reparatur'),
  lucide('cloud', 'Wolke', 'sync', 'himmel', 'online'),
  lucide('smile', 'Lächeln', 'emoji', 'spaß', 'gut'),
];

export const emojiIcons: readonly IconEntry[] = [
  emoji('🚀', 'Rakete', 'start', 'launch', 'projekt'),
  emoji('💡', 'Glühbirne', 'idee', 'inspiration'),
  emoji('✨', 'Funkeln', 'neu', 'magie', 'ki'),
  emoji('🔥', 'Feuer', 'heiß', 'trend', 'dringend'),
  emoji('⭐', 'Stern', 'favorit', 'wichtig'),
  emoji('❤️', 'Herz', 'liebe', 'lieblings'),
  emoji('🎯', 'Ziel', 'fokus', 'okr'),
  emoji('🏆', 'Pokal', 'erfolg', 'gewinn'),
  emoji('🎉', 'Konfetti', 'feier', 'party'),
  emoji('🎁', 'Geschenk', 'geburtstag', 'überraschung'),
  emoji('💼', 'Aktentasche', 'arbeit', 'business', 'kunden'),
  emoji('🧑‍💻', 'Entwicklung', 'code', 'programmieren', 'dev'),
  emoji('💻', 'Laptop', 'computer', 'arbeit', 'tech'),
  emoji('🖥️', 'Monitor', 'desktop', 'screen'),
  emoji('📱', 'Smartphone', 'mobile', 'app', 'handy'),
  emoji('⚙️', 'Zahnrad', 'einstellungen', 'technik', 'konfiguration'),
  emoji('🧰', 'Werkzeugkasten', 'tools', 'werkzeug'),
  emoji('🔧', 'Schraubenschlüssel', 'reparatur', 'werkzeug'),
  emoji('🧪', 'Reagenzglas', 'labor', 'experiment', 'test'),
  emoji('🔬', 'Mikroskop', 'forschung', 'wissenschaft'),
  emoji('🧠', 'Gehirn', 'wissen', 'lernen', 'denken', 'ki'),
  emoji('📚', 'Bücher', 'lesen', 'wissen', 'bibliothek'),
  emoji('📖', 'Buch', 'lesen', 'notizen', 'tagebuch'),
  emoji('📝', 'Notiz', 'schreiben', 'memo', 'text'),
  emoji('✏️', 'Bleistift', 'schreiben', 'skizze'),
  emoji('🎨', 'Palette', 'design', 'kunst', 'farbe'),
  emoji('🖌️', 'Pinsel', 'malen', 'design'),
  emoji('📐', 'Geodreieck', 'design', 'layout', 'geometrie'),
  emoji('📷', 'Kamera', 'foto', 'screenshot'),
  emoji('🖼️', 'Bild', 'galerie', 'kunst', 'foto'),
  emoji('🎬', 'Klappe', 'film', 'video'),
  emoji('🎵', 'Note', 'musik', 'audio', 'song'),
  emoji('🎧', 'Kopfhörer', 'musik', 'podcast', 'audio'),
  emoji('🎙️', 'Mikrofon', 'podcast', 'aufnahme', 'sprache'),
  emoji('🎮', 'Controller', 'spiel', 'gaming'),
  emoji('🧩', 'Puzzle', 'rätsel', 'teil', 'spiel'),
  emoji('📬', 'Briefkasten', 'post', 'mail', 'eingang'),
  emoji('📨', 'Nachricht', 'mail', 'brief'),
  emoji('💬', 'Sprechblase', 'chat', 'nachricht', 'prompt'),
  emoji('🤖', 'Roboter', 'ki', 'bot', 'prompt', 'automatisch'),
  emoji('👥', 'Personen', 'team', 'kunden', 'menschen'),
  emoji('🤝', 'Handschlag', 'partner', 'kunden', 'deal'),
  emoji('🏠', 'Haus', 'zuhause', 'privat', 'familie'),
  emoji('🏢', 'Bürogebäude', 'firma', 'office', 'unternehmen'),
  emoji('🏫', 'Schule', 'uni', 'lernen', 'studium'),
  emoji('🎓', 'Doktorhut', 'abschluss', 'studium', 'lernen'),
  emoji('✈️', 'Flugzeug', 'reise', 'urlaub', 'flug'),
  emoji('🧳', 'Koffer', 'reise', 'urlaub', 'packen'),
  emoji('🗺️', 'Karte', 'reise', 'ort', 'navigation'),
  emoji('🌍', 'Erde', 'welt', 'international', 'web'),
  emoji('🌱', 'Spross', 'natur', 'wachstum', 'garten', 'grün'),
  emoji('🌿', 'Kraut', 'natur', 'pflanze', 'grün'),
  emoji('🌞', 'Sonne', 'morgen', 'sommer', 'hell'),
  emoji('🌙', 'Mond', 'nacht', 'abend', 'ruhe'),
  emoji('☕', 'Kaffee', 'pause', 'café', 'morgen'),
  emoji('🍎', 'Apfel', 'essen', 'gesund', 'rezept'),
  emoji('🍕', 'Pizza', 'essen', 'rezept', 'abend'),
  emoji('🛒', 'Einkaufswagen', 'einkauf', 'shop', 'liste'),
  emoji('💰', 'Geldsack', 'finanzen', 'geld', 'budget'),
  emoji('🧾', 'Quittung', 'rechnung', 'beleg', 'steuer'),
  emoji('📊', 'Diagramm', 'statistik', 'daten', 'analyse', 'report'),
  emoji('📈', 'Wachstum', 'trend', 'umsatz', 'daten'),
  emoji('📅', 'Kalender', 'termin', 'datum', 'planung'),
  emoji('⏰', 'Wecker', 'zeit', 'erinnerung', 'deadline'),
  emoji('📌', 'Pin', 'anheften', 'wichtig', 'merken'),
  emoji('📎', 'Büroklammer', 'anhang', 'datei', 'dokument'),
  emoji('📁', 'Ordner', 'ablage', 'dateien'),
  emoji('🗂️', 'Register', 'archiv', 'ordner', 'organisation'),
  emoji('📦', 'Paket', 'release', 'lieferung', 'versand'),
  emoji('🔑', 'Schlüssel', 'zugang', 'passwort'),
  emoji('🔒', 'Schloss', 'privat', 'sicher', 'geheim'),
  emoji('🛡️', 'Schild', 'sicherheit', 'schutz'),
  emoji('⚡', 'Blitz', 'schnell', 'energie'),
  emoji('🧭', 'Kompass', 'richtung', 'entdecken'),
  emoji('🏃', 'Läufer', 'sport', 'fitness', 'training'),
  emoji('🧘', 'Yoga', 'ruhe', 'achtsamkeit', 'gesundheit'),
  emoji('🏥', 'Krankenhaus', 'gesundheit', 'arzt', 'medizin'),
  emoji('🐾', 'Pfoten', 'haustier', 'hund', 'katze'),
  emoji('🎲', 'Würfel', 'zufall', 'spiel', 'ideen'),
  emoji('🧹', 'Besen', 'aufräumen', 'haushalt', 'putzen'),
  emoji('🗑️', 'Papierkorb', 'löschen', 'alt', 'archiv'),
];

export const iconCatalog: readonly IconEntry[] = [...lucideIcons, ...emojiIcons];

const fold = (value: string): string => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Icons whose label or keywords contain every query token. An empty query returns the whole catalogue. */
export function searchIcons(query: string, entries: readonly IconEntry[] = iconCatalog): IconEntry[] {
  const tokens = fold(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return [...entries];
  return entries.filter((entry) => {
    const haystack = [entry.label, ...entry.keywords].map(fold);
    return tokens.every((t) => haystack.some((h) => h.includes(t)));
  });
}

export const parseIcon = (icon: SpaceIcon | undefined): { kind: 'lucide'; name: IconName } | { kind: 'emoji'; char: string } | null => {
  if (!icon) return null;
  if (icon.startsWith('lucide:')) return { kind: 'lucide', name: icon.slice(7) as IconName };
  if (icon.startsWith('emoji:')) return { kind: 'emoji', char: icon.slice(6) };
  return null;
};

export const isKnownLucide = (name: string, known: readonly string[]): boolean => known.includes(name);

/** Default icon suggestion for a new folder, picked from its name: whole name first, then single words and their stems. */
export function suggestIcon(name: string): SpaceIcon | undefined {
  const words = fold(name).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3);
  const candidates = [fold(name).trim(), ...words, ...words.map((w) => w.replace(/(en|er|es|s|e|n)$/u, '')).filter((w) => w.length >= 3)];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const hit = lucideIcons.find((entry) => [entry.label, ...entry.keywords].map(fold).some((h) => h === candidate || (candidate.length >= 4 && (h.startsWith(candidate) || candidate.startsWith(h)) && h.length >= 4)));
    if (hit) return hit.icon;
  }
  return undefined;
}

export const spaceColorLabel: Record<SpaceColor, string> = {
  sky: 'Elektrisch Blau',
  lavender: 'Violett',
  sage: 'Smaragd',
  coral: 'Koralle',
  peach: 'Mandarine',
  rose: 'Rosé',
  amber: 'Gold',
  mint: 'Türkis',
  slate: 'Graphit',
  plum: 'Magenta',
};
