// app/share-target/page.tsx
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';

export default async function ShareTargetPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const url = searchParams.url as string;
  const title = searchParams.title as string;
  const text = searchParams.text as string;

  if (!url) {
    return <div>Error: no se recibió URL</div>;
  }

  // ← Aquí está la corrección clave
const supabase = await createServerSupabase();        // SIN await

  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.user) {
    const redirectUrl = new URL('/login', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');
    redirectUrl.searchParams.set('share_url', url);
    redirectUrl.searchParams.set('share_title', title || '');
    redirectUrl.searchParams.set('share_text', text || '');
    redirect(redirectUrl.toString());
  }

  // Resto del código igual...
  const webhookUrl = process.env.N8N_WEBHOOK_URL!;
  const body = { user_id: session.user.id, url, title: title || '', text: text || '' };

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error('Webhook falló');

    const data = await res.json();

    if (!data.success) {
      return <div>Este enlace ya existe</div>;
    }

    redirect('/?added=true');
  } catch (err) {
    return <div>Error al guardar: {String(err)}</div>;
  }
}