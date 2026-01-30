import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import { obtenerTokenValido, CuentaML } from '@/lib/mercadolibre';

// --- HELPER 1: Fetch Auth (Tu Credencial) ---
async function fetchAuth(url: string, token: string) {
    try {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return null;
        return await res.json();
    } catch (e) { return null; }
}

// --- HELPER 2: Fetch Público (Respaldo Vercel) ---
// Usa headers de navegador para intentar pasar desapercibido
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

    // A. INTENTO 1: Highlights con Token (Oficial)
    const highlights = await fetchAuth(`https://api.mercadolibre.com/highlights/MLA/category/${categoryId}`, token);
    if (highlights && highlights.content) {
        const top = highlights.content.find((i: any) => {
             const id = i.id || i.content?.id;
             return id && id !== itemId;
        });
        if (top) {
            rivalId = top.id || top.content?.id;
            console.log(`✅ Rival encontrado en Highlights: ${rivalId}`);
        }
    }

    // B. INTENTO 2: Búsqueda Pública (Sin Token - Bypass de Escudo)
    // Si highlights falló, intentamos buscar "desde afuera" aprovechando que estamos en Vercel.
    if (!rivalId) {
        console.log("⚠️ Highlights vacío. Intentando búsqueda pública...");
        // Buscamos por nombre de categoría + "mas vendidos" implícito por relevancia
        const searchUrl = `https://api.mercadolibre.com/sites/MLA/search?q=${encodeURIComponent(categoryName)}&limit=5`;
        const publicSearch = await fetchPublic(searchUrl);
        
        if (publicSearch && publicSearch.results) {
            const top = publicSearch.results.find((i: any) => i.id !== itemId);
            if (top) {
                rivalId = top.id;
                console.log(`✅ Rival encontrado en Public Search: ${rivalId}`);
            }
        }
    }

    // C. INTENTO 3: Búsqueda por Título (Último recurso)
    if (!rivalId) {
        const shortTitle = myItem.title.split(' ').slice(0, 2).join(' '); // 2 palabras clave
        const searchUrl = `https://api.mercadolibre.com/sites/MLA/search?q=${encodeURIComponent(shortTitle)}&limit=5`;
        const titleSearch = await fetchAuth(searchUrl, token); // Volvemos a Auth por si acaso
        if (titleSearch && titleSearch.results) {
             const top = titleSearch.results.find((i: any) => i.id !== itemId);
             if (top) rivalId = top.id;
        }
    }

    if (!rivalId) {
        return NextResponse.json({ success: false, error: 'No se encontraron competidores reales.' });
    }

    // 4. OBTENER DETALLES DEL RIVAL (Manejo de Error 404 - Catálogo)
    let rivalFinal = null;
    
    // Intento A: Como Ítem (Publicación normal)
    rivalFinal = await fetchAuth(`https://api.mercadolibre.com/items/${rivalId}`, token);
    
    // Intento B: Como Producto de Catálogo (Si el anterior dio 404 o error)
    if (!rivalFinal || rivalFinal.error) {
        console.log(`⚠️ Falló item ${rivalId}, probando como Producto de Catálogo...`);
        rivalFinal = await fetchAuth(`https://api.mercadolibre.com/products/${rivalId}`, token);
    }

    // Si aún así falla, intentamos público
    if (!rivalFinal || rivalFinal.error) {
        console.log(`⚠️ Falló Auth, probando fetch público para ${rivalId}...`);
        rivalFinal = await fetchPublic(`https://api.mercadolibre.com/items/${rivalId}`);
    }

    if (!rivalFinal || rivalFinal.error) {
        console.error(`❌ Imposible obtener detalle de ${rivalId}`);
        return NextResponse.json({ success: false, error: 'El competidor encontrado no está accesible.' });
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
                title: rivalFinal.title || rivalFinal.name, // Productos usan 'name'
                price: rivalFinal.price || 0, // Productos a veces no tienen precio directo (rango), cuidado aquí
                thumbnail: rivalFinal.thumbnail || rivalFinal.secure_thumbnail || rivalFinal.picture_url,
                permalink: rivalFinal.permalink,
                sold_quantity: rivalFinal.sold_quantity || 0,
                condition: rivalFinal.condition
            }
        }
    });

  } catch (error: any) {
    console.error("🔥 Error Critical:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}