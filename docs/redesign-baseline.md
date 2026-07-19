# THE MIDGAS — baseline before product redesign

Recorded after reverting commits `cf1d287` and `161cec4`.

## Runtime

- The frontend is static HTML, CSS and browser JavaScript. React and TypeScript are not used, so there is no React/TypeScript build to validate.
- The project uses pinned `@supabase/supabase-js@2.110.2` in public pages.
- The live Supabase project is `skvwaovkkoxqfwkcpuvh` (`midgas`, Postgres 17, healthy at audit time).
- `record-editor.js` had no HTML entry point and duplicated the active inline editor. It was removed as dead code.
- Account-specific UI exceptions for the obsolete `abdulo` login were removed. Role behavior must be defined by authorization data, not hardcoded usernames.

## Live data baseline

- Active records: 35 clients, 1 anomaly, 2 incidents.
- All active records have a name, summary, sections array and relationships array.
- Existing records still store legacy `alias` and `cardType` keys. A later migration will map them to one `caption` field without losing content.
- The relationship graph has 71 record relationships and 29 board edges.
- The board contains one `LOC` node and one obsolete `SUB` node. The redesign removes the ability to create subjects and migrates the remaining subject safely.

## Current account model

- Legacy accounts: `abdulo` (`limited`), `zahur` (`full`), `han` (`admin`).
- The target model is `viewer`, `editor`, `admin` with logins Ashtar, Zahur and Kaba.
- Roles are enforced from trusted membership/app metadata, never from editable user metadata.

## Supabase findings

- All public content tables have RLS enabled.
- Private credential/session tables deliberately have no public policies and are reachable only through server-side functions.
- The security advisor reports leaked-password protection disabled in Auth; this must be enabled in the Supabase dashboard because it is an Auth project setting, not a SQL policy.
- The performance advisor reports duplicate permissive read policies for `records` and `relationships`; the authorization migration will consolidate them.
- New public tables must receive explicit Data API grants because Supabase changed default exposure behavior in 2026.

## Redesign constraints

- Preserve MIDGAS documentary typography, grid, borders, monochrome photography and archival tone.
- Red is reactive: hover, selected, destructive, error and high-risk states only.
- New editable entities: records, locations, glossary terms and quotes.
- New record media model: one cover plus up to nine gallery images.
