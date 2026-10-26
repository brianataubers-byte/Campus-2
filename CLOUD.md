# Campus online

Integrarea folosește proiectul Supabase Campus-2, plan Free, Frankfurt. Codul public conține numai URL-ul și cheia publishable; cheia service_role este folosită exclusiv de mediul Edge Function.

## Activare pentru proprietar

1. În Supabase > Authentication > URL Configuration, setează Site URL la https://brianataubers-byte.github.io/Campus-2/ și permite aceeași adresă ca Redirect URL. Conectorul utilizat la implementare nu expune modificarea configurației Auth; această setare se face din dashboard.
2. Deschide Campus în browserul în care ai notițele complete și actuale.
3. Apasă Salvare online > Creează un cont, confirmă emailul și conectează-te.
4. Folosește Descarcă backup și creează spațiul online. Se creează un spațiu privat nou și se importă notițele din acel browser. Datele personale locale se păstrează separat.
5. Pe telefon sau alt laptop, conectează-te cu același cont și deschide spațiul.

Nu crea importuri separate pe fiecare dispozitiv: primul import este sursa inițială, apoi celelalte dispozitive deschid spațiul existent. Nu importa versiunea demonstrativă dintr-un browser care nu are ultimele tale modificări.

## Acces

- Owner: gestionează membrii, rolurile și linkurile.
- Invitație cu cont: un membru nou primește întotdeauna Viewer. Owner poate schimba ulterior rolul în Editor. Expirarea invitației oprește înscrierile noi; membrii existenți rămân până sunt revocați.
- Link fără cont: vizualizare anonimă pentru toate paginile spațiului, cu expirare de 1-30 zile și revocare. Linkurile nu sunt activate automat.
- Toate paginile importate în același spațiu sunt vizibile membrilor acelui spațiu. Notele personale din modul local nu sunt accesibile prin linkurile unui spațiu.

## Sincronizare și recuperare

Pagini, structură, panouri, comentarii, flashcarduri, metadate, istoric și scris de mână sunt salvate în documentul versionat. Fișierele sunt într-un bucket privat separat. Preferințele de interfață și evaluările personale ale flashcardurilor rămân pe dispozitiv.

Membrii autentificați primesc schimbări prin Supabase Realtime; verificarea periodică la 20 secunde oferă recuperare după întreruperi. Vizitatorii fără cont verifică la 20 secunde dacă documentul s-a modificat sau linkul a fost revocat. Fișierele pentru guest folosesc URL-uri semnate de cel mult 5 minute. Un material deja descărcat poate fi păstrat de destinatar.

Salvările folosesc o revizie a întregului spațiu, verificată atomic pe server. Editările concurente nu sunt îmbinate caracter cu caracter: apare o alegere explicită între versiuni. Copia nesincronizată rămâne în cache și este exportată înainte de înlocuire. Statusul arată distinct salvat online, copie locală nesincronizată sau conflict.

Cache-urile și fișierele unui spațiu sunt separate de notițele personale existente. Conectarea sau deschiderea unui link nu încarcă automat notițele locale pe server.

## Verificări efectuate la 26 octombrie 2026

- Autentificare live cu două conturi temporare.
- Viewer nou, citire privată, refuzul scrierilor și al promovării propriului rol.
- Owner/Editor, salvare din browser și citire de pe un al doilea client.
- Actualizare live în pagina deschisă, fără reload.
- Fișier privat și acces temporar la fișier prin guest.
- Revocarea membrilor, invitațiilor și linkurilor fără cont; expirare verificată în SQL.
- Protejarea proprietarului împotriva eliminării/demotării.
- Conflict real cu salvări concurente, backup și alegerea versiunii online.
- Import complet din browser cu backup înaintea încărcării și păstrarea notițelor personale.
- HTML online sanitizat; linkurile javascript sunt eliminate.
- Datele și conturile temporare folosite pentru teste au fost eliminate.

Testul SQL din supabase/tests/authorization.sql se execută într-o tranzacție cu ROLLBACK și nu lasă date de test în proiect.

## Fișiere

- cloud-storage.js: separarea cache-urilor, înainte de pornirea editorului.
- cloud.js: autentificare, migrare, sincronizare, conflict, roluri, linkuri și fișiere.
- cloud-config.js: configurație publică; nu introduce chei secret/service_role aici.
- supabase/schema.sql: schema aplicată proiectului.
- supabase/functions/campus-guest/index.ts: schimbă un token guest valid pe un document readonly și URL-uri semnate; tokenurile revocate/expirate sunt refuzate.

Toate tabelele au RLS. Scrierile directe sunt interzise clientului; RPC-urile verifică emailul confirmat, apartenența și rolul. Funcțiile SECURITY DEFINER apelabile de authenticated sunt intenționate, au search_path gol și verificări explicite; sunt semnalate informativ de advisor. RPC-ul guest este apelabil numai de service_role, prin endpointul care validează tokenul. Nici identitatea anon, nici un Viewer nu pot scrie sau acorda roluri.
