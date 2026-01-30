import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import { obtenerTokenValido, CuentaML } from '@/lib/mercadolibre';

// --- HELPER 1: Fetch Auth ---
async function fetchAuth(url: string, token: string) {
    try {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return null;
        return await res.json();
    } catch (e) { return null; }
}

// --- HELPER 2: Fetch Público (Respaldo) ---
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

    console.log(`🥊 Buscando rival para: "${myItem.title}"`);

    // 3. BUSCAR RIVAL (Estrategia: "El Mejor Dato Gana")
    // Probamos varias estrategias en orden. La primera que devuelva un rival con PRECIO > 0 gana.
    
    let candidates: any[] = [];

    // A. ESTRATEGIA TÍTULO (Keywords): Busca competencia directa real (Items)
    // Usamos las primeras 3 palabras clave del título. Esto suele traer items activos con precio.
    const keywords = myItem.title.split(' ').slice(0, 3).join(' ');
    const searchTitleUrl = `https://api.mercadolibre.com/sites/MLA/search?q=${encodeURIComponent(keywords)}&sort=sold_quantity_desc&limit=5`;
    const searchTitle = await fetchAuth(searchTitleUrl, token);
    if (searchTitle && searchTitle.results) candidates.push(...searchTitle.results);

    // B. ESTRATEGIA HIGHLIGHTS: Líderes oficiales de la categoría
    const highlights = await fetchAuth(`https://api.mercadolibre.com/highlights/MLA/category/${categoryId}`, token);
    if (highlights && highlights.content) {
        // Normalizamos la estructura rara de highlights
        const hlItems = highlights.content.map((h: any) => h.content || h).filter((h: any) => h.id);
        candidates.push(...hlItems);
    }

    // C. ESTRATEGIA CATEGORÍA: Búsqueda general en el nicho
    const searchCatUrl = `https://api.mercadolibre.com/sites/MLA/search?category=${categoryId}&sort=sold_quantity_desc&limit=5`;
    const searchCat = await fetchAuth(searchCatUrl, token);
    if (searchCat && searchCat.results) candidates.push(...searchCat.results);

    // FILTRADO INTELIGENTE
    // 1. Quitamos nuestro propio producto.
    // 2. Quitamos duplicados.
    // 3. Priorizamos los que tienen "sold_quantity" alto.
    let bestRivalId = null;

    const uniqueCandidates = Array.from(new Map(candidates.map(item => [item.id, item])).values())
        .filter((i: any) => i.id !== itemId); // Sacarme a mí mismo

    // Iteramos candidatos para encontrar uno VÁLIDO (que tenga precio accesible)
    for (const candidate of uniqueCandidates) {
        // Si ya viene con precio y ventas en la búsqueda (es un Item), es el mejor candidato.
        if (candidate.price > 0 && candidate.domain_id) { // domain_id suele indicar Item
             bestRivalId = candidate.id;
             console.log(`✅ Rival Item encontrado: ${bestRivalId} ($${candidate.price})`);
             break; 
        }
        
        // Si es sospechoso de ser catálogo (sin precio claro en search), lo verificamos después,
        // pero guardamos el primero como backup.
        if (!bestRivalId) bestRivalId = candidate.id;
    }

    if (!bestRivalId) return NextResponse.json({ success: false, error: 'No se encontraron competidores.' });

    // 4. OBTENER DETALLE Y EXTRAER DATOS (Deep Parsing)
    let rivalFinal: any = null;
    let rivalType = 'item';

    // Intentamos leerlo como Item primero
    rivalFinal = await fetchAuth(`https://api.mercadolibre.com/items/${bestRivalId}`, token);
    
    // Si falla o parece catálogo roto, probamos endpoint de productos
    if (!rivalFinal || rivalFinal.error || rivalFinal.status === 'not_found') {
        console.log(`⚠️ Item ${bestRivalId} falló, probando endpoint Productos...`);
        rivalFinal = await fetchAuth(`https://api.mercadolibre.com/products/${bestRivalId}`, token);
        rivalType = 'product';
    }

    // Si sigue fallando, intento público
    if (!rivalFinal || rivalFinal.error) {
        rivalFinal = await fetchPublic(`https://api.mercadolibre.com/items/${bestRivalId}`);
        rivalType = 'item';
    }

    if (!rivalFinal || rivalFinal.error) {
        return NextResponse.json({ success: false, error: 'Datos del competidor no accesibles.' });
    }

    // 5. NORMALIZACIÓN (Extraer Precio a toda costa)
    let rPrice = 0;
    let rThumb = '';
    let rTitle = '';
    let rLink = '';
    let rSold = 0;

    if (rivalType === 'product') {
        rTitle = rivalFinal.name;
        rThumb = rivalFinal.pictures?.[0]?.url || rivalFinal.picture_url || '';
        
        // BUSCADOR DE PRECIOS AVANZADO PARA CATÁLOGO
        if (rivalFinal.buy_box_winner?.price) {
            rPrice = rivalFinal.buy_box_winner.price;
        } else if (rivalFinal.price_aggregator?.min_price) {
            rPrice = rivalFinal.price_aggregator.min_price;
        } else if (rivalFinal.price_aggregator?.average_price) {
            rPrice = rivalFinal.price_aggregator.average_price;
        }
        
        rLink = rivalFinal.permalink || `https://www.mercadolibre.com.ar/p/${rivalFinal.id}`;
        rSold = rivalFinal.sold_quantity || 0;
    } else {
        rTitle = rivalFinal.title;
        rThumb = rivalFinal.thumbnail || rivalFinal.secure_thumbnail;
        rPrice = rivalFinal.price || 0;
        rLink = rivalFinal.permalink;
        rSold = rivalFinal.sold_quantity || 0;
    }

    // Failsafe Link
    if (!rLink || rLink === '#') {
        rLink = `https://listado.mercadolibre.com.ar/${rTitle.replace(/\s+/g, '-')}`;
    }

    // --- CORRECCIÓN FINAL POR SI EL RIVAL ELEGIDO TENÍA PRECIO 0 ---
    // Si después de todo, el precio sigue siendo 0 (catálogo vacío), activamos el plan de emergencia:
    // "Buscar Item por Título Exacto del Rival". 
    // Esto encuentra una publicación de un vendedor real vendiendo ese producto.
    if (rPrice === 0) {
        console.log("⚠️ Rival tiene Precio $0. Buscando publicación alternativa...");
        const altSearchUrl = `https://api.mercadolibre.com/sites/MLA/search?q=${encodeURIComponent(rTitle)}&sort=sold_quantity_desc&limit=1`;
        const altSearch = await fetchAuth(altSearchUrl, token);
        
        if (altSearch && altSearch.results && altSearch.results.length > 0) {
            const altItem = altSearch.results[0];
            rPrice = altItem.price; // Este sí tiene precio
            rLink = altItem.permalink;
            rThumb = altItem.thumbnail;
            console.log(`✅ Precio recuperado de item alternativo: $${rPrice}`);
        }
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
                id: bestRivalId,
                title: rTitle,
                price: rPrice,
                thumbnail: rThumb,
                permalink: rLink,
                sold_quantity: rSold,
                condition: rivalFinal.condition
            }
        }
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}