// config.js — os mesmos valores do Nosso Plano: o Minhas Compras usa o mesmo
// projeto Supabase ("financas") para aproveitar o mesmo login do casal.
//
// Pode ficar no Git: a anon key é pública por desenho. Ela só lê ou grava algo
// junto com o login de alguém que esteja em public.membros_casal, que é o que
// as políticas RLS do esquema mercado exigem. A chave service_role NUNCA entra
// aqui nem em nenhum arquivo deste site.

export const SUPABASE_URL = "https://krlmkcwigyabtsackjqo.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtybG1rY3dpZ3lhYnRzYWNranFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2MjkzNDEsImV4cCI6MjEwMTIwNTM0MX0.0vptRVzmh4PeB5kZJ3CVjyCETbko7TOnOTctH94vxvk";

export const configurado =
  !SUPABASE_URL.includes("SEU-PROJETO") && !SUPABASE_ANON_KEY.includes("COLE_AQUI");
