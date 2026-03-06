# Personal Finance App (Next.js + Supabase)

## Requisitos
- Node.js 20+
- Un proyecto de Supabase

## Configuracion
1. Instala dependencias:
   npm install
2. Crea variables de entorno:
   copy .env.example .env.local
3. Rellena en `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `OPENAI_API_KEY` (opcional, para insights IA con modelo OpenAI)
4. Arranca:
   npm run dev

## Flujo de autenticacion
- `/login`: login y registro por email/password
- `/protected`: ruta protegida por sesion
- `/logout`: cierra sesion y redirige al login

## IA financiera
- Endpoint: `/api/ai-insights`
- Si existe `OPENAI_API_KEY`, genera insights con OpenAI.
- Si no existe, usa un motor local de reglas como fallback.

## Configuracion en Supabase Auth
- Authentication > URL Configuration
  - Site URL: `http://localhost:3000`
  - Redirect URLs: `http://localhost:3000/auth/callback`

## Despliegue en Vercel
1. Sube el proyecto a GitHub/GitLab/Bitbucket.
2. En Vercel: **Add New Project** y selecciona el repositorio.
3. Framework preset: **Next.js** (detectado automaticamente).
4. Configura variables de entorno en Vercel (Production/Preview):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `OPENAI_API_KEY` (opcional, para insights IA con OpenAI)
5. Deploy.

## Ajustes Supabase para Produccion
En Supabase > Authentication > URL Configuration:
- Site URL: `https://TU-DOMINIO-VERCEL.vercel.app`
- Redirect URLs:
  - `https://TU-DOMINIO-VERCEL.vercel.app/auth/callback`

Si usas dominio propio, sustituye por tu dominio final.
