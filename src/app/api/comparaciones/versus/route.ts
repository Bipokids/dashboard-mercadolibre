import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import { obtenerTokenValido, CuentaML } from '@/lib/mercadolibre';

// Helper: Fetch con manejo de errores
async function fetchAuth(url: string, token: string, label: string = 'API') {
    try {
        console.log(`📡 [${label}] Fetching: ${url}`);
        const res = await fetch(url, { 
            headers: { Authorization: `Bearer ${token}` } 
        });
        if (!res.ok) {
            console.error(`❌ [${label}] Error ${res.status}`);
            return null;
        }
        return await res.json();
    } catch (e) { 
        console.error(`🔥 [${label}] Exception:`, e);
        return null; 
    }
}

export async function POST(request: Request) {
  try {
    const { itemId } = await request.json(); 
    if (!itemId) return NextResponse.json({ success: false, error: 'Falta Item ID' }, { status: 400 });

    // 1. AUTH
    const cuentasSnap = await get(ref(db, 'cuentas_mercado_libre'));
    if (!cuentasSnap.exists()) return NextResponse.json({ success: false, error: 'No hay cuentas' }, { status: 404 });
    const cuentasData = cuentasSnap.val();
    const targetId = "322199723"; 
    let data = cuentasData[targetId] || Object.values(cuentasData)[0];
    
    // @ts-ignore
    const cuenta: CuentaML = {
        userId: data.user_id || targetId,
        alias: data.alias || 'Usuario',
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        clientId: data.client_id,
        clientSecret: data.client_secret
    };
    const token = await obtenerTokenValido(cuenta);
    if (!token) return NextResponse.json({ success: false, error: 'Auth falló' }, { status: 401 });

    // 2. OBTENER TU PRODUCTO
    const myItem = await fetchAuth(`https://api.mercadolibre.com/items/${itemId}`, token, 'MY-ITEM');
    if (!myItem) return NextResponse.json({ success: false, error: 'Producto no encontrado' }, { status: 404 });

    const categoryId = myItem.category_id;
    const categoryData = await fetchAuth(`https://api.mercadolibre.com/categories/${categoryId}`, token, 'CATEGORY');
    const categoryName = categoryData?.name || "Categoría";

    console.log(`🔍 Buscando rival en categoría: ${categoryName} (${categoryId})`);

    // 3. BUSCAR RIVAL (Estrategia: Highlights > Search Category > Search Title)
    let rivalId = null;

    // A. INTENTO 1: Highlights (Los "Más Vendidos" oficiales)
    // Es el dato más "real" de quién es el líder.
    const highlightsUrl = `https://api.mercadolibre.com/highlights/MLA/category/${categoryId}`;
    const highlights = await fetchAuth(highlightsUrl, token, 'HIGHLIGHTS');

    if (highlights && highlights.content) {
        // Buscamos el primero que no seas vos
        const top = highlights.content.find((i: any) => {
            const id = i.id || i.content?.id;
            return id && id !== itemId;
        });
        if (top) rivalId = top.id || top.content?.id;
    }

    // B. INTENTO 2: Búsqueda por Categoría (Si Highlights falla)
    if (!rivalId) {
        console.log("⚠️ Highlights vacío. Intentando búsqueda por categoría...");
        // Quitamos el sort para evitar bloqueos estrictos, confiamos en la relevancia por defecto
        const searchUrl = `https://api.mercadolibre.com/sites/MLA/search?category=${categoryId}&limit=10`;
        const search = await fetchAuth(searchUrl, token, 'SEARCH-CAT');
        
        if (search && search.results) {
            // Ordenamos nosotros por ventas si viene el dato
            const sorted = search.results.sort((a: any, b: any) => (b.sold_quantity || 0) - (a.sold_quantity || 0));
            const top = sorted.find((i: any) => i.id !== itemId);
            if (top) rivalId = top.id;
        }
    }

    // C. INTENTO 3: Búsqueda por Título (Último recurso real)
    if (!rivalId) {
        console.log("⚠️ Búsqueda Categoría vacía. Intentando por Título...");
        // Usamos las primeras 3 palabras del título para ser específicos pero no tanto
        const shortTitle = myItem.title.split(' ').slice(0, 3).join(' ');
        const titleUrl = `https://api.mercadolibre.com/sites/MLA/search?q=${encodeURIComponent(shortTitle)}&limit=10`;
        const titleSearch = await fetchAuth(titleUrl, token, 'SEARCH-TITLE');

        if (titleSearch && titleSearch.results) {
             const top = titleSearch.results.find((i: any) => i.id !== itemId);
             if (top) rivalId = top.id;
        }
    }

    // 4. SI NO HAY RIVAL, DEVOLVER ERROR CLARO
    if (!rivalId) {
        console.error("❌ No se encontró ningún competidor tras 3 estrategias.");
        return NextResponse.json({
            success: false, 
            error: `No se encontraron competidores reales en la categoría ${categoryName}.`
        });
    }

    // 5. OBTENER DETALLES DEL RIVAL
    const rivalItem = await fetchAuth(`https://api.mercadolibre.com/items/${rivalId}`, token, 'RIVAL-DETAIL');
    if (!rivalItem) {
        return NextResponse.json({ success: false, error: 'Error al obtener datos del rival.' });
    }

    // 6. RETORNAR DATA (Datos 100% Reales)
    return NextResponse.json({
        success: true,
        data: {
            category: categoryName,
            me: {
                id: myItem.id,
                title: myItem.title,
                price: myItem.price,
                thumbnail: myItem.thumbnail,
                permalink: myItem.permalink,
                sold_quantity: myItem.sold_quantity || 0,
                condition: myItem.condition
            },
            rival: {
                id: rivalItem.id,
                title: rivalItem.title,
                price: rivalItem.price,
                thumbnail: rivalItem.thumbnail || rivalItem.secure_thumbnail,
                permalink: rivalItem.permalink,
                sold_quantity: rivalItem.sold_quantity || 0,
                condition: rivalItem.condition
            }
        }
    });

  } catch (error: any) {
    console.error("🔥 Error Global Versus:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}