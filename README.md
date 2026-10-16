# Mchango wa Send Off - Lidya Shauri

Stack: Node.js + Express + MongoDB (Mongoose). Hosting: Render.

## Kuendesha kwenye kompyuta
1. `npm install`
2. Nakili `.env.example` kuwa `.env`, jaza `MONGODB_URI`, `ADMIN_USER`, `ADMIN_PASS`, `JWT_SECRET`
3. `npm start` kisha fungua http://localhost:3000 (admin: /admin.html)

## MongoDB Atlas
Fungua cluster ya bure, tengeneza database user, ruhusu IP `0.0.0.0/0` (Network Access), nakili connection string kwenye `MONGODB_URI`.

## Render
1. Weka project kwenye GitHub, kisha Render > New > Blueprint (inasoma `render.yaml`) au Web Service (Build: `npm install`, Start: `node server.js`).
2. Weka Environment Variables: `MONGODB_URI`, `ADMIN_USER`, `ADMIN_PASS`, `JWT_SECRET`.
3. Link ya wageni: `https://JINA.onrender.com` - Admin: `https://JINA.onrender.com/admin.html`

## Usalama
Admin credentials ziko kwenye env tu. Data zote (RSVP, michango, takwimu) ziko kwenye MongoDB. Mchango hauhesabiwi hadi admin athibitishe (Approve).
