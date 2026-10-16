# Mchango wa Send Off - Lidya Shauri (Netlify + MongoDB)

Hakuna server ya kuendesha. Frontend iko kwenye `public/`, na `netlify/functions/api.js` ni serverless function inayozungumza na MongoDB.
Browser haiwezi kuunganishwa moja kwa moja na MongoDB (ingevujisha password), ndiyo maana function hii ipo.

## 1. MongoDB Atlas
- Tengeneza cluster ya bure, database user, na Network Access ruhusu `0.0.0.0/0`.
- Nakili connection string kwenye `MONGODB_URI`.

## 2. Netlify
1. Weka folda hii kwenye GitHub, kisha Netlify > Add new site > Import from Git (build settings zinasomwa kutoka `netlify.toml`).
2. Site configuration > Environment variables, ongeza: `MONGODB_URI`, `DB_NAME` (mfano lidya), `ADMIN_USER`, `ADMIN_PASS`, `JWT_SECRET`.
3. Deploy. Link ya wageni: `https://JINA.netlify.app` - Admin: `https://JINA.netlify.app/admin.html`

Kumbuka: drag-and-drop ya folda haitajenga function; tumia Git au Netlify CLI (`netlify deploy --prod`).

## Usalama
- Credentials za admin ziko kwenye env tu; data zote ziko MongoDB.
- Mchango hauhesabiwi hadi admin athibitishe (Approve).
