import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import { obtenerTokenValido, CuentaML } from '@/lib/mercadolibre';

// --- HELPER: Fetch Auth ---
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

    // 2. OBTENER TU PRODUCTO (Datos Reales)
    const myItem = await fetchAuth(`https://api.mercadolibre.com/items/${itemId}`, token);
    if (!myItem) return NextResponse.json({ success: false, error: 'Producto no encontrado' }, { status: 404 });

    const categoryId = myItem.category_id;
    const categoryData = await fetchAuth(`https://api.mercadolibre.com/categories/${categoryId}`, token);
    const categoryName = categoryData?.name || "Categoría";

    // 3. BUSCAR RIVAL REAL (Estrategia: Mismo Título)
    // Buscamos competidores que usen palabras clave similares a las tuyas.
    // Esto suele devolver resultados reales y comparables.
    const searchUrl = `https://api.mercadolibre.com/sites/MLA/search?q=${encodeURIComponent(myItem.title)}&limit=15`;
    const search = await fetchAuth(searchUrl, token);
    
    let rivalData = null;

    if (search && search.results) {
        // Filtramos: 
        // 1. Que no sea yo (id distinto).
        // 2. Que tenga ventas > 0 (si la API las muestra).
        // 3. Ordenamos por mayor venta real.
        const competitors = search.results
            .filter((i: any) => i.id !== itemId) // Sacamos mi producto
            .sort((a: any, b: any) => (b.sold_quantity || 0) - (a.sold_quantity || 0));

        if (competitors.length > 0) {
            // Tomamos al líder de la búsqueda
            rivalData = competitors[0];
        }
    }

    // 4. SI NO HAY RIVAL O DATOS REALES, CORTAMOS ACÁ.
    // No inventamos rival genérico.
    if (!rivalData) {
        return NextResponse.json({
            success: false, 
            error: 'No se encontraron competidores con datos públicos disponibles.'
        });
    }

    // 5. PREPARAR RESPUESTA (Solo datos crudos)
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
                sold_quantity: myItem.sold_quantity || 0, // Dato real o 0
                condition: myItem.condition
            },
            rival: {
                id: rivalData.id,
                title: rivalData.title,
                price: rivalData.price,
                thumbnail: rivalData.thumbnail,
                permalink: rivalData.permalink,
                sold_quantity: rivalData.sold_quantity || 0, // Dato real o 0. NADA DE ESTIMACIONES.
                condition: rivalData.condition
            }
        }
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}