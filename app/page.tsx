// app/page.tsx
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server'; // ajusta si el alias @ es diferente

export default async function Home() {
  const supabase = await createServerSupabase();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?redirect=/');
  }

  // Fetch bookmarks del usuario logueado (RLS protege automáticamente)
  const { data: bookmarks, error } = await supabase
    .from('bookmarks')
    .select(`
      id,
      url,
      title,
      summary,
      tags,
      category,
      notes,
      created_at,
      category:categories (name)
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    return <div className="p-8 text-center text-red-600">Error al cargar bookmarks: {error.message}</div>;
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black p-6">
      <header className="max-w-4xl mx-auto mb-12">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-black dark:text-white">Mis Bookmarks</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">{user?.email}</span>
            <form
              action={async () => {
                'use server';
                const supabase = await createServerSupabase();
                await supabase.auth.signOut();
                redirect('/login');
              }}
            >
              <button type="submit" className="text-sm text-zinc-700 dark:text-zinc-300 hover:underline">
                Cerrar sesión
              </button>
            </form>
          </div>
        </div>
      </header>

      {bookmarks?.length === 0 ? (
        <div className="text-center py-20 max-w-md mx-auto">
          <h2 className="text-2xl font-semibold mb-4 dark:text-white">Aún no tienes bookmarks</h2>
          <p className="text-zinc-600 dark:text-zinc-400 mb-6">
            Comparte enlaces desde tu móvil o navegador para guardarlos con IA.
          </p>
          <p className="text-sm text-zinc-500">Prueba compartiendo cualquier URL → llegará a /share-target</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 max-w-4xl mx-auto">
          {bookmarks.map((b) => (
            <div
              key={b.id}
              className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-md transition"
            >
              <a
                href={b.url ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-xl font-semibold text-black dark:text-white hover:underline mb-2"
              >
                {b.title}
              </a>

              {b.summary && <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4 line-clamp-3">{b.summary}</p>}

              <div className="flex flex-wrap gap-2 mb-4">
                {b.tags?.map((tag) => (
                  <span key={tag} className="px-2 py-1 text-xs bg-zinc-100 dark:bg-zinc-800 rounded-full">
                    {tag}
                  </span>
                ))}
              </div>

              <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
                <span>{b.category?.name || b.category || 'Sin categoría'}</span>
                <time>
                  {b.created_at ? new Date(b.created_at).toLocaleDateString('es-ES') : 'Reciente'}
                </time>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}