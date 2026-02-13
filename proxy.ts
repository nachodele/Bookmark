// proxy.ts  (o middleware.ts si usas nombre antiguo en versiones previas)
import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// ¡Aquí está el cambio clave! → export async function ...
export async function proxy(request: NextRequest) {
  // Crea la respuesta base (necesaria para poder setear cookies después)
  let response = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Aquí usas await → por eso la función debe ser async
  const { data: { session } } = await supabase.auth.getSession();

  const pathname = request.nextUrl.pathname;

  // Rutas públicas → no redirigir nunca (evita bucles)
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/auth/') ||
    pathname === '/share-target'
  ) {
    return response;
  }

  // Rutas protegidas
  if (!session?.user) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Todo OK → continua con la respuesta (con cookies actualizadas si Supabase las modificó)
  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};