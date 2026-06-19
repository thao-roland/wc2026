-- =====================================================================
-- Migration 015 — correctifs du calendrier (matchday 2 surtout).
--
-- Sources comparées : Sky Sports, NBC Sports, Yahoo Sports, Al Jazeera,
-- bracketmundial2026.com — toutes citent les mêmes horaires officiels.
--
-- Deux types de corrections :
--   1) Mauvais appariement (j'avais permuté des équipes en matchday 2
--      du groupe G : Belgium-NZ + Iran-Égypte au lieu de Belgium-Iran
--      + NZ-Égypte qui sont les vrais matchs). Les pronos posés sur
--      ces deux fixtures fictives sont effacés (sinon ils flotteraient
--      sans sens). Les utilisateurs devront re-parier.
--   2) Mauvais horaires : une dizaine de matchs MD2 décalés de 1h à 8h
--      par rapport au calendrier officiel.
-- =====================================================================

-- 1. Correction des appariements du groupe G matchday 2
-- (en deux étapes pour éviter une collision sur la clé unique team_home + team_away)

-- Efface les pronos posés sur les 2 matchs incorrects, ils sont
-- maintenant invalides.
delete from public.predictions
 where match_id in (
   select id from public.matches
    where stage = 'Group Stage' and group_name = 'G'
      and ((team_home = 'Belgium' and team_away = 'New Zealand')
        or (team_home = 'Iran'    and team_away = 'Egypt'))
 );

update public.matches
   set team_away = 'Iran'
 where stage = 'Group Stage' and group_name = 'G'
   and team_home = 'Belgium' and team_away = 'New Zealand';

update public.matches
   set team_home = 'New Zealand'
 where stage = 'Group Stage' and group_name = 'G'
   and team_home = 'Iran' and team_away = 'Egypt';

-- 2. Mise à jour des horaires UTC (les ET → UTC en pleine saison
-- d'été = ET + 4h ; PT → UTC = PT + 7h)

update public.matches set match_date = '2026-06-18 16:00:00+00'  -- 12h ET
 where stage='Group Stage' and team_home = 'Czechia'    and team_away = 'South Africa';

update public.matches set match_date = '2026-06-19 01:00:00+00'  -- 21h ET (18 juin)
 where stage='Group Stage' and team_home = 'Mexico'     and team_away = 'Korea Republic';

update public.matches set match_date = '2026-06-19 19:00:00+00'  -- 15h ET
 where stage='Group Stage' and team_home = 'USA'        and team_away = 'Australia';

update public.matches set match_date = '2026-06-20 00:30:00+00'  -- 20h30 ET (19 juin)
 where stage='Group Stage' and team_home = 'Brazil'     and team_away = 'Haiti';

update public.matches set match_date = '2026-06-20 03:00:00+00'  -- 23h ET (19 juin)
 where stage='Group Stage' and team_home = 'Türkiye'    and team_away = 'Paraguay';

update public.matches set match_date = '2026-06-21 04:00:00+00'  -- 00h ET (21 juin)
 where stage='Group Stage' and team_home = 'Tunisia'    and team_away = 'Japan';

update public.matches set match_date = '2026-06-21 16:00:00+00'  -- 12h ET
 where stage='Group Stage' and team_home = 'Spain'      and team_away = 'Saudi Arabia';

update public.matches set match_date = '2026-06-21 22:00:00+00'  -- 18h ET
 where stage='Group Stage' and team_home = 'Uruguay'    and team_away = 'Cape Verde';

update public.matches set match_date = '2026-06-22 17:00:00+00'  -- 13h ET
 where stage='Group Stage' and team_home = 'Argentina'  and team_away = 'Austria';

update public.matches set match_date = '2026-06-22 21:00:00+00'  -- 17h ET
 where stage='Group Stage' and team_home = 'France'     and team_away = 'Iraq';

update public.matches set match_date = '2026-06-23 00:00:00+00'  -- 20h ET (22 juin)
 where stage='Group Stage' and team_home = 'Norway'     and team_away = 'Senegal';

update public.matches set match_date = '2026-06-23 03:00:00+00'  -- 23h ET (22 juin)
 where stage='Group Stage' and team_home = 'Jordan'     and team_away = 'Algeria';

notify pgrst, 'reload schema';
