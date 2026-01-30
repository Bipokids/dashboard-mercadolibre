import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import { obtenerTokenValido, CuentaML } from '@/lib/mercadolibre';

async function fetchAuth(url: string, token: string) {
    try {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return null;
        return await res.json();
    } catch (e) { return null; }
}

async function fetchPublic(url: string) {
    try {
        const res = await fetch(url, { 
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json'
            } 
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

    console.log(`🥊 Versus: ${myItem.title} (${categoryId})`);

    // 3. BUSCAR RIVAL (Estrategia Multicapa)
    let rivalId = null;
    let rivalType = 'item'; // 'item' o 'product'

    // A. INTENTO 1: Highlights (Oficial)
    const highlights = await fetchAuth(`https://api.mercadolibre.com/highlights/MLA/category/${categoryId}`, token);
    if (highlights && highlights.content) {
        const top = highlights.content.find((i: any) => {
             const id = i.id || i.content?.id;
             return id && id !== itemId;
        });
        if (top) {
            rivalId = top.id || top.content?.id;
            // Los IDs de catálogo suelen no tener "MLA" al principio o ser solo números, pero ML los mezcla.
            // Asumimos 'item' y si falla cambiamos.
            console.log(`✅ Rival encontrado en Highlights: ${rivalId}`);
        }
    }

    // B. INTENTO 2: Búsqueda Pública
    if (!rivalId) {
        const searchUrl = `https://api.mercadolibre.com/sites/MLA/search?q=${encodeURIComponent(categoryName)}&limit=5`;
        const publicSearch = await fetchPublic(searchUrl);
        if (publicSearch && publicSearch.results) {
            const top = publicSearch.results.find((i: any) => i.id !== itemId);
            if (top) rivalId = top.id;
        }
    }

    if (!rivalId) return NextResponse.json({ success: false, error: 'No se encontraron competidores reales.' });

    // 4. OBTENER DETALLES DEL RIVAL (Lógica "Traductor Universal")
    let rivalFinal: any = null;
    
    // Intento A: Como Ítem
    rivalFinal = await fetchAuth(`https://api.mercadolibre.com/items/${rivalId}`, token);
    
    // Intento B: Como Producto de Catálogo (Si falla A)
    if (!rivalFinal || rivalFinal.error) {
        console.log(`⚠️ Falló item ${rivalId}, probando como Producto de Catálogo...`);
        rivalFinal = await fetchAuth(`https://api.mercadolibre.com/products/${rivalId}`, token);
        rivalType = 'product'; // Marcamos que es catálogo
    }

    // Intento C: Fetch Público
    if (!rivalFinal || rivalFinal.error) {
        rivalFinal = await fetchPublic(`https://api.mercadolibre.com/items/${rivalId}`);
        rivalType = 'item';
    }

    if (!rivalFinal || rivalFinal.error) {
        return NextResponse.json({ success: false, error: 'El competidor encontrado no está accesible.' });
    }

    // 5. NORMALIZACIÓN DE DATOS (Aquí ocurre la magia)
    let rivalPrice = 0;
    let rivalThumb = '';
    let rivalTitle = '';
    let rivalLink = '';

    if (rivalType === 'product') {
        // --- LÓGICA DE CATÁLOGO ---
        rivalTitle = rivalFinal.name;
        // La foto suele estar en 'pictures'
        rivalThumb = rivalFinal.pictures && rivalFinal.pictures.length > 0 
            ? rivalFinal.pictures[0].url 
            : (rivalFinal.picture_url || '');
        
        // El precio está en 'buy_box_winner' (el vendedor que gana la venta)
        if (rivalFinal.buy_box_winner) {
            rivalPrice = rivalFinal.buy_box_winner.price;
            rivalLink = `https://www.mercadolibre.com.ar/p/${rivalFinal.id}`; // Link al producto
        } else {
            // Si no hay ganador, buscamos en rango de precios
            rivalPrice = rivalFinal.price_aggregator?.min_price || 0;
            rivalLink = rivalFinal.permalink;
        }
    } else {
        // --- LÓGICA DE ÍTEM NORMAL ---
        rivalTitle = rivalFinal.title;
        rivalThumb = rivalFinal.thumbnail || rivalFinal.secure_thumbnail;
        rivalPrice = rivalFinal.price;
        rivalLink = rivalFinal.permalink;
    }

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
                title: rivalTitle,
                price: rivalPrice || 0, // Dato real
                thumbnail: rivalThumb,
                permalink: rivalLink,
                sold_quantity: rivalFinal.sold_quantity || 0, // Dato real
                condition: rivalFinal.condition
            }
        }
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}