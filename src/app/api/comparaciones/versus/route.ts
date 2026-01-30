import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import { obtenerTokenValido, CuentaML } from '@/lib/mercadolibre';

async function fetchAuth(url: string, token: string) {
    try {
        const res = await fetch(url, { 
            headers: { Authorization: `Bearer ${token}` } 
        });
        if (!res.ok) return null;
        return await res.json();
    } catch (e) { return null; }
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
    const myItem = await fetchAuth(`https://api.mercadolibre.com/items/${itemId}`, token);
    if (!myItem) return NextResponse.json({ success: false, error: 'Producto no encontrado' }, { status: 404 });

    const categoryId = myItem.category_id;
    const categoryData = await fetchAuth(`https://api.mercadolibre.com/categories/${categoryId}`, token);
    const categoryName = categoryData?.name || "Categoría";

    // 3. BUSCAR AL #1 DE LA CATEGORÍA (Rival Real)
    // En lugar de buscar por título, pedimos el Top Seller del nicho.
    // Esto casi siempre devuelve un resultado real.
    const searchUrl = `https://api.mercadolibre.com/sites/MLA/search?category=${categoryId}&sort=sold_quantity_desc&limit=3`;
    const search = await fetchAuth(searchUrl, token);
    
    let rivalData = null;

    if (search && search.results) {
        // Tomamos el primer resultado que NO seas vos
        rivalData = search.results.find((i: any) => i.id !== itemId);
    }

    // 4. SI NO HAY RIVAL (Ni siquiera por categoría)
    // Aquí es donde aceptamos la derrota si ML bloquea todo.
    if (!rivalData) {
        // INTENTO DESESPERADO: Buscar por texto de la categoría (último recurso real)
        const fallbackUrl = `https://api.mercadolibre.com/sites/MLA/search?q=${encodeURIComponent(categoryName)}&sort=sold_quantity_desc&limit=3`;
        const fallbackSearch = await fetchAuth(fallbackUrl, token);
        if (fallbackSearch && fallbackSearch.results) {
             rivalData = fallbackSearch.results.find((i: any) => i.id !== itemId);
        }
    }

    if (!rivalData) {
        return NextResponse.json({
            success: false, 
            error: 'Mercado Libre no devolvió datos de competidores para esta categoría.'
        });
    }

    // 5. DETALLE FINAL DEL RIVAL (Para asegurar datos frescos)
    // A veces la búsqueda no trae todo, consultamos el item específico
    const fullRival = await fetchAuth(`https://api.mercadolibre.com/items/${rivalData.id}`, token);
    const rivalFinal = fullRival || rivalData;

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
                id: rivalFinal.id,
                title: rivalFinal.title,
                price: rivalFinal.price,
                thumbnail: rivalFinal.thumbnail || rivalFinal.secure_thumbnail,
                permalink: rivalFinal.permalink,
                // Si ML oculta ventas (0), mostramos 0. NO INVENTAMOS.
                // Pero al ser el #1 de la búsqueda, es el dato real disponible.
                sold_quantity: rivalFinal.sold_quantity || 0, 
                condition: rivalFinal.condition
            }
        }
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}