-- =====================================================================
-- Migration 009 — replace the placeholder fixture with the REAL 2026
-- World Cup schedule from the official draw (December 5, 2025).
--
-- /!\ WARNING: this DELETES every row in matches, which cascades to
--     predictions. Run it BEFORE your friends start placing pronostics.
--
-- Groups (12 × 4 = 48 teams):
--   A: Mexico, South Africa, Korea Republic, Czechia
--   B: Canada, Bosnia-Herzegovina, Qatar, Switzerland
--   C: Brazil, Morocco, Haiti, Scotland
--   D: USA, Paraguay, Australia, Türkiye
--   E: Germany, Curaçao, Ivory Coast, Ecuador
--   F: Netherlands, Japan, Sweden, Tunisia
--   G: Belgium, Egypt, Iran, New Zealand
--   H: Spain, Cape Verde, Saudi Arabia, Uruguay
--   I: France, Senegal, Iraq, Norway
--   J: Argentina, Algeria, Austria, Jordan
--   K: Portugal, DR Congo, Uzbekistan, Colombia
--   L: England, Croatia, Ghana, Panama
--
-- Group-stage pairing pattern (each group plays a 4-team round-robin):
--   MD1 → 1v2, 3v4
--   MD2 → 4v2, 1v3
--   MD3 → 4v1, 2v3   (the two MD3 matches in a group kick off together
--                     for fairness — FIFA rule)
--
-- Times are local kickoff converted to UTC. Match dates verified from
-- multiple sources; some MD2/MD3 slots are best estimates because the
-- detailed schedule wasn't fully publishable yet.
-- =====================================================================

delete from public.predictions;
delete from public.matches;
alter sequence matches_id_seq restart with 1;

insert into public.matches (stage, group_name, team_home, team_away, match_date) values
-- ───────── Group stage, matchday 1 (June 11–17) ─────────
('Group Stage', 'A', 'Mexico',          'South Africa',      '2026-06-11 19:00:00+00'),
('Group Stage', 'A', 'Korea Republic',  'Czechia',           '2026-06-12 02:00:00+00'),

('Group Stage', 'B', 'Canada',          'Bosnia-Herzegovina','2026-06-12 19:00:00+00'),
('Group Stage', 'D', 'USA',             'Paraguay',          '2026-06-13 01:00:00+00'),

('Group Stage', 'B', 'Qatar',           'Switzerland',       '2026-06-13 19:00:00+00'),
('Group Stage', 'C', 'Brazil',          'Morocco',           '2026-06-13 22:00:00+00'),
('Group Stage', 'C', 'Haiti',           'Scotland',          '2026-06-14 01:00:00+00'),
('Group Stage', 'D', 'Australia',       'Türkiye',           '2026-06-14 04:00:00+00'),

('Group Stage', 'E', 'Germany',         'Curaçao',           '2026-06-14 17:00:00+00'),
('Group Stage', 'F', 'Netherlands',     'Japan',             '2026-06-14 20:00:00+00'),
('Group Stage', 'E', 'Ivory Coast',     'Ecuador',           '2026-06-14 23:00:00+00'),
('Group Stage', 'F', 'Sweden',          'Tunisia',           '2026-06-15 02:00:00+00'),

('Group Stage', 'H', 'Spain',           'Cape Verde',        '2026-06-15 17:00:00+00'),
('Group Stage', 'G', 'Belgium',         'Egypt',             '2026-06-15 22:00:00+00'),
('Group Stage', 'H', 'Saudi Arabia',    'Uruguay',           '2026-06-15 22:00:00+00'),
('Group Stage', 'G', 'Iran',            'New Zealand',       '2026-06-16 04:00:00+00'),

('Group Stage', 'I', 'France',          'Senegal',           '2026-06-16 19:00:00+00'),
('Group Stage', 'I', 'Iraq',            'Norway',            '2026-06-16 22:00:00+00'),
('Group Stage', 'J', 'Argentina',       'Algeria',           '2026-06-17 01:00:00+00'),
('Group Stage', 'J', 'Austria',         'Jordan',            '2026-06-17 04:00:00+00'),

('Group Stage', 'K', 'Portugal',        'DR Congo',          '2026-06-17 17:00:00+00'),
('Group Stage', 'L', 'England',         'Croatia',           '2026-06-17 20:00:00+00'),
('Group Stage', 'L', 'Ghana',           'Panama',            '2026-06-17 23:00:00+00'),
('Group Stage', 'K', 'Uzbekistan',      'Colombia',          '2026-06-18 02:00:00+00'),

-- ───────── Group stage, matchday 2 (June 18–23) ─────────
('Group Stage', 'A', 'Czechia',         'South Africa',      '2026-06-18 17:00:00+00'),
('Group Stage', 'B', 'Switzerland',     'Bosnia-Herzegovina','2026-06-18 19:00:00+00'),
('Group Stage', 'B', 'Canada',          'Qatar',             '2026-06-18 22:00:00+00'),
('Group Stage', 'A', 'Mexico',          'Korea Republic',    '2026-06-19 02:00:00+00'),

('Group Stage', 'C', 'Scotland',        'Morocco',           '2026-06-19 22:00:00+00'),
('Group Stage', 'D', 'USA',             'Australia',         '2026-06-19 22:00:00+00'),
('Group Stage', 'C', 'Brazil',          'Haiti',             '2026-06-20 01:00:00+00'),
('Group Stage', 'D', 'Türkiye',         'Paraguay',          '2026-06-20 04:00:00+00'),

('Group Stage', 'E', 'Germany',         'Ivory Coast',       '2026-06-20 20:00:00+00'),
('Group Stage', 'F', 'Netherlands',     'Sweden',            '2026-06-20 17:00:00+00'),
('Group Stage', 'E', 'Ecuador',         'Curaçao',           '2026-06-21 00:00:00+00'),
('Group Stage', 'F', 'Tunisia',         'Japan',             '2026-06-21 03:00:00+00'),

('Group Stage', 'G', 'Belgium',         'New Zealand',       '2026-06-21 19:00:00+00'),
('Group Stage', 'H', 'Spain',           'Saudi Arabia',      '2026-06-21 22:00:00+00'),
('Group Stage', 'G', 'Iran',            'Egypt',             '2026-06-22 01:00:00+00'),
('Group Stage', 'H', 'Uruguay',         'Cape Verde',        '2026-06-22 04:00:00+00'),

('Group Stage', 'I', 'France',          'Iraq',              '2026-06-22 19:00:00+00'),
('Group Stage', 'I', 'Norway',          'Senegal',           '2026-06-22 22:00:00+00'),
('Group Stage', 'J', 'Argentina',       'Austria',           '2026-06-23 01:00:00+00'),
('Group Stage', 'J', 'Jordan',          'Algeria',           '2026-06-23 04:00:00+00'),

('Group Stage', 'K', 'Portugal',        'Uzbekistan',        '2026-06-23 17:00:00+00'),
('Group Stage', 'L', 'England',         'Ghana',             '2026-06-23 20:00:00+00'),
('Group Stage', 'L', 'Panama',          'Croatia',           '2026-06-23 23:00:00+00'),
('Group Stage', 'K', 'Colombia',        'DR Congo',          '2026-06-24 02:00:00+00'),

-- ───────── Group stage, matchday 3 (June 24–27, same-day per group) ─────────
('Group Stage', 'B', 'Switzerland',     'Canada',            '2026-06-24 19:00:00+00'),
('Group Stage', 'B', 'Bosnia-Herzegovina','Qatar',           '2026-06-24 19:00:00+00'),
('Group Stage', 'C', 'Scotland',        'Brazil',            '2026-06-24 22:00:00+00'),
('Group Stage', 'C', 'Morocco',         'Haiti',             '2026-06-24 22:00:00+00'),
('Group Stage', 'A', 'Czechia',         'Mexico',            '2026-06-25 01:00:00+00'),
('Group Stage', 'A', 'South Africa',    'Korea Republic',    '2026-06-25 01:00:00+00'),

('Group Stage', 'D', 'Türkiye',         'USA',               '2026-06-25 19:00:00+00'),
('Group Stage', 'D', 'Australia',       'Paraguay',          '2026-06-25 19:00:00+00'),
('Group Stage', 'E', 'Ecuador',         'Germany',           '2026-06-25 20:00:00+00'),
('Group Stage', 'E', 'Curaçao',         'Ivory Coast',       '2026-06-25 20:00:00+00'),
('Group Stage', 'F', 'Tunisia',         'Netherlands',       '2026-06-26 00:00:00+00'),
('Group Stage', 'F', 'Japan',           'Sweden',            '2026-06-26 00:00:00+00'),

('Group Stage', 'G', 'New Zealand',     'Belgium',           '2026-06-26 19:00:00+00'),
('Group Stage', 'G', 'Egypt',           'Iran',              '2026-06-26 19:00:00+00'),
('Group Stage', 'H', 'Uruguay',         'Spain',             '2026-06-26 22:00:00+00'),
('Group Stage', 'H', 'Cape Verde',      'Saudi Arabia',      '2026-06-26 22:00:00+00'),
('Group Stage', 'I', 'Norway',          'France',            '2026-06-27 01:00:00+00'),
('Group Stage', 'I', 'Senegal',         'Iraq',              '2026-06-27 01:00:00+00'),

('Group Stage', 'L', 'Panama',          'England',           '2026-06-27 21:00:00+00'),
('Group Stage', 'L', 'Croatia',         'Ghana',             '2026-06-27 21:00:00+00'),
('Group Stage', 'K', 'Colombia',        'Portugal',          '2026-06-27 23:30:00+00'),
('Group Stage', 'K', 'DR Congo',        'Uzbekistan',        '2026-06-27 23:30:00+00'),
('Group Stage', 'J', 'Algeria',         'Austria',           '2026-06-28 01:00:00+00'),
('Group Stage', 'J', 'Jordan',          'Argentina',         '2026-06-28 01:00:00+00'),

-- ───────── Round of 32 (June 28 – July 3) ─────────
-- 1A, 2B, 3rd-place teams etc — bracket slots until the draw resolves.
('Round of 32', null, '1A',             '3C/E/F/H',          '2026-06-28 19:00:00+00'),
('Round of 32', null, '1C',             '3A/B/D/E',          '2026-06-28 22:00:00+00'),
('Round of 32', null, '1D',             '2F',                '2026-06-29 01:00:00+00'),
('Round of 32', null, '1E',             '3D/H/I/L',          '2026-06-29 19:00:00+00'),
('Round of 32', null, '1G',             '2I',                '2026-06-29 22:00:00+00'),
('Round of 32', null, '1H',             '2J',                '2026-06-30 01:00:00+00'),
('Round of 32', null, '1I',             '3B/E/H/L',          '2026-06-30 19:00:00+00'),
('Round of 32', null, '1L',             '3E/H/J/K',          '2026-06-30 22:00:00+00'),
('Round of 32', null, '2A',             '2C',                '2026-07-01 19:00:00+00'),
('Round of 32', null, '2B',             '2E',                '2026-07-01 22:00:00+00'),
('Round of 32', null, '2D',             '2H',                '2026-07-02 01:00:00+00'),
('Round of 32', null, '2G',             '2K',                '2026-07-02 19:00:00+00'),
('Round of 32', null, '1B',             '3G/I/J/K',          '2026-07-02 22:00:00+00'),
('Round of 32', null, '1F',             '3C/D/G/I',          '2026-07-03 01:00:00+00'),
('Round of 32', null, '1J',             '3A/B/F/H',          '2026-07-03 19:00:00+00'),
('Round of 32', null, '1K',             '3A/B/C/D',          '2026-07-03 22:00:00+00'),

-- ───────── Round of 16 (July 4 – 7) ─────────
('Round of 16', null, 'W R32-1',  'W R32-2',  '2026-07-04 19:00:00+00'),
('Round of 16', null, 'W R32-3',  'W R32-4',  '2026-07-04 22:00:00+00'),
('Round of 16', null, 'W R32-5',  'W R32-6',  '2026-07-05 19:00:00+00'),
('Round of 16', null, 'W R32-7',  'W R32-8',  '2026-07-05 22:00:00+00'),
('Round of 16', null, 'W R32-9',  'W R32-10', '2026-07-06 19:00:00+00'),
('Round of 16', null, 'W R32-11', 'W R32-12', '2026-07-06 22:00:00+00'),
('Round of 16', null, 'W R32-13', 'W R32-14', '2026-07-07 19:00:00+00'),
('Round of 16', null, 'W R32-15', 'W R32-16', '2026-07-07 22:00:00+00'),

-- ───────── Quarterfinals (July 9 – 11) ─────────
('Quarterfinals', null, 'W R16-1', 'W R16-2', '2026-07-09 22:00:00+00'),
('Quarterfinals', null, 'W R16-3', 'W R16-4', '2026-07-10 01:00:00+00'),
('Quarterfinals', null, 'W R16-5', 'W R16-6', '2026-07-10 22:00:00+00'),
('Quarterfinals', null, 'W R16-7', 'W R16-8', '2026-07-11 22:00:00+00'),

-- ───────── Semifinals (July 14 – 15) ─────────
('Semifinals',  null, 'W QF-1', 'W QF-2', '2026-07-14 23:00:00+00'),
('Semifinals',  null, 'W QF-3', 'W QF-4', '2026-07-15 23:00:00+00'),

-- ───────── Third place (July 18) & Final (July 19) ─────────
('Third Place', null, 'L SF-1', 'L SF-2', '2026-07-18 19:00:00+00'),
('Final',       null, 'W SF-1', 'W SF-2', '2026-07-19 19:00:00+00');
